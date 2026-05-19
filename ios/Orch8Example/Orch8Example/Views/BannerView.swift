import SwiftUI

struct BannerView: View {
    let banner: BannerInfo
    let onDismiss: () -> Void

    var body: some View {
        VStack {
            HStack(spacing: 12) {
                Image(systemName: banner.style.icon)
                    .font(.title2)
                    .foregroundColor(.white)

                VStack(alignment: .leading, spacing: 2) {
                    Text(banner.title)
                        .font(.headline)
                        .foregroundColor(.white)
                    Text(banner.message)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.9))
                        .lineLimit(3)
                }

                Spacer()

                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark")
                        .foregroundColor(.white.opacity(0.8))
                }
            }
            .padding()
            .background(banner.style.color, in: RoundedRectangle(cornerRadius: 12))
            .shadow(radius: 8)
            .padding(.horizontal)

            Spacer()
        }
        .padding(.top, 8)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                onDismiss()
            }
        }
    }
}
