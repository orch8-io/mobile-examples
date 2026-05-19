// swift-tools-version:5.9

// This Package.swift is used to resolve the Orch8Mobile dependency.
// The actual app uses this as a local package reference.

import PackageDescription

let package = Package(
    name: "Orch8ExampleDeps",
    platforms: [.iOS(.v16)],
    dependencies: [
        .package(path: "../../../engine/packages/swift"),
    ],
    targets: []
)
