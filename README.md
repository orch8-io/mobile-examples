# orch8.io Mobile Examples

Example iOS (SwiftUI) and Android (Kotlin/Jetpack Compose) apps demonstrating the orch8.io mobile workflow engine. Each app runs **3 workflows with 10 steps each**, featuring wait states, approval gates, dynamic banners, and conditional routing — all visible in the orch8.io dashboard.

## Workflows

### 1. User Onboarding (`onboarding-flow`)
Profile init → email validation → **terms acceptance (wait)** → preferences → notifications → **admin approval (wait)** → welcome banner / rejection notice → completion

### 2. Payment Verification (`payment-verification`)
Payment init → amount validation → fraud check → risk assessment → compliance check → **payment approval (wait)** → process + success banner + receipt / decline banner + refund

### 3. Feature Access Control (`feature-access`)
Eligibility check → config fetch → rules evaluation → **consent request (wait)** → identity verification → **access approval (wait)** → access granted banner + activation / denied banner / limited mode

Each workflow demonstrates:
- **Wait for input**: Steps pause execution until user provides input
- **Approval gates**: Approve/reject decisions with `wait_for_input` and `choices`
- **Conditional routing**: `router` blocks branch based on approval decisions
- **Banner display**: Success/error/warning/info banners shown via `show_banner` handler
- **Alternative actions**: Rejection paths trigger refunds, restricted mode, or notices

## Project Structure

```
mobile-examples/
├── workflows/                          # Shared workflow JSON definitions
│   ├── onboarding-flow.json
│   ├── payment-verification.json
│   └── feature-access.json
├── sequences.json                      # All 3 workflows bundled (for loadSequencesFromUrl)
├── ios/Orch8Example/                   # iOS app (SwiftUI)
│   ├── Orch8Example.xcodeproj/
│   ├── Package.swift                   # SPM dependency on Orch8Mobile
│   └── Orch8Example/
│       ├── Orch8ExampleApp.swift       # App entry + lifecycle (scenePhase) + deep links
│       ├── ContentView.swift           # Root view with banner + approval overlays
│       ├── Engine/
│       │   ├── Orch8Manager.swift      # Engine lifecycle, handlers, battery, sync, state
│       │   └── StepHandlers.swift      # StepHandler + EngineListener bridges
│       ├── Views/
│       │   ├── WorkflowListView.swift  # Launch workflows + engine info + active/history
│       │   ├── WorkflowDetailView.swift# Instance details + dedup key + engine status
│       │   ├── ApprovalView.swift      # Modal approval dialog with dynamic choices
│       │   └── BannerView.swift        # Toast-style auto-dismissing banner
│       └── Resources/workflows/        # Bundled JSON definitions
└── android/                            # Android app (Kotlin + Compose)
    ├── build.gradle.kts
    ├── settings.gradle.kts
    └── app/
        ├── build.gradle.kts            # Includes lifecycle-process dependency
        └── src/main/
            ├── AndroidManifest.xml     # Deep links (orch8://start) + singleTop
            ├── java/io/orch8/example/
            │   ├── Orch8ExampleApp.kt  # Application + ProcessLifecycleOwner + battery
            │   ├── MainActivity.kt     # Deep link + push notification intent handling
            │   ├── Orch8Manager.kt     # Engine lifecycle, handlers, battery, sync, state
            │   └── ui/
            │       ├── MainScreen.kt   # Full Compose UI with engine info + expandable cards
            │       └── theme/Theme.kt
            └── res/raw/                # Bundled JSON definitions
```

## Setup

### Prerequisites

1. Build the orch8 mobile SDK (from repo root):
   ```bash
   cd engine
   # iOS: build xcframework
   cargo build -p orch8-mobile --target aarch64-apple-ios --release
   # Android: build AAR
   ./scripts/build-android-aar.sh --release
   ```

2. Or run the CI workflow (`.github/workflows/mobile.yml`) to produce artifacts.

### iOS

1. Open `ios/Orch8Example/Orch8Example.xcodeproj` in Xcode
2. The project references `engine/packages/swift` as a local SPM package — ensure the xcframework is built
3. Select a simulator or device target
4. Build and run (Cmd+R)

### Android

1. Copy the built AAR to `android/app/libs/`:
   ```bash
   mkdir -p android/app/libs
   cp ../engine/packages/android/orch8-mobile/build/outputs/aar/orch8-mobile-release.aar android/app/libs/
   ```
