// Push: the server wakes the device after a supervisor decides (the
// complete_step command is stored with a push wake), and the app shows local
// notifications for outcomes. Tokens are native APNs/FCM tokens, which are
// what orch8-push delivers to. They are not Expo push tokens.

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

let tokenPromise: Promise<string | null> | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Ask for permission once. Returns the native device push token, or null. */
export function getPushToken(): Promise<string | null> {
  tokenPromise ??= (async () => {
    if (!Device.isDevice) return null; // simulators cannot receive remote pushes
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!status.granted) return null;
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === "string" ? token.data : null;
  })().catch(() => {
    tokenPromise = null;
    return null;
  });
  return tokenPromise;
}

/** Any push (silent wake or visible) means: tick the engine and sync now. */
export function onPushWake(handler: () => void): () => void {
  const received = Notifications.addNotificationReceivedListener(() => handler());
  const opened = Notifications.addNotificationResponseReceivedListener(() => handler());
  return () => {
    received.remove();
    opened.remove();
  };
}
