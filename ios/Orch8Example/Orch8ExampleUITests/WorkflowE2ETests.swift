import XCTest

final class WorkflowE2ETests: XCTestCase {

    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
        app.launch()
    }

    // MARK: - Onboarding

    func testOnboardingApproveFlow() {
        app.buttons["launch-onboarding-flow"].tap()

        // Terms acceptance — manual
        waitForApprovalAndChoose("choice-accepted")

        // collect_preferences and setup_notifications are auto-completed by the manager

        // Admin approval — manual
        waitForApprovalAndChoose("choice-approved")

        waitForCompletion("onboarding-flow")
    }

    func testOnboardingRejectFlow() {
        app.buttons["launch-onboarding-flow"].tap()

        waitForApprovalAndChoose("choice-accepted")

        // After auto-completed preferences and notifications, admin rejects
        waitForApprovalAndChoose("choice-rejected")

        waitForCompletion("onboarding-flow")
    }

    func testOnboardingDeclineTermsFlow() {
        app.buttons["launch-onboarding-flow"].tap()

        waitForApprovalAndChoose("choice-declined")

        waitForCompletion("onboarding-flow")
    }

    // MARK: - Payment Verification

    func testPaymentApproveFlow() {
        app.buttons["launch-payment-verification"].tap()

        waitForApprovalAndChoose("choice-approved")

        waitForCompletion("payment-verification")
    }

    func testPaymentRejectFlow() {
        app.buttons["launch-payment-verification"].tap()

        waitForApprovalAndChoose("choice-rejected")

        waitForCompletion("payment-verification")
    }

    // MARK: - Feature Access

    func testFeatureAccessFullApproveFlow() {
        app.buttons["launch-feature-access"].tap()

        waitForApprovalAndChoose("choice-consented")
        waitForApprovalAndChoose("choice-approved")

        waitForCompletion("feature-access")
    }

    func testFeatureAccessDenyFlow() {
        app.buttons["launch-feature-access"].tap()

        waitForApprovalAndChoose("choice-consented")
        waitForApprovalAndChoose("choice-denied")

        waitForCompletion("feature-access")
    }

    func testFeatureAccessDeclineConsentFlow() {
        app.buttons["launch-feature-access"].tap()

        waitForApprovalAndChoose("choice-declined")

        waitForCompletion("feature-access")
    }

    // MARK: - Helpers

    private func waitForApprovalAndChoose(_ buttonId: String, timeout: TimeInterval = 10) {
        let button = app.buttons[buttonId]
        let exists = button.waitForExistence(timeout: timeout)
        XCTAssertTrue(exists, "Expected approval button '\(buttonId)' to appear within \(timeout)s")
        button.tap()
    }

    private func waitForCompletion(_ workflowName: String, timeout: TimeInterval = 15) {
        let completed = app.staticTexts["Completed"]
        let exists = completed.waitForExistence(timeout: timeout)
        XCTAssertTrue(exists, "Expected '\(workflowName)' to show Completed state within \(timeout)s")
    }
}
