import SwiftUI
import UIKit
import Orch8Mobile

struct BannerInfo: Identifiable {
    let id = UUID()
    let title: String
    let message: String
    let style: BannerStyle
}

enum BannerStyle {
    case success, error, warning, info

    var color: Color {
        switch self {
        case .success: return .green
        case .error: return .red
        case .warning: return .orange
        case .info: return .blue
        }
    }

    var icon: String {
        switch self {
        case .success: return "checkmark.circle.fill"
        case .error: return "xmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .info: return "info.circle.fill"
        }
    }
}

struct ApprovalRequest: Identifiable {
    let id = UUID()
    let instanceId: String
    let stepName: String
    let prompt: String
    let choices: [(label: String, value: String)]
}

struct WorkflowStatus: Identifiable {
    let id: String
    let name: String
    var state: String
    var currentStep: String?
    var updatedAt: String
    var dedupKey: String?
    var createdAt: String?
}

@MainActor
class Orch8Manager: ObservableObject {
    @Published var activeBanner: BannerInfo?
    @Published var pendingApproval: ApprovalRequest?
    @Published var activeWorkflows: [WorkflowStatus] = []
    @Published var completedWorkflows: [WorkflowStatus] = []
    @Published var engineReady = false
    @Published var loadedSequenceNames: [String] = []
    @Published var engineInfo: String = ""

    private var engine: MobileEngine?
    private let listener = ExampleEngineListener()
    private var batteryObservers: [NSObjectProtocol] = []
    private var setupTask: Task<Void, Never>?

    static let sequencesUrl = "http://localhost:8080/sequences.json"

    static let workflowNames = [
        "onboarding-flow",
        "payment-verification",
        "feature-access",
    ]

    init() {
        setupTask = Task { await setupEngine() }
    }

    private func setupEngine() async {
        let dbPath = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("orch8-example.db")
            .path

        let config = MobileEngineConfig(
            tickIntervalMs: 200,
            maxConcurrentSteps: 4,
            maxStepsPerInstance: 1000,
            maxConcurrentInstances: 10,
            maxTickDurationMs: 5000,
            maxInstanceLifetimeSecs: 86400,
            maxStoredSequences: 50,
            maxSequenceSizeBytes: 1_048_576,
            handlerTimeoutMs: 30000,
            operationTimeoutMs: 10000,
            telemetryEnabled: true,
            environment: "development",
            rootPublicKey: "",
            sdkVersion: "0.1.0",
            memoryBudgetBytes: 0,
            sequencesUrl: Self.sequencesUrl
        )

        engineInfo = "tick=\(config.tickIntervalMs)ms | concurrent=\(config.maxConcurrentSteps) steps, \(config.maxConcurrentInstances) instances | timeout=\(config.handlerTimeoutMs / 1000)s | env=\(config.environment)"

        do {
            let eng = try MobileEngine(dbPath: dbPath, config: config)
            registerHandlers(engine: eng)

            listener.onPendingStep = { [weak self] instanceId, stepName, handler in
                Task { @MainActor in
                    self?.handlePendingStep(instanceId: instanceId, stepName: stepName, handler: handler)
                }
            }
            listener.onCompleted = { [weak self] instanceId, output in
                Task { @MainActor in
                    self?.handleCompleted(instanceId: instanceId, output: output)
                }
            }
            listener.onFailed = { [weak self] instanceId, error in
                Task { @MainActor in
                    self?.handleFailed(instanceId: instanceId, error: error)
                }
            }
            eng.setListener(listener: listener)

            let device = UIDevice.current
            let context = DeviceContext(
                deviceId: device.identifierForVendor?.uuidString ?? "unknown",
                osName: device.systemName,
                osVersion: device.systemVersion,
                appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0",
                sdkVersion: "0.1.0"
            )
            try eng.setDeviceContext(context: context)
            fputs("[app] Device context set: \(context.osName) \(context.osVersion), app \(context.appVersion)\n", stderr)

            setupBatteryMonitoring(engine: eng)

            do {
                // Empty string tells the engine to use config.sequencesUrl
                let count = try eng.loadSequencesFromUrl(url: "")
                fputs("[app] Loaded \(count) sequences from \(Self.sequencesUrl)\n", stderr)
            } catch {
                fputs("[app] Failed to load sequences from URL: \(error)\n", stderr)
            }

            refreshLoadedSequences(engine: eng)

            self.engine = eng
            self.engineReady = true

            eng.resume()
        } catch {
            fputs("[app] Failed to initialize engine: \(error)\n", stderr)
        }
    }

