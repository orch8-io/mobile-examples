# Store listing checklist: Orch8 Field Inspection

Use this checklist to ship this reference app, or an app built from it, to
the App Store and Google Play. The privacy answers follow the app's actual
data flow (README.md) and the SDK boundaries in
`engine/docs/MOBILE_PRIVACY_AND_TOOLS.md`:

- The SDK does not request OS permissions on its own. This app requests
  camera and notifications, and only when the feature is first used.
- The SDK does not export camera or file bytes. Photos stay in the app
  sandbox, and the workflow, sync payloads and supervisor request carry only
  opaque `artifact://sha256/…` references.
- Logs, traces, artifacts and sync values pass through the SDK's policy
  redactor. It does not redact unlabelled semantic secrets, so free-text
  notes are treated as user content below.
- Engine telemetry is **off** in this app (`telemetryEnabled: false`).

Re-check every answer if you change any of: `EXPO_PUBLIC_EVIDENCE_UPLOAD_URL`,
telemetry, analytics/crash SDKs, or location capture.

## 1. Identity and build

- [ ] Replace `io.orch8.examples.fieldinspection` (iOS bundle id and Android package) with your own.
- [ ] App name, subtitle/short description, keywords; category **Business** (or Productivity).
- [ ] Icon: 1024×1024 PNG without alpha (iOS); 512×512 PNG (Play); adaptive icon foreground/background (Android).
- [ ] Version and build number set (`expo.version`, `ios.buildNumber`, `android.versionCode`).
- [ ] Production build via `eas build --profile production`. Confirm `@orch8.io/expo` links the engine (see README "Known gaps").
- [ ] `ITSAppUsesNonExemptEncryption: false` (HTTPS only) is accurate for your build. If you add custom crypto, file the export compliance documentation.
- [ ] Push: APNs key uploaded to your push provider and orch8-push. FCM `google-services.json` added for Android.
- [ ] Support URL, marketing URL, **privacy policy URL** (required by both stores).

## 2. Screenshots

Capture on a clean install with realistic, non-personal demo data (a
fictional site name and inspector, and photos of a demo site with no faces
or licence plates).

| Screen | What it shows |
|---|---|
| 1. Inspections list, **offline banner** | Works without signal |
| 2. Checklist with one failed item and a note | Structured capture |
| 3. Photo evidence step with 2–3 thumbnails | Evidence stays on device |
| 4. "Awaiting supervisor" status | Approval flow |
| 5. Approved notification + status card | Outcome and push |

- [ ] iOS iPhone 6.9" (1320×2868) and 6.5" (1284×2778 or 1242×2688), 3–10 each.
- [ ] iOS iPad 13" (2064×2752). Required because `supportsTablet: true`. Set it to false if you don't support iPad.
- [ ] Google Play phone: 2–8 screenshots, 1080×1920 or larger, 9:16.
- [ ] Google Play 7" and 10" tablet screenshots, if the tablet layout is offered.
- [ ] Google Play feature graphic 1024×500.
- [ ] Optional app preview video (15–30 s, same flow).

## 3. Permissions (what reviewers see)

