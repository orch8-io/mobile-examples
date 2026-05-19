import SwiftUI

struct WorkflowListView: View {
    @EnvironmentObject var orchestrator: Orch8Manager

    var body: some View {
        List {
            if orchestrator.engineReady {
                Section {
                    HStack(spacing: 8) {
                        Image(systemName: "engine.combustion.fill")
                            .foregroundColor(.green)
                        Text(orchestrator.engineInfo)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    if !orchestrator.loadedSequenceNames.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "doc.text.fill")
                                .foregroundColor(.blue)
                            Text("\(orchestrator.loadedSequenceNames.count) sequences loaded: \(orchestrator.loadedSequenceNames.joined(separator: ", "))")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                } header: {
                    Text("Engine Status")
                }
            }

            Section("Start a Workflow") {
                ForEach(Orch8Manager.workflowNames, id: \.self) { name in
                    Button {
                        orchestrator.startWorkflow(name: name, input: sampleInput(for: name))
                    } label: {
                        HStack {
                            Image(systemName: icon(for: name))
                                .foregroundColor(color(for: name))
                                .font(.title2)
                                .frame(width: 36)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(displayName(for: name))
                                    .font(.headline)
                                Text(description(for: name))
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            Image(systemName: "play.circle.fill")
                                .foregroundColor(.accentColor)
                                .font(.title2)
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("launch-\(name)")
                }
            }

            if !orchestrator.activeWorkflows.isEmpty {
                Section("Active") {
                    ForEach(orchestrator.activeWorkflows) { workflow in
                        NavigationLink {
                            WorkflowDetailView(workflow: workflow)
                        } label: {
                            WorkflowRow(workflow: workflow)
                        }
                    }
                }
            }

            if !orchestrator.completedWorkflows.isEmpty {
                Section("History") {
                    ForEach(orchestrator.completedWorkflows) { workflow in
                        WorkflowRow(workflow: workflow)
                    }
                }
            }
        }
        .refreshable {
            orchestrator.refreshWorkflowStates()
        }
    }

    private func displayName(for name: String) -> String {
        switch name {
        case "onboarding-flow": return "User Onboarding"
        case "payment-verification": return "Payment Verification"
        case "feature-access": return "Feature Access Control"
        default: return name
        }
    }

    private func description(for name: String) -> String {
        switch name {
        case "onboarding-flow":
            return "10 steps \u{2014} email validation, terms acceptance (wait), preferences (wait), notifications (wait), admin approval (wait), conditional routing, success/rejection banners"
        case "payment-verification":
            return "10 steps \u{2014} amount validation, fraud check, risk assessment, compliance, payment approval (wait), conditional routing, success banner + receipt or rejection banner"
        case "feature-access":
            return "10 steps \u{2014} eligibility, config, rules, consent (wait), identity verification, access approval (wait), dual routing, access granted or denied/limited banners"
        default:
            return "Run this workflow"
        }
    }

    private func icon(for name: String) -> String {
        switch name {
        case "onboarding-flow": return "person.badge.plus"
        case "payment-verification": return "creditcard.fill"
        case "feature-access": return "lock.open.fill"
        default: return "gearshape"
        }
    }

    private func color(for name: String) -> Color {
        switch name {
        case "onboarding-flow": return .blue
        case "payment-verification": return .green
        case "feature-access": return .purple
        default: return .gray
        }
    }

    private func sampleInput(for name: String) -> [String: Any] {
        switch name {
        case "onboarding-flow":
            return ["user_email": "alice@example.com", "user_name": "Alice Johnson", "signup_source": "referral", "tier": "premium"]
        case "payment-verification":
            return ["amount": 249.99, "currency": "USD", "merchant": "Orch8 Store", "customer_email": "alice@example.com", "items": 3]
        case "feature-access":
            return ["user_id": "usr_alice_001", "feature": "premium_analytics", "current_tier": "free", "account_age_days": 90]
        default:
            return [:]
        }
    }
}

struct WorkflowRow: View {
    let workflow: WorkflowStatus

    var body: some View {
        HStack {
            Circle()
                .fill(stateColor)
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(workflow.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                if let step = workflow.currentStep {
                    Text(step)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            Text(workflow.state)
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(stateColor.opacity(0.15))
                .foregroundColor(stateColor)
                .clipShape(Capsule())
        }
        .padding(.vertical, 2)
    }

    private var stateColor: Color {
        switch workflow.state {
        case "Scheduled": return .blue
        case "Running": return .orange
        case "Waiting": return .yellow
        case "Completed": return .green
        case "Failed": return .red
        case "Cancelled": return .gray
        default: return .secondary
        }
    }
}
