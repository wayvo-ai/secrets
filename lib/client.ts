import { shareFragment, dashboardFragment } from "./share-link";
import { encrypt, hash, token, type Envelope } from "./crypto";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  capability?: string,
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(capability ? { Authorization: `Bearer ${capability}` } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  let result: (T & { error?: string }) | undefined;
  try {
    if (
      response.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json"
    )
      result = (await response.json()) as T & { error?: string };
  } catch {
    /* Non-JSON body (edge error page, proxy failure); fall through. */
  }
  if (!response.ok || result === undefined)
    throw new ApiError(
      (typeof result?.error === "string" && result.error) ||
        "Request failed. Please try again.",
      response.status,
    );
  return result;
}
export async function createDashboard(turnstile: string) {
  const capability = token();
  await api("dashboards", undefined, {
    capabilityHash: await hash(capability),
    turnstile,
  });
  return `${location.origin}/d?welcome=1${dashboardFragment(capability)}`;
}
export async function createSecret(
  capability: string,
  label: string,
  text: string,
  ttl: number,
  turnstile: string,
) {
  const { key, envelope } = await encrypt(text),
    redeem = token();
  const { id } = await api<{ id: string }>("secrets", capability, {
    label,
    ttl,
    envelope,
    redeemHash: await hash(redeem),
    turnstile,
  });
  return `${location.origin}/s${shareFragment({ id, r: redeem, k: key })}`;
}
export const getCheck = (id: string, redeem: string) =>
  api<Pick<Envelope, "checkIv" | "checkCiphertext">>(
    `secrets/status?id=${encodeURIComponent(id)}`,
    redeem,
  );
export const reveal = (id: string, redeem: string) =>
  api<{ envelope: Envelope }>("secrets/reveal", redeem, { id });
