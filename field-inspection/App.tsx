import { Orch8Provider } from "@orch8.io/expo";
import NetInfo from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, SafeAreaView, Text, View } from "react-native";

import { config, serverConfigured } from "./src/config";
import { getEngine } from "./src/engine/runtime";
import { useInspections } from "./src/engine/useInspections";
import { InspectionList } from "./src/screens/InspectionList";
import { InspectionScreen } from "./src/screens/InspectionScreen";
import { styles } from "./src/screens/ui";
import { registerBackgroundSync } from "./src/sync/background";
import { startConnectivitySync, syncNow, wakeAndSync } from "./src/sync/online";
import { onPushWake } from "./src/sync/push";

export default function App() {
  // REST client for components that want useOrch8Client(); the on-device
  // engine is a process singleton (see src/engine/runtime.ts).
  const clientConfig = useMemo(
    () =>
      serverConfigured
        ? { baseUrl: config.serverUrl, tenantId: config.tenantId, headers: { "X-API-Key": config.apiKey } }
        : undefined,
    [],
  );
  return (
    <Orch8Provider clientConfig={clientConfig}>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <EngineGate />
      </SafeAreaView>
    </Orch8Provider>
  );
}

function EngineGate() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEngine()
      .then((engine) => {
        engine.resume(); // foreground tick loop
        setReady(true);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const stopConnectivity = startConnectivitySync();
    const stopPush = onPushWake(() => void wakeAndSync());
    const appState = AppState.addEventListener("change", (state) => {
      void getEngine().then((engine) => {
        if (state === "active") {
          engine.resume();
          void syncNow().catch(() => undefined);
        } else {
          engine.pause(); // background progress happens in bounded OS windows only
        }
      });
    });
    void registerBackgroundSync().catch(() => undefined);
    void syncNow().catch(() => undefined);
    return () => {
      stopConnectivity();
      stopPush();
      appState.remove();
    };
  }, [ready]);

  if (error) {
    return (
      <View style={styles.content}>
        <Text style={styles.h2}>The workflow engine could not start</Text>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!ready) return <ActivityIndicator style={{ marginTop: 48 }} accessibilityLabel="Starting" />;
  return <Home />;
}

function Home() {
  const { items, error, refresh } = useInspections();
  const [openId, setOpenId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)), []);

  const open = openId ? items.find((i) => i.record.instanceId === openId) : undefined;
  if (open) {
    return <InspectionScreen view={open} onBack={() => setOpenId(null)} onChanged={() => void refresh()} />;
  }
  return (
    <InspectionList items={items} error={error} online={online} onOpen={setOpenId} onChanged={() => void refresh()} />
  );
}