2. Open `android/` in Android Studio
3. Sync Gradle
4. Run on emulator or device

## MobileEngine API Reference

The `MobileEngine` is the single entry point for the on-device workflow runtime. All methods are thread-safe.

### Initialization

| Method | Signature | Description |
|---|---|---|
| **Constructor** | `MobileEngine(dbPath: String, config: MobileEngineConfig)` | Create engine with SQLite storage at `dbPath`. The database is created if it doesn't exist. All instance state, execution trees, and sync outbox entries are persisted here. |
| **registerHandler** | `registerHandler(name: String, handler: StepHandler)` | Register a native step handler. Must be called before `resume()`. The engine rejects sequences that reference unregistered handlers. |
| **setListener** | `setListener(listener: EngineListener)` | Set the event listener for instance lifecycle callbacks. Only one listener at a time. |
| **setDeviceContext** | `setDeviceContext(context: DeviceContext)` | Set device metadata sent during sync. Call once after engine creation. |

### Lifecycle Management

| Method | Signature | Description |
|---|---|---|
| **resume** | `resume()` | Start the tick loop. Call when app enters foreground. The tick interval is set by `config.tickIntervalMs` and adapts to power state. |
| **pause** | `pause()` | Pause the tick loop. Call when app enters background. In-flight step handlers are allowed to finish. |
| **shutdown** | `shutdown()` | Stop the engine permanently. Flushes pending sync outbox entries. Call on app termination. |
| **tickOnce** | `tickOnce()` | Execute a single tick manually. Useful for testing without starting the tick loop. |

### Workflow Operations

| Method | Signature | Description |
|---|---|---|
| **start** | `start(sequenceName: String, input: String, dedupKey: String?) -> String` | Start a workflow instance. Returns the instance ID. `input` is a JSON string passed to the first step. `dedupKey` prevents duplicate instances from the same trigger (e.g. push notification delivered twice) — if an active instance with the same key exists, the call is rejected. |
| **completeStep** | `completeStep(instanceId: String, stepName: String, output: String)` | Resume a step that is waiting for input. `output` is a JSON string (e.g. `{"value":"approved"}`). The `store_as` field in the step's `wait_for_input` config determines where the value is stored in `context.data` for router conditions. |
| **cancelInstance** | `cancelInstance(instanceId: String)` | Cancel a running or waiting instance immediately. |

### Instance Queries

| Method | Signature | Description |
|---|---|---|
| **activeInstances** | `activeInstances() -> [InstanceSummary]` | List all non-terminal instances (scheduled, running, waiting). |
| **getInstance** | `getInstance(instanceId: String) -> InstanceSummary` | Get the current state of a specific instance. |

**InstanceSummary** fields: `instanceId`, `sequenceName`, `state`, `currentStep` (optional), `createdAt`

### Sequence Management

Three ways to load workflow definitions onto the device:

| Method | Signature | Description |
|---|---|---|
| **loadSequenceFromJson** | `loadSequenceFromJson(json: String)` | Load a single sequence from a JSON string. Use for bundled resources. |
| **loadSequencesFromUrl** | `loadSequencesFromUrl(url: String) -> UInt32` | Fetch and load sequences from a URL. Pass empty string `""` to use `config.sequencesUrl`. Returns the number of sequences loaded. The URL should return a JSON array of sequence definitions. |
| **sync** | `sync(manifestUrl: String, tokenProvider: TokenProvider) -> SyncResult` | Full manifest-based sync with Ed25519 signature verification. The manifest lists available sequences with SHA256 checksums. The engine uses ETag caching to avoid re-downloading unchanged sequences, checks that all referenced handlers are registered, and evicts excess sequences beyond `config.maxStoredSequences`. |
| **loadedSequences** | `loadedSequences() -> [SequenceInfo]` | List all sequences currently loaded in the engine. |

**SequenceInfo** fields: `name`, `version`

### Device & Power State

| Method | Signature | Description |
|---|---|---|
| **setDeviceContext** | `setDeviceContext(context: DeviceContext)` | Set device metadata included in sync payloads. |
| **reportPowerState** | `reportPowerState(state: PowerState)` | Report current battery/power state. The engine adapts its tick interval: `LowBattery` doubles it (2x), `CriticalBattery` quadruples it (4x). This reduces CPU/battery usage when the device is low on power. |

**DeviceContext** fields: `deviceId`, `osName`, `osVersion`, `appVersion`, `sdkVersion`

**PowerState** values:

