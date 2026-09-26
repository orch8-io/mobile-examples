// Photo capture -> content-addressed artifact kept in the app sandbox.

import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { base64ToBytes, bytesToHex } from "../lib/base64";
import { artifactRefFor, type ArtifactRef } from "../lib/inspection";
import { paths } from "./store";

export class CameraPermissionDenied extends Error {
  constructor() {
    super("Camera permission is required to attach photo evidence.");
  }
}

/**
 * Take a photo and store it under evidence/<sha256>.jpg. Returns null when
 * the user cancels. EXIF (including any GPS tags) is not requested, and the
 * image is re-encoded at quality 0.6. Only the returned ref and hash enter
 * the workflow.
 */
export async function takeEvidencePhoto(): Promise<ArtifactRef | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new CameraPermissionDenied();

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.6,
    exif: false,
    allowsEditing: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];

  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(base64);
  const sha256 = bytesToHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));

  const localUri = `${paths.evidenceDir}${sha256}.jpg`;
  const existing = await FileSystem.getInfoAsync(localUri);
  if (!existing.exists) await FileSystem.copyAsync({ from: asset.uri, to: localUri });
  await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined);

  return {
    ref: artifactRefFor(sha256),
    sha256,
    mime: asset.mimeType ?? "image/jpeg",
    bytes: bytes.byteLength,
    capturedAt: new Date().toISOString(),
    localUri,
  };
}

export async function deleteEvidence(artifact: ArtifactRef): Promise<void> {
  await FileSystem.deleteAsync(artifact.localUri, { idempotent: true });
}
