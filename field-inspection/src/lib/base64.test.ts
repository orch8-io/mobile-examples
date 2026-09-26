import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { base64ToBytes, bytesToHex } from "./base64.ts";

test("decodes like Buffer for random payloads", () => {
  for (let len = 0; len < 64; len++) {
    const bytes = new Uint8Array(len).map((_, i) => (i * 37 + len) & 0xff);
    const encoded = Buffer.from(bytes).toString("base64");
    assert.deepEqual(base64ToBytes(encoded), bytes);
  }
});

test("hex of decoded bytes matches sha256 input", () => {
  const encoded = Buffer.from("inspection photo").toString("base64");
  const expected = createHash("sha256").update("inspection photo").digest("hex");
  const actual = bytesToHex(createHash("sha256").update(base64ToBytes(encoded)).digest());
  assert.equal(actual, expected);
});

test("rejects malformed input", () => {
  assert.throws(() => base64ToBytes("a"));
  assert.throws(() => base64ToBytes("ab!d"));
});