| Value | Tick Multiplier | When to Report |
|---|---|---|
| `Charging` | 1x (normal) | Device is plugged in or fully charged |
| `Unplugged` | 1x (normal) | Device is on battery, level > 20% |
| `LowBattery` | 2x (slower) | Battery level 5-20% |
| `CriticalBattery` | 4x (slowest) | Battery level < 5% |

### Sync & Telemetry

| Method | Signature | Description |
|---|---|---|
| **onPushReceived** | `onPushReceived()` | Call when a silent push notification arrives. Forces an immediate sync on the next tick, bypassing the normal sync interval. |
| **flushTelemetry** | `flushTelemetry()` | Flush locally recorded telemetry events (step started, step completed, instance state changes) to the sync outbox for delivery to the server. Call before `shutdown()`. |

## Engine Configuration

All fields of `MobileEngineConfig`:

| Field | Type | Default | Description |
|---|---|---|---|
| `tickIntervalMs` | UInt64 | 100 | Engine heartbeat interval in milliseconds. Each tick processes pending steps, checks timeouts, and runs sync. Lower = more responsive, higher = less CPU. |
| `maxConcurrentSteps` | UInt32 | 4 | Maximum number of step handlers executing in parallel across all instances. |
| `maxStepsPerInstance` | UInt32 | 1000 | Safety limit — instance fails if it executes more than this many steps (prevents infinite loops). |
| `maxConcurrentInstances` | UInt32 | 10 | Maximum active instances. `start()` is rejected when the limit is reached. |
| `maxTickDurationMs` | UInt64 | 5000 | Maximum time a single tick can run before yielding. Prevents tick starvation. |
| `maxInstanceLifetimeSecs` | UInt64 | 86400 | Instances older than this (in seconds) are garbage collected. Default is 24 hours. |
| `maxStoredSequences` | UInt32 | 50 | Maximum number of sequence definitions stored locally. Excess are evicted (oldest first) during sync. |
| `maxSequenceSizeBytes` | UInt64 | 1048576 | Maximum size of a single sequence JSON definition (1 MB default). Rejects oversized sequences. |
| `handlerTimeoutMs` | UInt64 | 30000 | Timeout for a single step handler execution. Step fails if the handler doesn't return within this time. |
| `operationTimeoutMs` | UInt64 | 10000 | Timeout for engine internal operations (SQLite queries, sync HTTP calls). |
| `telemetryEnabled` | Bool | true | Whether to record step/instance lifecycle events locally. Events are flushed via `flushTelemetry()` or during sync. |
| `environment` | String | — | Environment label included in telemetry and sync payloads (e.g. "production", "staging"). |
| `rootPublicKey` | String | — | Ed25519 public key (hex-encoded) for verifying manifest signatures during `sync()`. Empty string disables signature verification. |
| `sdkVersion` | String | — | SDK version string included in device context and sync payloads. |
| `memoryBudgetBytes` | UInt64 | 0 | Memory budget for the engine. New instances are rejected when the budget is exceeded. `0` = unlimited. |
| `sequencesUrl` | String | — | Default URL for `loadSequencesFromUrl("")`. Should point to a JSON array of sequence definitions. |

## Handlers & Listeners

### StepHandler Protocol

```swift
// iOS (Swift)
protocol StepHandler {
    func execute(stepName: String, input: String) throws -> String
}

// Android (Kotlin)
interface StepHandler {
    fun execute(stepName: String, input: String): String
}
```

`input` is a JSON string containing the step's `params` merged with `context.data`. The return value is a JSON string written to `context.data` under the step's ID.

The example apps register 21 handlers:

