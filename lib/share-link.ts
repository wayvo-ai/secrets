import { decode, encode, validToken } from "./crypto";
export type ShareParts = { id: string; r: string; k: string };
const alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function base62(bytes: Uint8Array): string {
  let number = 0n;
  for (const byte of bytes) number = (number << 8n) | BigInt(byte);
  let result = "";
  do {
    result = alphabet[Number(number % 62n)] + result;
    number /= 62n;
  } while (number);
  return result;
}

// One version byte and three independent 256-bit values. Encoding, not encryption.
export function shareFragment({ id, r, k }: ShareParts): string {
  if (![id, r, k].every(validToken)) throw new Error("Invalid share link");
  const bytes = new Uint8Array(97);
  bytes[0] = 1;
  bytes.set(decode(id), 1);
  bytes.set(decode(r), 33);
  bytes.set(decode(k), 65);
  return `#${base62(bytes)}`;
}

export function parseShareFragment(fragment: string): ShareParts {
  const value = fragment.replace(/^#/, "");
  if (!/^[0-9A-Za-z]{129,130}$/.test(value))
    throw new Error("Invalid share link");
  const bytes = unpack(value, 97);
  return {
    id: encode(bytes.slice(1, 33)),
    r: encode(bytes.slice(33, 65)),
    k: encode(bytes.slice(65, 97)),
  };
}

function unpack(value: string, length: number): Uint8Array {
  if (
    !/^[0-9A-Za-z]+$/.test(value) ||
    value.length > Math.ceil((length * 8) / Math.log2(62))
  )
    throw new Error("Invalid link");
  let number = 0n;
  for (const char of value)
    number = number * 62n + BigInt(alphabet.indexOf(char));
  const bytes = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(number & 255n);
    number >>= 8n;
  }
  if (number !== 0n || bytes[0] !== 1 || base62(bytes) !== value)
    throw new Error("Invalid link");
  return bytes;
}
export function dashboardFragment(capability: string): string {
  if (!validToken(capability)) throw new Error("Invalid dashboard link");
  const bytes = new Uint8Array(33);
  bytes[0] = 1;
  bytes.set(decode(capability), 1);
  return `#${base62(bytes)}`;
}
export function parseDashboardFragment(fragment: string): string {
  return encode(unpack(fragment.replace(/^#/, ""), 33).slice(1));
}
