import Foundation
import Orch8Mobile

final class ExampleStepHandler: StepHandler, @unchecked Sendable {
    private let handler: (String, String) -> String

    init(handler: @escaping (String, String) -> String) {
        self.handler = handler
    }

    func execute(stepName: String, input: String) throws -> String {
        fputs("[app] handler execute: \(stepName)\n", stderr)
        return handler(stepName, input)
    }
}

final class ExampleEngineListener: EngineListener, @unchecked Sendable {
    var onCompleted: ((String, String) -> Void)?
    var onFailed: ((String, String) -> Void)?
    var onPendingStep: ((String, String, String) -> Void)?

    func onInstanceCompleted(instanceId: String, output: String) {
        fputs("[app] onInstanceCompleted: \(instanceId)\n", stderr)
        onCompleted?(instanceId, output)
    }

    func onInstanceFailed(instanceId: String, error: String) {
        fputs("[app] onInstanceFailed: \(instanceId) error=\(error)\n", stderr)
        onFailed?(instanceId, error)
    }

    func onStepPending(instanceId: String, stepName: String, handler: String) {
        fputs("[app] onStepPending: \(instanceId) step=\(stepName) handler=\(handler)\n", stderr)
        onPendingStep?(instanceId, stepName, handler)
    }
}