| Handler | Used By | Behavior |
|---|---|---|
| `init_profile` | onboarding | Returns `{"status":"profile_initialized","timestamp":"..."}` |
| `validate_email` | onboarding | Returns `{"valid":true,"email":"user@example.com"}` |
| `show_terms` | onboarding | Returns `{"shown":true}` (step pauses via `wait_for_input`) |
| `collect_preferences` | onboarding | Returns `{"collected":true}` (auto-completed by manager) |
| `setup_notifications` | onboarding | Returns `{"configured":true}` (auto-completed by manager) |
| `request_approval` | onboarding, payment, feature-access | Returns `{"requested":true}` (step pauses via `wait_for_input`) |
| `complete_onboarding` | onboarding | Returns `{"completed":true}` |
| `init_payment` | payment | Returns `{"payment_id":"PAY-...","status":"initialized"}` |
| `validate_amount` | payment | Returns `{"valid":true,"amount":99.99}` |
| `fraud_check` | payment | Returns `{"passed":true,"score":0.15}` |
| `risk_assessment` | payment | Returns `{"risk_level":"low","score":0.2}` |
| `compliance_check` | payment | Returns `{"compliant":true,"checks":["AML","KYC"]}` |
| `process_payment` | payment | Returns `{"processed":true,"transaction_id":"TXN-001"}` |
| `send_receipt` | payment | Returns `{"receipt_sent":true}` |
| `check_eligibility` | feature-access | Returns `{"eligible":true}` |
| `fetch_feature_config` | feature-access | Returns `{"feature":"premium_analytics","available":true}` |
| `evaluate_rules` | feature-access | Returns `{"rules_passed":true}` |
| `request_consent` | feature-access | Returns `{"consent_shown":true}` (step pauses via `wait_for_input`) |
| `verify_identity` | feature-access | Returns `{"verified":true,"method":"biometric"}` |
| `activate_feature` | feature-access | Returns `{"activated":true,"feature":"premium_analytics"}` |
| `show_banner` | all workflows | Parses `title`, `message`, `style` from input JSON and pushes a banner to the UI |

### EngineListener Protocol

```swift
// iOS (Swift)
protocol EngineListener {
    func onInstanceCompleted(instanceId: String, output: String)
    func onInstanceFailed(instanceId: String, error: String)
    func onStepPending(instanceId: String, stepName: String, handler: String)
}

// Android (Kotlin)
interface EngineListener {
    fun onInstanceCompleted(instanceId: String, output: String)
    fun onInstanceFailed(instanceId: String, error: String)
    fun onStepPending(instanceId: String, stepName: String, handler: String)
}
```

| Callback | When | Example App Response |
|---|---|---|
| `onInstanceCompleted` | Instance reaches terminal success state | Move from active list to history |
| `onInstanceFailed` | Instance fails (handler error, timeout, etc.) | Move to history + show error banner |
| `onStepPending` | A step with `wait_for_input` is waiting | Show approval dialog or auto-complete |

## Workflow JSON Schema

Sequences are JSON definitions that describe the workflow structure. Each sequence contains an ordered list of blocks.