    private func setupBatteryMonitoring(engine: MobileEngine) {
        UIDevice.current.isBatteryMonitoringEnabled = true
        reportCurrentBatteryState(engine: engine)

        let stateObserver = NotificationCenter.default.addObserver(
            forName: UIDevice.batteryStateDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let engine = self?.engine else { return }
            self?.reportCurrentBatteryState(engine: engine)
        }

        let levelObserver = NotificationCenter.default.addObserver(
            forName: UIDevice.batteryLevelDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let engine = self?.engine else { return }
            self?.reportCurrentBatteryState(engine: engine)
        }

        batteryObservers = [stateObserver, levelObserver]
    }

    private func reportCurrentBatteryState(engine: MobileEngine) {
        let device = UIDevice.current
        let level = device.batteryLevel
        let uiState = device.batteryState

        let powerState: PowerState
        switch uiState {
        case .charging, .full:
            powerState = .charging
        case .unplugged:
            if level >= 0 && level <= 0.05 {
                powerState = .criticalBattery
            } else if level > 0.05 && level <= 0.20 {
                powerState = .lowBattery
            } else {
                powerState = .unplugged
            }
        default:
            powerState = .unplugged
        }

        do {
            try engine.reportPowerState(state: powerState)
            fputs("[app] Reported power state: \(powerState), battery level: \(level)\n", stderr)
        } catch {
            fputs("[app] Failed to report power state: \(error)\n", stderr)
        }
    }

    private func refreshLoadedSequences(engine: MobileEngine) {
        do {
            let sequences = try engine.loadedSequences()
            loadedSequenceNames = sequences.map { $0.name }
            fputs("[app] Loaded sequences: \(loadedSequenceNames)\n", stderr)
        } catch {
            fputs("[app] Failed to get loaded sequences: \(error)\n", stderr)
        }
    }

    private func registerHandlers(engine: MobileEngine) {
        let handlers: [(String, ExampleStepHandler)] = [
            ("init_profile", ExampleStepHandler { _, input in
                "{\"status\":\"profile_initialized\",\"timestamp\":\"\(ISO8601DateFormatter().string(from: Date()))\"}"
            }),
            ("validate_email", ExampleStepHandler { _, input in
                "{\"valid\":true,\"email\":\"user@example.com\"}"
            }),
            ("show_terms", ExampleStepHandler { _, _ in "{\"shown\":true}" }),
            ("collect_preferences", ExampleStepHandler { _, _ in "{\"collected\":true}" }),
            ("setup_notifications", ExampleStepHandler { _, _ in "{\"configured\":true}" }),
            ("request_approval", ExampleStepHandler { _, _ in "{\"requested\":true}" }),
            ("complete_onboarding", ExampleStepHandler { _, _ in "{\"completed\":true}" }),
            ("init_payment", ExampleStepHandler { _, input in
                "{\"payment_id\":\"PAY-\(UUID().uuidString.prefix(8))\",\"status\":\"initialized\"}"
            }),
            ("validate_amount", ExampleStepHandler { _, _ in "{\"valid\":true,\"amount\":99.99}" }),
            ("fraud_check", ExampleStepHandler { _, _ in "{\"passed\":true,\"score\":0.15}" }),
            ("risk_assessment", ExampleStepHandler { _, _ in "{\"risk_level\":\"low\",\"score\":0.2}" }),
            ("compliance_check", ExampleStepHandler { _, _ in "{\"compliant\":true,\"checks\":[\"AML\",\"KYC\"]}" }),
            ("process_payment", ExampleStepHandler { _, _ in "{\"processed\":true,\"transaction_id\":\"TXN-001\"}" }),
            ("send_receipt", ExampleStepHandler { _, _ in "{\"receipt_sent\":true}" }),
            ("check_eligibility", ExampleStepHandler { _, _ in "{\"eligible\":true}" }),
            ("fetch_feature_config", ExampleStepHandler { _, _ in "{\"feature\":\"premium_analytics\",\"available\":true}" }),
            ("evaluate_rules", ExampleStepHandler { _, _ in "{\"rules_passed\":true}" }),
            ("request_consent", ExampleStepHandler { _, _ in "{\"consent_shown\":true}" }),
            ("verify_identity", ExampleStepHandler { _, _ in "{\"verified\":true,\"method\":\"biometric\"}" }),
            ("activate_feature", ExampleStepHandler { _, _ in "{\"activated\":true,\"feature\":\"premium_analytics\"}" }),
            ("show_banner", ExampleStepHandler { [weak self] _, input in
                if let data = input.data(using: .utf8),
                   let params = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    let title = params["title"] as? String ?? "Notice"
                    let message = params["message"] as? String ?? ""
                    let styleStr = params["style"] as? String ?? "info"
                    let style: BannerStyle = switch styleStr {
                    case "success": .success
                    case "error": .error
                    case "warning": .warning
                    default: .info
                    }
                    Task { @MainActor in
                        self?.activeBanner = BannerInfo(title: title, message: message, style: style)
                    }
                }
                return "{\"banner_shown\":true}"
            }),
        ]