| Permission | Platform string / declaration | When requested |
|---|---|---|
| Camera | `NSCameraUsageDescription`: "The camera is used to attach photo evidence to your inspections…" / `android.permission.CAMERA` | First "Take photo" tap |
| Notifications | System prompt / `POST_NOTIFICATIONS` (Android 13+) | First sync with a server configured |
| Background | `UIBackgroundModes`: `fetch`, `remote-notification` / `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | Registered at launch. Runs only in OS-granted windows |

Explicitly **not** requested (blocked in `app.json`): microphone, photo
library, external storage, location, overlay (`SYSTEM_ALERT_WINDOW`).

- [ ] Reviewer notes explain that background fetch and push are used only to
      sync inspections and deliver supervisor decisions.
- [ ] Demo credentials or a demo-mode build for App Review. With no server
      URL, the app runs fully offline up to "Awaiting supervisor".

## 4. Apple App Privacy ("nutrition label")

Apply only when a server is configured. In demo mode, no data leaves the
device, so the answer is **"Data Not Collected"**.

| Data type (Apple) | Collected | Linked to user | Tracking | Purpose | Why |
|---|---|---|---|---|---|
| User Content → Photos or Videos | **Only if** an evidence store is configured | Yes | No | App Functionality | Photo bytes uploaded by `PUT /{sha256}`. Otherwise only hashes leave the device, and a hash is not a photo. |
| User Content → Other User Content | Yes | Yes | No | App Functionality | Checklist results and failure notes in the workflow context, synced as status. Sent to the supervisor review. |
| Contact Info → Name | Yes | Yes | No | App Functionality | Inspector name on the attestation. |
| Identifiers → Device ID | Yes | Yes | No | App Functionality | Random per-install id (not hardware-derived) and push token for device registration and sync. |
| Location | **No** | — | — | — | No location permission. EXIF is not requested from the camera. |
| Diagnostics / Usage Data | **No** | — | — | — | Engine telemetry disabled. No analytics or crash SDK in this app. |

- [ ] "Used for tracking": **No** for every type. No IDFA, no ATT prompt.
- [ ] Privacy manifest (`ios.privacyManifests` in `app.json`) matches this
      table. Update `NSPrivacyCollectedDataTypes` if you drop the evidence
      store (remove PhotosorVideos) or add data.
- [ ] Required-reason APIs in the manifest (file timestamp, user defaults,
      boot time, disk space) match what your final dependency set uses.
      Re-run Xcode's privacy report on the archive.

## 5. Google Play Data safety

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes, when a server is configured. (Demo-mode builds: No.) |
| Is all user data encrypted in transit? | **Yes.** The engine rejects non-HTTPS sync and telemetry URLs, and the evidence store must be HTTPS. |
| Do you provide a way for users to request that their data is deleted? | Yes. Describe your organization's process (for example an admin deletes device records and inspections). Uninstalling deletes all on-device data. |
| Data **shared** with third parties? | **No.** Data goes only to the operator's own Orch8 server and evidence store (the developer's service, not a third party). If your push relay is a third party (for example Expo push), declare the device ID/push token as shared for App functionality. |

Data types **collected** (all: purpose App functionality, not optional
when a server is configured, not processed ephemerally):

- [ ] Photos and videos → **Photos**: only if an evidence store is configured.
- [ ] App activity → **Other user-generated content**: checklist results and notes.
- [ ] Personal info → **Name**: inspector name.
- [ ] Device or other IDs: install id and push token.
- [ ] **Not** collected: location, contacts, audio, files and docs (outside
      the app's own photos), app info and performance, financial, health,
      messages, web browsing.
- [ ] Declare the Play target audience: adults (18+). The app is not
      directed at children.
- [ ] `android:allowBackup="false"` is set, so on-device inspection data is
      not copied to Google backups. On iOS the Documents directory is in the
      user's encrypted device backup. Say so in the privacy policy, or move
      the data to a no-backup location.

## 6. Privacy policy must state

- [ ] What is stored on the device (inspections, notes, photos, install id),
      how long (up to 14 days per active inspection and until the app is
      uninstalled), and that it works offline.
- [ ] What is sent to the server and when: status, checklist, notes, photo
      references (and photo bytes if an evidence store is configured), push
      token.
- [ ] Who receives it: your organization's supervisors. No advertising, no sale of data.
- [ ] Retention and deletion on the server, and a contact for requests.

## 7. Final pre-submission checks

- [ ] `npm run typecheck && npm test` pass. Both sequences validate (README).
- [ ] Tested on a physical device: offline capture → airplane mode off → sync → approval push → approved.
- [ ] Denied-permission paths: camera denied shows guidance, and notifications denied still shows status in the app.
- [ ] No `EXPO_PUBLIC_*` admin keys in the production bundle (`npx expo export` and grep the bundle).
- [ ] Sequences published with the same versions the app bundles (`field-inspection-offline` v1).