### Sequence Fields

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "tenant_id": "mobile",
  "namespace": "default",
  "name": "onboarding-flow",
  "version": 1,
  "deprecated": false,
  "blocks": [ ... ],
  "created_at": "2026-05-17T00:00:00Z"
}
```

### Block Types

The engine supports these block types in a sequence's `blocks` array:

| Block Type | Description |
|---|---|
| `step` | Execute a registered handler. Can pause with `wait_for_input`. |
| `router` | Conditional branching — evaluates route conditions against `context.data` and runs the first matching route's blocks, or the `default` blocks. |
| `parallel` | Run multiple block groups concurrently. All must complete. |
| `race` | Run multiple block groups concurrently. First to complete wins, others are cancelled. |
| `loop` | Repeat blocks while a condition is true. |
| `forEach` | Iterate blocks over a list in `context.data`. |
| `tryCatch` | Try blocks with error handling — catch blocks run on failure. |
| `subSequence` | Embed another sequence by name. |
| `abSplit` | A/B test — route to variant blocks based on configured split percentages. |
| `cancellationScope` | Mark blocks as cancellable with a cleanup handler. |

### Step Block

```json
{
  "type": "step",
  "id": "validate_email",
  "handler": "validate_email",
  "params": { "timeout": 5000 },
  "cancellable": true,
  "wait_for_input": {
    "prompt": "Please verify your email address.",
    "timeout": 300000,
    "choices": [
      { "label": "Accept", "value": "accepted" },
      { "label": "Decline", "value": "declined" }
    ],
    "store_as": "email_decision"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `type` | yes | Must be `"step"` |
| `id` | yes | Unique block ID within the sequence. Used in `completeStep()` and sync payloads. |
| `handler` | yes | Name of the registered `StepHandler` to execute. |
| `params` | no | JSON object passed to the handler as part of `input`. Merged with `context.data`. |
| `cancellable` | no | Whether this step can be cancelled when the instance is cancelled. Default `true`. |
| `wait_for_input` | no | If present, the step pauses after handler execution until `completeStep()` is called. |

### Wait for Input

When a step has `wait_for_input`, the engine:
1. Executes the handler normally
2. Sets the step state to `waiting`
3. Fires `EngineListener.onStepPending(instanceId, stepName, handler)`
4. Pauses the instance until `engine.completeStep(instanceId, stepName, output)` is called

| Field | Required | Description |
|---|---|---|
| `prompt` | yes | Human-readable prompt text displayed in the approval UI. |
| `timeout` | no | Timeout in milliseconds. Step fails if not completed within this time. |
| `choices` | no | Array of `{ "label": "Display Text", "value": "stored_value" }`. If omitted, the UI shows generic Approve/Reject buttons. |
| `store_as` | no | Key name in `context.data` where the output value is stored. Used by downstream `router` conditions. |

### Router Block

```json
{
  "type": "router",
  "id": "terms_gate",
  "routes": [
    {
      "condition": "context.data.terms_decision == 'declined'",
      "blocks": [ ... ]
    }
  ],
  "default": [ ... ]
}
```

Routes are evaluated in order. The first route whose `condition` evaluates to `true` runs its `blocks`. If no route matches, the `default` blocks run. Conditions reference `context.data` values that were set by previous steps' `store_as` fields.

## Platform Integration Patterns

### iOS: App Lifecycle

Use `@Environment(\.scenePhase)` to pause/resume the engine:

```swift
@main
struct MyApp: App {
    @StateObject private var manager = Orch8Manager()
    @Environment(\.scenePhase) var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onChange(of: scenePhase) { newPhase in
                    switch newPhase {
                    case .active:    manager.resumeEngine()
                    case .background: manager.pauseEngine()
                    default: break
                    }
                }
        }
    }
}
```

### iOS: Battery Monitoring

Map `UIDevice.batteryState` and `batteryLevel` to `PowerState`:

```swift
UIDevice.current.isBatteryMonitoringEnabled = true

NotificationCenter.default.addObserver(
    forName: UIDevice.batteryStateDidChangeNotification, object: nil, queue: .main
) { _ in reportBattery() }

NotificationCenter.default.addObserver(
    forName: UIDevice.batteryLevelDidChangeNotification, object: nil, queue: .main
) { _ in reportBattery() }

func reportBattery() {
    let device = UIDevice.current
    let state: PowerState
    switch device.batteryState {
    case .charging, .full: state = .charging
    case .unplugged:
        if device.batteryLevel <= 0.05      { state = .criticalBattery }
        else if device.batteryLevel <= 0.20 { state = .lowBattery }
        else                                { state = .unplugged }
    default: state = .unplugged
    }
    try? engine.reportPowerState(state: state)
}
```

### iOS: Deep Links

The app registers the `orch8://` URL scheme. Deep link format:

```
orch8://start/{workflow-name}              # Start with auto-generated dedup key
orch8://start/{workflow-name}?dedup={key}  # Start with explicit dedup key
orch8://approve                            # Approve the current pending approval
orch8://reject                             # Reject the current pending approval
```

Handled in `Orch8ExampleApp.swift` via `.onOpenURL { url in ... }`.

### iOS: Push Notifications

When a silent push notification arrives (e.g. from APNs), call `engine.onPushReceived()` to force an immediate sync on the next tick:

```swift
func application(_ application: UIApplication,
                 didReceiveRemoteNotification userInfo: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
    manager.onPushReceived()
    return .newData
}
```

### Android: App Lifecycle

Use `ProcessLifecycleOwner` in the `Application` class:

```kotlin
class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        manager = Orch8Manager(this)
        manager.registerBatteryReceiver()

        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) { manager.resumeEngine() }
            override fun onStop(owner: LifecycleOwner)  { manager.pauseEngine() }
            override fun onDestroy(owner: LifecycleOwner) {
                manager.unregisterBatteryReceiver()
                manager.shutdownEngine()
            }
        })
    }
}
```

Requires the `lifecycle-process` dependency:
```kotlin
implementation("androidx.lifecycle:lifecycle-process:2.8.7")
```

### Android: Battery Monitoring

Register a `BroadcastReceiver` for `ACTION_BATTERY_CHANGED`:

```kotlin
private val batteryReceiver = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context?, intent: Intent?) {
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: return
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val pct = (level * 100) / scale
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL

        val powerState = when {
            isCharging -> PowerState.CHARGING
            pct > 20   -> PowerState.UNPLUGGED
            pct >= 5   -> PowerState.LOW_BATTERY
            else       -> PowerState.CRITICAL_BATTERY
        }
        engine.reportPowerState(powerState)
    }
}

// Register in Application.onCreate():
context.registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
```

### Android: Deep Links

The `AndroidManifest.xml` declares an intent filter for `orch8://start`:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="orch8" android:host="start" />
</intent-filter>
```

`MainActivity` handles deep links in `onCreate()` and `onNewIntent()`:

```kotlin
val data = intent.data
if (data?.scheme == "orch8" && data.host == "start") {
    val workflowName = data.pathSegments.firstOrNull()
    if (workflowName != null) manager.startWorkflow(workflowName)
}
```

The activity uses `android:launchMode="singleTop"` so re-entry calls `onNewIntent()` instead of creating a new activity.

### Android: Push Notifications

When a silent push notification arrives (e.g. from FCM), call `engine.onPushReceived()`:

```kotlin
class MyFirebaseService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data.containsKey("orch8_sync")) {
            (application as MyApp).orch8Manager.onPushReceived()
        }
    }
}
```

The example app also handles push notification taps via intent extras — if the intent contains an `orch8_instance_id` extra, it calls `onPushReceived()` to force a sync.

## How It Works

1. **Engine initialization**: `Orch8Manager` creates a `MobileEngine` with SQLite storage and registers 21 native step handlers.
2. **Device context**: `setDeviceContext()` registers the device ID, OS, app version, and SDK version for sync identification. iOS uses `UIDevice.identifierForVendor`, Android persists a UUID in SharedPreferences.
3. **Sequence loading**: JSON definitions are fetched via `loadSequencesFromUrl("")` which uses the `config.sequencesUrl` URL. Alternatively, sequences can be loaded from bundled JSON strings via `loadSequenceFromJson()`.
4. **Battery monitoring**: Both platforms register battery state observers and call `reportPowerState()` when the level changes. The engine automatically adjusts its tick interval (2x slower on low battery, 4x slower on critical).
5. **Starting workflows**: User taps a workflow → `engine.start(sequenceName, input, dedupKey)` creates an instance with a unique dedup key to prevent duplicates.
6. **Tick execution**: `engine.resume()` starts a tick loop at the configured interval (200ms in the examples). Each tick processes pending steps and calls registered handlers.
7. **Wait states**: Steps with `wait_for_input` pause the instance → `EngineListener.onStepPending()` fires → the app shows an approval dialog with the step's configured `choices`.
8. **Auto-completion**: Some waiting steps (e.g. `collect_preferences`, `setup_notifications`) are auto-completed by the manager with default values instead of showing a dialog.
9. **User decision**: User taps a choice button → `engine.completeStep(instanceId, stepName, output)` resumes execution. The output is stored in `context.data` under the `store_as` key.
10. **Routing**: `router` blocks evaluate conditions (e.g. `context.data.terms_decision == 'declined'`) to branch the flow to different block sequences.
11. **Banners**: The `show_banner` handler parses `title`, `message`, and `style` from step params and pushes a `BannerInfo` to the UI via reactive state. Banners auto-dismiss after 5 seconds.
12. **Completion**: `EngineListener.onInstanceCompleted()` moves the workflow from the active list to history.
13. **Lifecycle**: The engine is paused when the app goes to background and resumed on foreground. On termination, `flushTelemetry()` then `shutdown()` are called.

### Engine Runtime Details

The mobile engine (`orch8-mobile`) provides a full on-device workflow runtime:

- **SQLite storage**: All instance state, execution trees, and sync outbox entries are persisted locally. The engine survives app restarts without losing progress.
- **Tick-based execution**: Default tick interval is 100ms (examples use 200ms). The engine adapts to device power state — `LowBattery` doubles the interval (2x), `CriticalBattery` quadruples it (4x). Report power state changes via `engine.reportPowerState()`.
- **Lifecycle management**: `resume()` starts the tick loop, `pause()` suspends it (e.g. app backgrounded), `shutdown()` stops the engine and flushes pending sync. Call `flushTelemetry()` before `shutdown()` to ensure events are delivered.
- **Sequence sync**: Manifests are Ed25519-signed. The engine uses ETag caching to avoid re-downloading unchanged sequences. Before loading a sequence, it checks that all referenced handlers are registered on the device.
- **Deduplication keys**: Pass a `dedupKey` when starting a workflow to prevent duplicate instances from the same trigger (e.g. a push notification delivered twice). The examples generate dedup keys as `"{workflow-name}-{random-8-chars}"`.
- **Concurrency limits**: Default maximum of 10 concurrent instances. Excess `start()` calls are rejected. Maximum 4 concurrent step handlers.
- **Garbage collection**: Completed/failed/cancelled instances are cleaned up after 24 hours by default (`maxInstanceLifetimeSecs`).
- **Memory budget**: The engine enforces a configurable memory budget (`memoryBudgetBytes`) and will reject new instances if the limit is reached. `0` = unlimited.
- **Telemetry**: Events (step started, step completed, instance state changes) are recorded locally and flushed to the server during sync cycles or via `flushTelemetry()`.
- **Handler timeout**: Step handlers that don't return within `handlerTimeoutMs` (default 30s) are failed.
- **Instance lifetime**: Instances running longer than `maxInstanceLifetimeSecs` (default 24h) are garbage collected.
- **Step limit**: Instances that execute more than `maxStepsPerInstance` (default 1000) steps are failed as a safety measure against infinite loops.

## Server Sync & Dashboard Integration

The mobile engine includes a built-in `SyncReporter` that maintains a bidirectional link between the device and the orch8.io server. This enables remote monitoring, approval resolution, and command dispatch from the dashboard.

### Sync Protocol

The device communicates with the server through a single endpoint:

```
POST /mobile/sync
```

Each sync cycle sends a batched payload containing:
- **Status updates**: Current state of all active instances (state, current step, handler, full step timeline)
- **Approval requests**: Steps blocked on `wait_for_input` that need human decision
- **Step delegations**: Steps that reference `credentials://` and need the server to resolve secrets
- **Command acknowledgments**: Confirmation that previously received commands were executed

