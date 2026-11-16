import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM envelope: [keyId(1)] [nonce(12)] [ciphertext] [tag(16)].
 * AAD binds a ciphertext to its owner and purpose, so swapping ciphertexts between users fails to decrypt.
 */
export function encrypt(plaintext: string, key: Buffer, keyId: number, aad: string): Buffer {
  if (key.length !== 32) throw new Error("key must be 32 bytes");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([keyId]), nonce, ct, cipher.getAuthTag()]);
}

export function decrypt(envelope: Buffer, keys: Map<number, Buffer>, aad: string): string {
  if (envelope.length < 1 + 12 + 16) throw new Error("ciphertext too short");
  const keyId = envelope[0] as number;
  const key = keys.get(keyId);
  if (!key) throw new Error(`unknown key id ${keyId}`);
  const nonce = envelope.subarray(1, 13);
  const tag = envelope.subarray(envelope.length - 16);
  const ct = envelope.subarray(13, envelope.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, nonce);
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

export const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}
