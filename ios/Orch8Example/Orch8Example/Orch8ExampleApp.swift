import SwiftUI

@main
struct Orch8ExampleApp: App {
    @StateObject private var orchestrator = Orch8Manager()
    @Environment(\.scenePhase) var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(orchestrator)
                .onOpenURL { url in
                    switch url.host {
                    case "start":
                        if let name = url.pathComponents.dropFirst().first {
                            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
                            let dedupKey = components?.queryItems?.first(where: { $0.name == "dedup" })?.value
                            orchestrator.startWorkflow(name: name, dedupKey: dedupKey)
                        }
                    case "approve":
                        orchestrator.resolveApproval(decision: "approved")
                    case "reject":
                        orchestrator.resolveApproval(decision: "rejected")
                    default:
                        break
                    }
                }
                .onChange(of: scenePhase) { newPhase in
                    switch newPhase {
                    case .active:
                        orchestrator.resumeEngine()
                    case .inactive:
                        break
                    case .background:
                        orchestrator.pauseEngine()
                    @unknown default:
                        break
                    }
                }
        }
    }
}