The server responds with:
- **Pending commands**: Actions queued for this device (see "Server Commands" below)
- **Sync interval hint**: The server tells the device how frequently to sync — 5 seconds when commands are pending, 30 seconds when idle

### Outbox Pattern

All outgoing data is written to a local SQLite `sync_outbox` table before being sent. This guarantees delivery even if the device goes offline — queued entries are flushed on the next successful sync. Status updates coalesce per instance (only the latest state is sent), while approval requests are deduplicated by `instance_id:block_id`.

### Adaptive Sync Timing

- **Default cadence**: 30 seconds (server-controlled via `sync_interval_secs` in the response)
- **Active cadence**: 5 seconds when the server has pending commands for the device
- **Push-triggered sync**: When a silent push notification arrives, `onPushReceived()` forces an immediate sync on the next tick
- The sync interval is measured in ticks, so it automatically adapts to the engine's power-adjusted tick rate

### Server Commands

The server can send commands to devices through the sync response. The dashboard (or API) creates commands via `POST /mobile/commands`, and the device picks them up on its next sync cycle. Supported command types:

| Command | Description |
|---|---|
| `complete_step` | Resume a waiting step with provided output (used for approval resolution) |
| `cancel_instance` | Cancel a running instance immediately |
| `start_workflow` | Start a new workflow on the device with a sequence name and initial state JSON |
| `update_sequence` | Push a sequence update to a running instance with a rollout policy |
| `step_result` | Return resolved credentials/params for a delegated step |