        for (name, handler) in handlers {
            do {
                try engine.registerHandler(name: name, handler: handler)
            } catch {
                fputs("[app] Failed to register handler '\(name)': \(error)\n", stderr)
            }
        }
    }

    func startWorkflow(name: String, input: [String: Any] = [:], dedupKey: String? = nil) {
        guard let engine = engine else { return }
        let inputJson: String
        do {
            let inputData = try JSONSerialization.data(withJSONObject: input)
            inputJson = String(data: inputData, encoding: .utf8) ?? "{}"
        } catch {
            activeBanner = BannerInfo(
                title: "Error",
                message: "Failed to serialize input: \(error.localizedDescription)",
                style: .error
            )
            return
        }

        let generatedDedupKey = dedupKey ?? "\(name)-\(UUID().uuidString.prefix(8))"
        let now = ISO8601DateFormatter().string(from: Date())

        Task.detached { [weak self] in
            do {
                let instanceId = try engine.start(
                    sequenceName: name,
                    input: inputJson,
                    dedupKey: generatedDedupKey
                )
                let status = WorkflowStatus(
                    id: instanceId,
                    name: name,
                    state: "Scheduled",
                    currentStep: nil,
                    updatedAt: now,
                    dedupKey: generatedDedupKey,
                    createdAt: now
                )
                await MainActor.run {
                    self?.activeWorkflows.append(status)
                }
                fputs("[app] Started workflow '\(name)' instance=\(instanceId) dedup=\(generatedDedupKey)\n", stderr)
            } catch {
                fputs("[app] Failed to start workflow '\(name)': \(error)\n", stderr)
                await MainActor.run {
                    self?.activeBanner = BannerInfo(
                        title: "Error",
                        message: "Failed to start \(name): \(error.localizedDescription)",
                        style: .error
                    )
                }
            }
        }
    }

    func dismissBanner() {
        activeBanner = nil
    }

    func resolveApproval(decision: String) {
        guard let approval = pendingApproval, let engine = engine else { return }
        pendingApproval = nil

        if let idx = activeWorkflows.firstIndex(where: { $0.id == approval.instanceId }) {
            activeWorkflows[idx].state = "Running"
            activeWorkflows[idx].currentStep = "Processing \(decision)..."
        }

        Task.detached {
            do {
                let outputData = try JSONSerialization.data(withJSONObject: ["value": decision])
                let output = String(data: outputData, encoding: .utf8) ?? "{}"
                try engine.completeStep(
                    instanceId: approval.instanceId,
                    stepName: approval.stepName,
                    output: output
                )
            } catch {
                fputs("[app] Failed to resolve approval: \(error)\n", stderr)
            }
        }
    }

    func refreshWorkflowStates() {
        guard let engine = engine else { return }
        do {
            let active = try engine.activeInstances()
            for summary in active {
                if let idx = activeWorkflows.firstIndex(where: { $0.id == summary.instanceId }) {
                    activeWorkflows[idx].state = "\(summary.state)"
                }
            }
        } catch {
            fputs("[app] Failed to refresh states: \(error)\n", stderr)
        }
    }

    func cancelWorkflow(instanceId: String) {
        guard let engine = engine else { return }
        activeWorkflows.removeAll { $0.id == instanceId }

        Task.detached {
            do {
                try engine.cancelInstance(instanceId: instanceId)
            } catch {
                fputs("[app] Failed to cancel workflow: \(error)\n", stderr)
            }
        }
    }

    func pauseEngine() {
        guard let engine = engine else { return }
        do {
            try engine.pause()
            fputs("[app] Engine paused\n", stderr)
        } catch {
            fputs("[app] Failed to pause engine: \(error)\n", stderr)
        }
    }

    func resumeEngine() {
        guard let engine = engine else { return }
        engine.resume()
        fputs("[app] Engine resumed\n", stderr)
    }

    func shutdownEngine() {
        setupTask?.cancel()
        setupTask = nil

        guard let engine = engine else { return }
        do {
            try engine.flushTelemetry()
            try engine.shutdown()
            fputs("[app] Engine shut down\n", stderr)
        } catch {
            fputs("[app] Failed to shut down engine: \(error)\n", stderr)
        }

        for observer in batteryObservers {
            NotificationCenter.default.removeObserver(observer)
        }
        batteryObservers.removeAll()
    }

    func reportPowerState(_ state: PowerState) {
        guard let engine = engine else { return }
        do {
            try engine.reportPowerState(state: state)
            fputs("[app] Manually reported power state: \(state)\n", stderr)
        } catch {
            fputs("[app] Failed to report power state: \(error)\n", stderr)
        }
    }

    func onPushReceived() {
        guard let engine = engine else { return }
        do {
            try engine.onPushReceived()
            fputs("[app] Push received — forced immediate sync\n", stderr)
        } catch {
            fputs("[app] Failed to handle push: \(error)\n", stderr)
        }
    }

    func getLoadedSequences() -> [SequenceInfo] {
        guard let engine = engine else { return [] }
        do {
            return try engine.loadedSequences()
        } catch {
            fputs("[app] Failed to get loaded sequences: \(error)\n", stderr)
            return []
        }
    }

    func getInstanceDetail(instanceId: String) -> InstanceSummary? {
        guard let engine = engine else { return nil }
        do {
            return try engine.getInstance(instanceId: instanceId)
        } catch {
            fputs("[app] Failed to get instance detail: \(error)\n", stderr)
            return nil
        }
    }

    private func handlePendingStep(instanceId: String, stepName: String, handler: String) {
        if let idx = activeWorkflows.firstIndex(where: { $0.id == instanceId }) {
            activeWorkflows[idx].state = "Waiting"
            activeWorkflows[idx].currentStep = stepName
        }

        if handler == "request_approval" || handler == "show_terms" || handler == "request_consent" {
            let prompt: String
            let choices: [(String, String)]
            switch handler {
            case "show_terms":
                prompt = "Please review and accept the Terms of Service."
                choices = [("Accept", "accepted"), ("Decline", "declined")]
            case "request_consent":
                prompt = "This feature collects usage data. Do you consent?"
                choices = [("I Agree", "consented"), ("No Thanks", "declined")]
            default:
                prompt = "Action requires approval. Please review and decide."
                choices = [("Approve", "approved"), ("Reject", "rejected")]
            }
            pendingApproval = ApprovalRequest(
                instanceId: instanceId,
                stepName: stepName,
                prompt: prompt,
                choices: choices
            )
        } else if handler == "collect_preferences" || handler == "setup_notifications" {
            guard let engine = engine else { return }
            let output: String
            switch handler {
            case "collect_preferences":
                output = "{\"value\":\"tech,news\"}"
            default:
                output = "{\"value\":\"enabled\"}"
            }
            Task.detached {
                do {
                    try engine.completeStep(instanceId: instanceId, stepName: stepName, output: output)
                } catch {
                    fputs("[app] Failed to auto-complete step \(stepName): \(error)\n", stderr)
                }
            }
        }
    }

    private func handleCompleted(instanceId: String, output: String) {
        if let idx = activeWorkflows.firstIndex(where: { $0.id == instanceId }) {
            var workflow = activeWorkflows.remove(at: idx)
            workflow.state = "Completed"
            workflow.updatedAt = ISO8601DateFormatter().string(from: Date())
            completedWorkflows.insert(workflow, at: 0)
        }
    }

    private func handleFailed(instanceId: String, error: String) {
        if let idx = activeWorkflows.firstIndex(where: { $0.id == instanceId }) {
            var workflow = activeWorkflows.remove(at: idx)
            workflow.state = "Failed"
            workflow.updatedAt = ISO8601DateFormatter().string(from: Date())
            completedWorkflows.insert(workflow, at: 0)
        }
        activeBanner = BannerInfo(
            title: "Workflow Failed",
            message: error,
            style: .error
        )
    }
}
