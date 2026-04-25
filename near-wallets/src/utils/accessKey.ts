// Shared guards for `view_access_key` RPC responses. The RPC layer normally
// throws on missing keys, but some adapter configurations return a malformed
// resolved value (e.g. an error envelope without a `nonce`). Building a
// transaction with an undefined nonce silently produces NaN/undefined and
// leads to opaque downstream failures (e.g. `BigInt(undefined)` TypeError or
// borsh serialization issues). These helpers normalize that.

const MISSING_KEY_HINTS = [
  "does not exist",
  "unknown access key",
  "accesskeydoesnotexist",
  "no access key",
];

export const hasAccessKeyNonce = (accessKey: any): boolean => {
  const t = typeof accessKey?.nonce;
  return t === "number" || t === "bigint" || t === "string";
};

// NEAR's RPC sometimes returns a *successful* response shape for a missing
// key, with an `error` string embedded inside the result body alongside
// block_hash/block_height (rather than a JSON-RPC error). Detect that so
// callers can recognize "key not yet on chain" without waiting for the
// fall-through "no nonce" path.
export const findMissingKeyErrorString = (accessKey: any): string | null => {
  if (!accessKey || typeof accessKey !== "object") return null;
  const err = accessKey.error;
  if (typeof err !== "string") return null;
  const lower = err.toLowerCase();
  return MISSING_KEY_HINTS.some((hint) => lower.includes(hint)) ? err : null;
};

export const isMissingKeyErrorMessage = (msg: string): boolean => {
  const lower = msg.toLowerCase();
  return MISSING_KEY_HINTS.some((hint) => lower.includes(hint));
};

export const requireAccessKeyNonce = (
  accessKey: any,
  context = "view_access_key"
): number | string | bigint => {
  if (hasAccessKeyNonce(accessKey)) return accessKey.nonce;
  const softErr = findMissingKeyErrorString(accessKey);
  if (softErr) throw new Error(`${context}: ${softErr}`);
  let preview: string;
  try {
    preview = JSON.stringify(accessKey)?.slice(0, 500) ?? String(accessKey);
  } catch {
    preview = String(accessKey);
  }
  throw new Error(`${context} returned no usable nonce (received: ${preview})`);
};