### Update Policies

When pushing a sequence update via `update_sequence`, the command includes a rollout policy:

| Policy | Behavior |
|---|---|
| `restart` | Cancel the existing instance and start fresh with the new sequence version |
| `graceful` | Let the current step finish, then apply the updated sequence |
| `fail` | Mark the instance as failed |
| `cancel` | Cancel the instance immediately (no restart) |
| `skip_executed` | Cancel and restart, but skip steps that were already completed |

### Device Registration

Before syncing, devices register with the server:

```
POST /mobile/devices/register
```

The registration includes the device ID, platform (iOS/Android), app version, and an optional push token for silent push notifications. The server tracks last-sync timestamps per device.

## Credentials & Secret Management

The orch8.io server provides a credentials registry for storing secrets (API keys, tokens, OAuth credentials) that workflow steps may need. The security model ensures that **secret values never reach the device**.

### How It Works

1. **Server stores secrets**: Credentials are created via the API with `POST /credentials`. Each credential has an ID, name, kind (e.g. `api_key`, `oauth`, `token`), and the secret value.
2. **Steps reference secrets**: In a sequence definition, step params reference credentials using the `credentials://` URI scheme — for example, `credentials://my-api-key` or `credentials://my-api-key/token` to access a specific field.
3. **Step delegation**: When the mobile engine encounters a step with `credentials://` references in its params, it queues a step delegation request in the sync outbox. On the next sync cycle, the server receives the delegation, resolves all `credentials://` references against the credential store, and returns a `step_result` command with the resolved params.
4. **Transient exposure**: The resolved secret values are delivered to the device only in the `step_result` command payload. The device executes the step handler with the resolved params but does not persist the secret values to local storage.

