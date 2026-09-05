// swift-tools-version:5.9

// This Package.swift mirrors the app project's clean-room remote dependency.

import PackageDescription

let package = Package(
    name: "Orch8ExampleDeps",
    platforms: [.iOS(.v16)],
    dependencies: [
        .package(
            url: "https://github.com/orch8-io/orch8-mobile-swift",
            exact: "0.7.1"
        ),
    ],
    targets: []
)
