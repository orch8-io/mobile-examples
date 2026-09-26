// OS-scheduled background windows (BGTaskScheduler / WorkManager through
// expo-background-fetch). Each window drains the engine for a bounded time
// and runs one sync pass. It never starts a persistent loop.

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { getEngine } from "../engine/runtime";
import { syncNow } from "./online";

export const BACKGROUND_TASK = "orch8-field-inspection-sync";

// Must run at module scope so the task exists when the OS launches the app
// headless. index.ts imports this file.
TaskManager.defineTask(BACKGROUND_TASK, async () => {
  try {
    const engine = await getEngine();
    const result = await engine.runUntilIdle(25, 20_000);
    await syncNow();
    return result.stepsExecuted > 0 || result.instancesAdvanced > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK)) return;
  await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK, {
    minimumInterval: 15 * 60, // seconds; the OS decides the real cadence
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
