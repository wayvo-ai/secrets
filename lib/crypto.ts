export const CHECK_TEXT = "Wayvo Secrets key check v2";
const aad = (purpose: "secret" | "check") =>
  new TextEncoder().encode(`wayvo-secrets/v2/AES-256-GCM/${purpose}`);
export type Envelope = {
  version: 2;
  algorithm: "AES-256-GCM";
  iv: string;
  ciphertext: string;
  checkIv: string;
  checkCiphertext: string;
};
export function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoding");
  const bytes = Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
  if (encode(bytes) !== value) throw new Error("Invalid encoding");
  return bytes;
}
export function token() {
  return encode(crypto.getRandomValues(new Uint8Array(32)));
}
export function validToken(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 43) return false;
  try {
    return decode(value).length === 32;
  } catch {
    return false;
  }
}
export async function hash(value: string) {
  return encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
async function importKey(key: string) {
  if (!validToken(key)) throw new Error("Invalid key");
  return crypto.subtle.importKey("raw", decode(key), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encrypt(
  text: string,
): Promise<{ key: string; envelope: Envelope }> {
  const bytes = new TextEncoder().encode(text);
  if (!bytes.length || bytes.length > 10240)
    throw new Error("Secret must be 1–10,240 UTF-8 bytes.");
  const key = token(),
    imported = await importKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  let checkIv = crypto.getRandomValues(new Uint8Array(12));
  while (encode(iv) === encode(checkIv))
    checkIv = crypto.getRandomValues(new Uint8Array(12));
  const seal = async (
    data: Uint8Array<ArrayBuffer>,
    nonce: Uint8Array<ArrayBuffer>,
    purpose: "secret" | "check",
  ) =>
    encode(
      new Uint8Array(
        await crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: nonce,
            additionalData: aad(purpose),
            tagLength: 128,
          },
          imported,
          data,
        ),
      ),
    );
  return {
    key,
    envelope: {
      version: 2,
      algorithm: "AES-256-GCM",
      iv: encode(iv),
      ciphertext: await seal(bytes, iv, "secret"),
      checkIv: encode(checkIv),
      checkCiphertext: await seal(
        new TextEncoder().encode(CHECK_TEXT),
        checkIv,
        "check",
      ),
    },
  };
}
export async function verifyKey(
  key: string,
  check: Pick<Envelope, "checkIv" | "checkCiphertext">,
) {
  const result = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(check.checkIv),
      additionalData: aad("check"),
      tagLength: 128,
    },
    await importKey(key),
    decode(check.checkCiphertext),
  );
  if (new TextDecoder().decode(result) !== CHECK_TEXT)
    throw new Error("Invalid key");
}
export async function decrypt(key: string, envelope: Envelope) {
  if (envelope.version !== 2 || envelope.algorithm !== "AES-256-GCM")
    throw new Error("Unsupported envelope");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decode(envelope.iv),
        additionalData: aad("secret"),
        tagLength: 128,
      },
      await importKey(key),
      decode(envelope.ciphertext),
    ),
  );
}