### Dashboard Visibility

The dashboard shows credential metadata only — name, kind, enabled status, expiration, and whether a refresh token is configured. The `CredentialResponse` type explicitly strips `value` and `refresh_token` fields. Secret material is never included in API responses.

### Reference Format

```
credentials://<credential-id>           # resolves to the full secret value
credentials://<credential-id>/<field>   # resolves to a specific field within the secret JSON
```

## Dashboard Features

The orch8.io dashboard includes a **Mobile Sync** page (`/dashboard/mobile-sync`) that provides real-time visibility into all mobile workflow activity. The page polls the server every 3 seconds.

### Pending Approvals

The top section lists all workflow steps currently blocked on a human decision. For each approval, the dashboard shows:
- Device ID, instance ID, sequence name, and the blocked step
- The approval prompt text
- How long the approval has been waiting

**Resolution options**: Simple approvals show Approve/Reject buttons. Steps defined with custom `choices` (e.g. `[{label: "Priority", value: "priority"}, {label: "Standard", value: "standard"}]`) display all options as individual buttons. Clicking a button sends a `complete_step` command to the device through the next sync cycle, with a silent push notification to trigger an immediate sync.

### Start Workflow

Operators can start a workflow on any registered device directly from the dashboard:
1. Select a device from the dropdown (populated from devices that have synced)
2. Enter a sequence name (must match a sequence loaded on the device)
3. Provide initial state as JSON (e.g. `{"user_id": "abc", "tier": "premium"}`)
4. Click Start Workflow — this creates a `start_workflow` command delivered on the next sync

### Instance Status

The bottom section shows all instance statuses reported by mobile devices:
- **Summary row**: Device ID, instance ID, sequence name, state badge (Running/Waiting/Completed/Failed/Cancelled), current step, progress bar, and last update timestamp
- **Expandable step timeline**: Click a row to expand a visual timeline of all steps in the workflow. Each step shows its state (completed/running/waiting/pending/failed/skipped), handler name, and start/finish timestamps. Running steps pulse with an animation, and the current step is highlighted.
- **Progress bar**: A compact bar showing completed steps (green) and active steps (blue, pulsing) as a fraction of total steps.

### Instance Actions

Each instance row has an action button:
- **Running/Waiting instances**: Click "Update" to reveal rollout policy options — Restart, Graceful, Fail, Cancel, Skip Executed. Each sends an `update_sequence` command to the device.
- **Terminal instances** (completed/failed/cancelled): Click "Restart" to reveal Restart and Skip Executed options for re-running the workflow.

## API Endpoints

All mobile sync endpoints are served under the `/mobile` prefix:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/mobile/sync` | Device sync — batched status, approvals, delegations, and command acks |
| `POST` | `/mobile/devices/register` | Register a device with platform, app version, and push token |
| `GET` | `/mobile/devices` | List registered devices |
| `GET` | `/mobile/approvals` | List approval requests (filterable by `state=pending`) |
| `POST` | `/mobile/approvals/{id}/resolve` | Resolve a pending approval with output JSON |
| `GET` | `/mobile/status` | List instance statuses (filterable by `device_id`) |
| `POST` | `/mobile/commands` | Create a command for a device (start_workflow, cancel_instance, etc.) |

For local development without the cloud dashboard, all state is visible in the app's active/history lists and via `engine.activeInstances()` / `engine.getInstance(id)`.

## Step Count Verification

Each workflow has exactly 10 steps (counting all branches):

| Workflow | Steps |
|---|---|
| **onboarding-flow** | init_profile, validate_email, show_terms, show_decline_notice, collect_preferences, setup_notifications, admin_approval, show_rejection_banner, show_welcome_banner, complete_onboarding |
| **payment-verification** | init_payment, validate_amount, fraud_check, risk_assessment, compliance_check, payment_approval, show_rejection_banner, process_payment, show_success_banner, send_receipt |
| **feature-access** | check_eligibility, fetch_feature_config, evaluate_rules, consent_request, show_limited_access_banner, verify_identity, access_approval, show_denied_banner, show_access_granted_banner, activate_feature |
