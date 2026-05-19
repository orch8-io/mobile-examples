import SwiftUI

struct ApprovalView: View {
    let approval: ApprovalRequest
    let onDecision: (String) -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "person.fill.questionmark")
                    .font(.system(size: 40))
                    .foregroundColor(.accentColor)

                Text("Approval Required")
                    .font(.title2)
                    .fontWeight(.bold)

                Text(approval.prompt)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                    .padding(.horizontal)

                Text("Instance: \(String(approval.instanceId.prefix(8)))...")
                    .font(.caption)
                    .foregroundColor(.secondary)

                VStack(spacing: 12) {
                    ForEach(approval.choices, id: \.value) { choice in
                        Button {
                            onDecision(choice.value)
                        } label: {
                            Text(choice.label)
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(buttonColor(for: choice.value))
                        .accessibilityIdentifier("choice-\(choice.value)")
                    }
                }
                .padding(.horizontal)
            }
            .padding(24)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
            .padding(32)
        }
    }

    private func buttonColor(for value: String) -> Color {
        switch value {
        case "approved", "accepted", "consented": return .green
        case "rejected", "declined", "denied": return .red
        default: return .accentColor
        }
    }
}
