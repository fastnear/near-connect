// Shared guards for `view_access_key` RPC responses. The RPC layer normally
// throws on missing keys, but some adapter configurations return a malformed
// resolved value (e.g. an error envelope without a `nonce`). Building a
// transaction with an undefined nonce silently produces NaN/undefined and
// leads to opaque downstream failures (e.g. `BigInt(undefined)` TypeError or
// borsh serialization issues). These helpers normalize that.

export const hasAccessKeyNonce = (accessKey: any): boolean => {
  const t = typeof accessKey?.nonce;
  return t === "number" || t === "bigint" || t === "string";
};

export const requireAccessKeyNonce = (
  accessKey: any,
  context = "view_access_key"
): number | string | bigint => {
  if (hasAccessKeyNonce(accessKey)) return accessKey.nonce;
  let preview: string;
  try {
    preview = JSON.stringify(accessKey)?.slice(0, 200) ?? String(accessKey);
  } catch {
    preview = String(accessKey);
  }
  throw new Error(`${context} returned no usable nonce (received: ${preview})`);
};
