import SwiftUI

struct WorkflowDetailView: View {
    @EnvironmentObject var orchestrator: Orch8Manager
    @State private var refreshedState: String?
    @State private var refreshedStep: String?
    let workflow: WorkflowStatus

    var body: some View {
        VStack(spacing: 24) {
            VStack(spacing: 12) {
                Image(systemName: stateIcon)
                    .font(.system(size: 48))
                    .foregroundColor(stateColor)

                Text(workflow.name)
                    .font(.title2)
                    .fontWeight(.bold)

                Text(displayState)
                    .font(.headline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(stateColor.opacity(0.15))
                    .foregroundColor(stateColor)
                    .clipShape(Capsule())
            }
            .padding(.top, 20)

            GroupBox("Details") {
                VStack(alignment: .leading, spacing: 8) {
                    DetailRow(label: "Instance ID", value: workflow.id)
                    DetailRow(label: "State", value: displayState)
                    if let step = refreshedStep ?? workflow.currentStep {
                        DetailRow(label: "Current Step", value: step)
                    }
                    if let dedupKey = workflow.dedupKey {
                        DetailRow(label: "Dedup Key", value: dedupKey)
                    }
                    if let createdAt = workflow.createdAt {
                        DetailRow(label: "Created", value: createdAt)
                    }
                    DetailRow(label: "Updated", value: workflow.updatedAt)
                }
                .padding(.vertical, 4)
            }

            GroupBox("Engine") {
                VStack(alignment: .leading, spacing: 8) {
                    DetailRow(label: "Status", value: orchestrator.engineReady ? "Ready" : "Not Ready")
                    DetailRow(label: "Sequences", value: "\(orchestrator.loadedSequenceNames.count) loaded")
                    Text(orchestrator.engineInfo)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }

            HStack(spacing: 16) {
                Button {
                    if let summary = orchestrator.getInstanceDetail(instanceId: workflow.id) {
                        refreshedState = "\(summary.state)"
                        refreshedStep = workflow.currentStep
                    }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                if workflow.state == "Waiting" || workflow.state == "Running" || workflow.state == "Scheduled" {
                    Button(role: .destructive) {
                        orchestrator.cancelWorkflow(instanceId: workflow.id)
                    } label: {
                        Label("Cancel", systemImage: "xmark.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }

            Spacer()
        }
        .padding()
        .navigationTitle("Workflow Details")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var displayState: String {
        refreshedState ?? workflow.state
    }

    private var stateIcon: String {
        switch displayState {
        case "Scheduled": return "clock.fill"
        case "Running": return "arrow.triangle.2.circlepath"
        case "Waiting": return "pause.circle.fill"
        case "Completed": return "checkmark.circle.fill"
        case "Failed": return "xmark.circle.fill"
        case "Cancelled": return "minus.circle.fill"
        default: return "questionmark.circle"
        }
    }

    private var stateColor: Color {
        switch displayState {
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

struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.medium)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .font(.subheadline)
    }
}
