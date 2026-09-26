import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { config, serverConfigured } from "../config";
import { CameraPermissionDenied, deleteEvidence, takeEvidencePhoto } from "../engine/capture";
import {
  addPhoto,
  cancelInspection,
  removePhoto,
  submitAttestation,
  submitChecklist,
  submitPhotos,
  type InspectionView,
} from "../engine/inspections";
import { newChecklist, validateChecklist, type ChecklistItem, type ItemResult } from "../lib/checklist";
import { Button, Card, StageBadge, colors, styles } from "./ui";

export function InspectionScreen(props: { view: InspectionView; onBack: () => void; onChanged: () => void }) {
  const { view, onBack, onChanged } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Button title="‹ All inspections" kind="secondary" onPress={onBack} />
      <Text style={styles.h1} accessibilityRole="header">
        {view.record.siteName}
      </Text>
      <StageBadge stage={view.stage} />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {view.stage === "checklist" && (
        <ChecklistStep busy={busy} onSubmit={(items) => run(() => submitChecklist(view.record.instanceId, items))} />
      )}
      {view.stage === "photos" && <PhotoStep view={view} busy={busy} run={run} />}
      {view.stage === "attestation" && (
        <Card>
          <Text style={styles.h2}>Submit for review</Text>
          <Text style={styles.body}>
            Submitting sends this inspection for supervisor approval. If you are offline, it is queued on this device
            and sent automatically when you reconnect.
          </Text>
          <Button
            title={`Submit as ${config.inspectorName}`}
            disabled={busy}
            onPress={() => run(() => submitAttestation(view.record.instanceId, config.inspectorName))}
          />
        </Card>
      )}
      <StatusCard view={view} />
      {!["approved", "changes_requested", "rejected", "failed", "cancelled"].includes(view.stage) && (
        <Button
          title="Cancel inspection"
          kind="danger"
          disabled={busy}
          onPress={() =>
            Alert.alert("Cancel inspection?", "The inspection will stop and cannot be resumed.", [
              { text: "Keep", style: "cancel" },
              { text: "Cancel inspection", style: "destructive", onPress: () => run(() => cancelInspection(view.record.instanceId)) },
            ])
          }
        />
      )}
    </ScrollView>
  );
}

function ChecklistStep(props: { busy: boolean; onSubmit: (items: ChecklistItem[]) => void }) {
  const [items, setItems] = useState<ChecklistItem[]>(newChecklist);
  const problems = validateChecklist(items);
  const set = (id: string, patch: Partial<ChecklistItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <Card>
      <Text style={styles.h2}>Site checklist</Text>
      {items.map((item) => (
        <View key={item.id} style={{ gap: 8, paddingVertical: 8 }}>
          <Text style={styles.body}>{item.label}</Text>
          <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={item.label}>
            {(["pass", "fail", "na"] as ItemResult[]).map((result) => (
              <Pressable
                key={result}
                accessibilityRole="radio"
                accessibilityState={{ selected: item.result === result }}
                onPress={() => set(item.id, { result })}
                style={[
                  styles.badge,
                  { minHeight: 44, minWidth: 64, justifyContent: "center", alignItems: "center" },
                  item.result === result && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Text style={{ color: item.result === result ? "#FFFFFF" : colors.text, fontWeight: "600" }}>
                  {result === "na" ? "N/A" : result === "pass" ? "Pass" : "Fail"}
                </Text>
              </Pressable>
            ))}
          </View>
          {item.result === "fail" && (
            <TextInput
              style={styles.input}
              value={item.note}
              onChangeText={(note) => set(item.id, { note })}
              placeholder="What is wrong? (required)"
              accessibilityLabel={`Note for ${item.label}`}
              multiline
            />
          )}
        </View>
      ))}
      {problems.length > 0 && <Text style={styles.muted}>{problems.length} item(s) still need attention.</Text>}
      <Button title="Save checklist" disabled={props.busy || problems.length > 0} onPress={() => props.onSubmit(items)} />
    </Card>
  );
}

function PhotoStep(props: { view: InspectionView; busy: boolean; run: (a: () => Promise<void>) => Promise<void> }) {
  const { view, busy, run } = props;
  const id = view.record.instanceId;
  const photos = view.record.artifacts;

  const capture = () =>
    run(async () => {
      try {
        const artifact = await takeEvidencePhoto();
        if (artifact) await addPhoto(id, artifact);
      } catch (e) {
        if (e instanceof CameraPermissionDenied) {
          Alert.alert("Camera access needed", e.message);
          return;
        }
        throw e;
      }
    });

  return (
    <Card>
      <Text style={styles.h2}>Photo evidence</Text>
      <Text style={styles.muted}>
        Photos stay on this device. The workflow only records a content hash for each photo
        {config.evidenceUploadUrl ? ", and each photo is uploaded to your evidence store when you are online." : "."}
      </Text>
      <View style={[styles.row, { flexWrap: "wrap" }]}>
        {photos.map((p) => (
          <Pressable
            key={p.sha256}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            onLongPress={() => run(async () => {
              await removePhoto(id, p.sha256);
              await deleteEvidence(p);
            })}
          >
            <Image source={{ uri: p.localUri }} style={{ width: 96, height: 96, borderRadius: 8 }} accessibilityIgnoresInvertColors />
          </Pressable>
        ))}
      </View>
      {photos.length > 0 && <Text style={styles.muted}>Long-press a photo to remove it.</Text>}
      <Button title="Take photo" kind="secondary" disabled={busy || photos.length >= 8} onPress={capture} />
      <Button
        title={photos.length > 0 ? `Continue with ${photos.length} photo(s)` : "Continue without photos"}
        disabled={busy}
        onPress={() => run(() => submitPhotos(id))}
      />
    </Card>
  );
}

function StatusCard({ view }: { view: InspectionView }) {
  const uploaded = view.record.uploaded.length;
  const total = view.record.artifacts.length;
  const lines: string[] = [];
  switch (view.stage) {
    case "submitting":
      lines.push("Processing on this device…");
      break;
    case "awaiting_supervisor":
      lines.push(
        serverConfigured
          ? view.record.reviewRequestedAt
            ? `Supervisor notified ${new Date(view.record.reviewRequestedAt).toLocaleString()}. You will get a notification when they decide.`
            : "Waiting for a connection to notify your supervisor."
          : "Demo mode: no server configured, so the approval request stays on this device.",
      );
      break;
    case "approved":
      lines.push("Approved. The report is final.");
      break;
    case "changes_requested":
      lines.push("Your supervisor requested changes. Start a follow-up inspection for this site.");
      break;
    case "rejected":
      lines.push("Rejected by your supervisor.");
      break;
    case "failed":
      lines.push("This inspection stopped because of an error or an expired deadline.");
      break;
    default:
      break;
  }
  if (total > 0 && config.evidenceUploadUrl) lines.push(`Photos uploaded: ${uploaded}/${total}.`);
  if (lines.length === 0) return null;
  return (
    <Card>
      <Text style={styles.h2}>Status</Text>
      {lines.map((l) => (
        <Text key={l} style={styles.body}>
          {l}
        </Text>
      ))}
      <Text style={styles.muted}>Engine state: {view.engineState}</Text>
    </Card>
  );
}
