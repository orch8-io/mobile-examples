// Build-time configuration. EXPO_PUBLIC_* values are inlined into the JS
// bundle, so anyone with the app binary can read them. Use a device-scoped,
// least-privilege key (mobile sync + device registration + creating
// field-inspection-review instances), never an admin key.
// See README.md "Server setup".

const env = process.env;

export const config = {
  /** Orch8 server, e.g. https://orch8.example.com. Empty = offline-only demo mode. */
  serverUrl: (env.EXPO_PUBLIC_ORCH8_URL ?? "").replace(/\/+$/, ""),
  tenantId: env.EXPO_PUBLIC_ORCH8_TENANT ?? "mobile",
  apiKey: env.EXPO_PUBLIC_ORCH8_DEVICE_KEY ?? "",
  /** Who reviews inspections from this device (routes the server-side review). */
  supervisorId: env.EXPO_PUBLIC_SUPERVISOR_ID ?? "site-supervisor",
  /**
   * Optional evidence store. Photos are uploaded with
   * `PUT {evidenceUploadUrl}/{sha256}`, which is idempotent by content hash.
   * Empty = photos stay on the device and only refs are synced.
   */
  evidenceUploadUrl: (env.EXPO_PUBLIC_EVIDENCE_UPLOAD_URL ?? "").replace(/\/+$/, ""),
  inspectorName: env.EXPO_PUBLIC_INSPECTOR_NAME ?? "Field inspector",
} as const;

export const serverConfigured = config.serverUrl.startsWith("https://") && config.apiKey.length > 0;

/** Inspections can wait days for a supervisor; the engine default is 24h. */
export const INSTANCE_LIFETIME_SECS = 14 * 24 * 60 * 60;
