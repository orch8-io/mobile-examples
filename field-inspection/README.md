# Field Inspection: Expo reference app

A field inspector walks a site with no signal, fills in a safety checklist,
attaches photos, and submits the inspection. A supervisor gets a push
notification, approves or rejects, and the inspector's phone updates, even
if it only comes back online hours later.

The workflow runs **on the device** in the embedded Orch8 engine, through
[`@orch8.io/expo`](https://github.com/orch8-io/sdk-expo). The server only
takes part when there is something to sync.

```
 Inspector device (offline OK)                      Orch8 server
 ───────────────────────────────                    ──────────────────────────────
 field-inspection-offline (on-device engine)
  capture_checklist      wait_for_input  ◄─ app form
  capture_photos         wait_for_input  ◄─ camera → evidence/<sha256>.jpg (ref only)
  inspector_attestation  wait_for_input  ◄─ "Submit for review"
  queue_evidence_upload  (handler)       ── PUT {evidence}/{sha256} when online
  supervisor_approval    wait_for_input  ── /mobile/sync: status + approval request
        │                                    app (when online) ─► field-inspection-review
        │                                                          human_review ─► push relay ─► supervisor
        │                                                          (supervisor decides)
        │                                                          http_request POST /mobile/commands
        ◄──────────── complete_step command + push wake ◄────────┘
  route_supervisor_decision
   ├ approved           → finalize_report     → local notification
   ├ changes_requested  → notify_inspector
   └ rejected           → notify_inspector
```

| File | What it is |
|---|---|
| `workflows/field-inspection-offline.json` | Device sequence. It is bundled with the app and loaded with `loadSequenceFromJson`. |
| `workflows/field-inspection-review.server.json` | Server-side companion sequence (`human_review` + push relay + decision relay). |
| `src/lib/` | Pure workflow contract (stage derivation, step payloads, checklist rules) plus `node --test` tests. |
| `src/engine/` | Engine singleton, inspection operations, photo capture, and the local index. |
| `src/sync/` | Device registration, evidence upload, review requests, push, and background windows. |
| `src/docs/QuickStart.tsx` | The Expo quick start from `engine/docs/MOBILE_SDK.md`, type-checked here. |
| `STORE_LISTING.md` | App Store and Play submission checklist, including privacy answers. |

## How it works

- **Offline first.** Starting an inspection and completing each step are
  local engine calls (`start`, `completeStep`) that are persisted in SQLite
  on the device. Nothing waits on the network. The engine's lifetime is set
  to 14 days (`maxInstanceLifetimeSecs`) because inspections can wait days
  for a supervisor.
- **User input goes through `wait_for_input` gates.** `@orch8.io/expo`
  handlers are fire-and-forget (they return `{}` immediately), so the app
  answers gates with `completeStep`. The payload must carry
  `{"value": <one of the step's choices>}`. The engine stores that value
  under `store_as` and merges the other keys (`checklist`, `evidence`, …)
  into `context.data`. `src/lib/inspection.test.ts` checks every payload
  against the sequence's declared choices.
- **Photos are artifact refs.** A photo is re-encoded (no EXIF requested),
  hashed with SHA-256, and stored as `evidence/<sha256>.jpg` in the app
  sandbox. Only `artifact://sha256/<hex>`, the MIME type, the size and a
  timestamp enter the workflow context, sync payloads and the supervisor
  request. Local paths and bytes never do. If
  `EXPO_PUBLIC_EVIDENCE_UPLOAD_URL` is set, bytes go to your evidence store
  with `PUT /{sha256}`, which is idempotent by content hash.
- **Sync when online.** With `EXPO_PUBLIC_ORCH8_URL` and a device key set,
  the engine's SyncReporter sends status and the `supervisor_approval`
  request to `/mobile/sync` from a durable outbox. On reconnect, on
  foreground, on push and in OS background windows, the app also registers
  the device with its native push token, uploads evidence, and creates the
  server-side `field-inspection-review` instance. The idempotency key is
  the device instance id, so repeats are no-ops.
- **Supervisor approval with push.** `field-inspection-review` runs the
  built-in `human_review` handler. It posts a `human_review_pending` payload
  to `notify_url`, a push relay you run that notifies the supervisor's phone
  through APNs, FCM or Expo push. The supervisor's decision resolves that
  gate (for example from the dashboard or `POST /instances/{id}/signals`).
  Then `http_request` posts a `complete_step` command to `/mobile/commands`.
  The server stores the command together with a push wake for the
  inspector's device (orch8-push, APNs/FCM). The push makes the app tick the
  engine and sync. The next `/mobile/sync` delivers the command, and the
  device finishes the workflow.
  The supervisor can also decide directly under **Mobile Sync → Pending
  Approvals** in the dashboard. That path sends the same `complete_step`
  command.
- **Status.** The app derives each inspection's stage from the engine state
  and the stored step outputs (`src/lib/inspection.ts#deriveStage`). The
  engine's `getInstance` does not expose the current step, and
  `stepPending` events are not replayed after a restart.

## Run it

Requires Node 20+ (Node 22.18+ or 23.6+ for `npm test`) and Xcode 16 or
Android Studio for a development build. `@orch8.io/expo` contains native
code, so it does not run in Expo Go.

```bash
npm install
cp .env.example .env         # leave EXPO_PUBLIC_ORCH8_URL empty for offline demo mode
npm run typecheck && npm test
npx expo prebuild
npx expo run:ios --device    # or: npx expo run:android
```

In demo mode (no server), everything up to "Awaiting supervisor" works
offline. To simulate the decision, send the `complete_step` command from a
server, or complete the step from a debug build with
`engine.completeStep(id, "supervisor_approval", { value: "approved" })`.

## Server setup

1. Publish the companion sequence. Replace the `example.com` URLs with your
   push relay and your Orch8 server first:
   ```bash
   curl -X POST "$ORCH8_URL/sequences" -H "X-API-Key: $ADMIN_KEY" -H "X-Tenant-Id: mobile" \
     -H "Content-Type: application/json" -d @workflows/field-inspection-review.server.json
   ```
2. Create the credentials that the sequence references by `credentials://`,
   so the secrets never appear in the sequence:
   `supervisor-push-relay` (field `token`) and `orch8-mobile-commands`
   (field `api_key`, a key allowed to call `POST /mobile/commands`).
3. Configure orch8-push (APNs and/or FCM) on the server. Commands are then
   delivered with a push wake to the device token registered by the app.
4. Give the app a **device-scoped** key (`EXPO_PUBLIC_ORCH8_DEVICE_KEY`)
   that can call `/mobile/sync`, `/mobile/devices/register`,
   `GET /sequences/by-name` and `POST /instances` for
   `field-inspection-review` only. `EXPO_PUBLIC_*` values ship inside the
   app bundle. For production, mint short-lived per-device tokens instead.

Validate both sequences against the current engine schema (from the engine repo):

```bash
cargo run -p orch8-mobile --example validate_mobile_sequences -- \
  ../mobile-examples/field-inspection/workflows/field-inspection-offline.json \
  ../mobile-examples/field-inspection/workflows/field-inspection-review.server.json
```

## Known gaps

- `@orch8.io/expo` 0.7 has no `onPushReceived()`. On a push the app calls
  `runUntilIdle()`, and the engine syncs on its own interval: 30 s by
  default, or 5 s while commands are pending. It does not sync immediately.
- The published `@orch8.io/expo@0.7.0` package ships `ios/Orch8ExpoModule.swift`
  without a podspec, and its Android module references
  `libs/orch8-mobile-release.aar`, which is not in the package. Check that
  `expo prebuild` plus a native build links the engine before relying on
  this app. This was not verified here.
- If the supervisor decides both in the dashboard and through the companion
  sequence, the second `complete_step` finds the step already done and is
  ignored. The dashboard row still shows the approval as pending.
