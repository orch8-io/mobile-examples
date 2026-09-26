import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

import { serverConfigured } from "../config";
import { startInspection, type InspectionView } from "../engine/inspections";
import { Button, Card, StageBadge, styles } from "./ui";

export function InspectionList(props: {
  items: InspectionView[];
  error: string | null;
  online: boolean;
  onOpen: (instanceId: string) => void;
  onChanged: () => void;
}) {
  const { items, error, online, onOpen, onChanged } = props;
  const [siteName, setSiteName] = useState("");
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const start = async () => {
    const name = siteName.trim();
    if (!name) return;
    setBusy(true);
    setStartError(null);
    try {
      const id = await startInspection({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name });
      setSiteName("");
      onChanged();
      onOpen(id);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => item.record.instanceId}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <Text style={styles.h1} accessibilityRole="header">
            Inspections
          </Text>
          <Text style={styles.muted}>
            {online ? "Online" : "Offline: work is saved on this device and syncs later."}
            {serverConfigured ? "" : " Server sync is not configured (demo mode)."}
          </Text>
          <Card>
            <Text style={styles.h2}>New inspection</Text>
            <TextInput
              style={styles.input}
              value={siteName}
              onChangeText={setSiteName}
              placeholder="Site name, e.g. Riverside Block C"
              accessibilityLabel="Site name"
              returnKeyType="go"
              onSubmitEditing={start}
            />
            <Button title="Start inspection" onPress={start} disabled={busy || !siteName.trim()} />
            {startError ? <Text style={styles.error}>{startError}</Text> : null}
          </Card>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={<Text style={styles.muted}>No inspections yet.</Text>}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open inspection at ${item.record.siteName}`}
          onPress={() => onOpen(item.record.instanceId)}
        >
          <Card>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={styles.body}>{item.record.siteName}</Text>
              <StageBadge stage={item.stage} />
            </View>
            <Text style={styles.muted}>
              Started {new Date(item.record.createdAt).toLocaleString()} · {item.record.artifacts.length} photo(s)
            </Text>
          </Card>
        </Pressable>
      )}
    />
  );
}
