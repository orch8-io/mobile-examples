import SwiftUI

struct ContentView: View {
    @EnvironmentObject var orchestrator: Orch8Manager

    var body: some View {
        NavigationStack {
            WorkflowListView()
                .navigationTitle("orch8 Examples")
        }
        .overlay {
            if let banner = orchestrator.activeBanner {
                BannerView(banner: banner) {
                    orchestrator.dismissBanner()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .animation(.spring(response: 0.4), value: orchestrator.activeBanner != nil)
            }
        }
        .overlay {
            if let approval = orchestrator.pendingApproval {
                ApprovalView(approval: approval) { decision in
                    orchestrator.resolveApproval(decision: decision)
                }
            }
        }
    }
}
