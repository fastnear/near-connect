/**
 * Structural shapes of near-api-js `Action` objects.
 *
 * `nearActionsToConnectorActions` accepts objects built with near-api-js
 * `actionCreators` so dApps written against that library keep working, but
 * near-connect does not depend on near-api-js: these interfaces describe only
 * the fields the converter reads (near-api-js `Enum` instances set the chosen
 * variant as an own property and record its name in `enum`). Anything that
 * matches the shape is accepted; nothing from `@near-js/*` is imported.
 */

/** A value whose `toString()` yields the decimal / canonical form (bigint, PublicKey, ...). */
export interface Stringable {
  toString(): string;
}

export interface NearApiJsPublicKeyLike {
  toString(): string;
}

export interface NearApiJsFunctionCallPermissionLike {
  receiverId: string;
  allowance?: Stringable | null;
  methodNames: string[];
}

export interface NearApiJsAccessKeyPermissionLike {
  enum?: string;
  fullAccess?: unknown;
  functionCall?: NearApiJsFunctionCallPermissionLike;
}

export interface NearApiJsActionLike {
  enum?: string;
  createAccount?: object;
  deployContract?: { code: Uint8Array };
  functionCall?: { methodName: string; args: Uint8Array; gas: Stringable; deposit: Stringable };
  transfer?: { deposit: Stringable };
  stake?: { stake: Stringable; publicKey: NearApiJsPublicKeyLike };
  addKey?: {
    publicKey: NearApiJsPublicKeyLike;
    accessKey: { nonce: Stringable | number | bigint; permission: NearApiJsAccessKeyPermissionLike };
  };
  deleteKey?: { publicKey: NearApiJsPublicKeyLike };
  deleteAccount?: { beneficiaryId: string };
  deployGlobalContract?: { code: Uint8Array; deployMode: { enum?: string; CodeHash?: null; AccountId?: null } };
  useGlobalContract?: { contractIdentifier: { enum?: string; CodeHash?: Uint8Array; AccountId?: string } };
  /** Not convertible: wallets sign delegates through `signDelegateActions`. The converter throws. */
  signedDelegate?: unknown;
}
