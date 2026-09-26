import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Stage } from "../lib/inspection";

export const colors = {
  bg: "#F6F7F9",
  card: "#FFFFFF",
  text: "#111827",
  muted: "#4B5563",
  primary: "#1D4ED8",
  danger: "#B91C1C",
  success: "#047857",
  warning: "#B45309",
  border: "#D1D5DB",
};

export function Button(props: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const { title, onPress, kind = "primary", disabled } = props;
  const bg = kind === "primary" ? colors.primary : kind === "danger" ? colors.danger : colors.card;
  const fg = kind === "secondary" ? colors.primary : "#FFFFFF";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        kind === "secondary" && styles.secondary,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const STAGE_LABEL: Record<Stage, { label: string; color: string }> = {
  checklist: { label: "Checklist", color: colors.primary },
  photos: { label: "Photos", color: colors.primary },
  attestation: { label: "Ready to submit", color: colors.primary },
  submitting: { label: "Submitting", color: colors.warning },
  awaiting_supervisor: { label: "Awaiting supervisor", color: colors.warning },
  approved: { label: "Approved", color: colors.success },
  changes_requested: { label: "Changes requested", color: colors.warning },
  rejected: { label: "Rejected", color: colors.danger },
  failed: { label: "Failed", color: colors.danger },
  cancelled: { label: "Cancelled", color: colors.muted },
};

export function StageBadge({ stage }: { stage: Stage }) {
  const { label, color } = STAGE_LABEL[stage];
  return (
    <View style={[styles.badge, { borderColor: color }]} accessibilityLabel={`Status: ${label}`}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
  h1: { fontSize: 28, fontWeight: "700", color: colors.text },
  h2: { fontSize: 20, fontWeight: "600", color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  error: { fontSize: 14, lineHeight: 20, color: colors.danger },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  button: { minHeight: 48, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center", alignItems: "center" },
  secondary: { borderWidth: 1, borderColor: colors.primary },
  buttonText: { fontSize: 16, fontWeight: "600" },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 48,
    color: colors.text,
    backgroundColor: colors.card,
  },
});
