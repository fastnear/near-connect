// Inline base64 encoder so action.ts stays free of @fastnear/utils (and keeps it transpilable standalone by test/executor-bytes.test.cjs)
const _bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

export interface CreateAccountAction {
  type: "CreateAccount";
}

export interface DeployContractAction {
  type: "DeployContract";
  params: { code: Uint8Array };
}

export interface FunctionCallAction {
  type: "FunctionCall";
  params: {
    methodName: string;
    args: object;
    gas: string;
    deposit: string;
  };
}

export interface TransferAction {
  type: "Transfer";
  params: { deposit: string };
}

export interface StakeAction {
  type: "Stake";
  params: {
    stake: string;
    publicKey: string;
  };
}

export type AddKeyPermission =
  | "FullAccess"
  | {
      receiverId: string;
      allowance?: string;
      methodNames?: Array<string>;
    };

/**
 * Gas keys (protocol 85+): an access key with its own prepaid balance that
 * pays the gas of whatever it signs, over `numNonces` independent nonce lanes.
 * An `AddKey` creates one when `params.gasKeyInfo` is present: a "FullAccess"
 * permission becomes GasKeyFullAccess, a function-call permission becomes
 * GasKeyFunctionCall (which cannot carry an allowance — the balance is the
 * allowance). Field names follow Meteor's executor format.
 */
export interface GasKeyInfo {
  /** yoctoNEAR as a decimal string. Must be "0" on AddKey; fund it afterwards with TransferToGasKey. */
  balance: string;
  /** Independent nonce lanes, 1..1024. The AddKey fee grows with it. */
  numNonces: number;
}

export interface AddKeyAction {
  type: "AddKey";
  params: {
    publicKey: string;
    accessKey: {
      nonce?: number;
      permission: AddKeyPermission;
    };
    /** Present ⇒ this AddKey creates a gas key (see GasKeyInfo). */
    gasKeyInfo?: GasKeyInfo;
  };
}

/** Fund a gas key's balance. Any account may send it; `deposit` leaves the sender. */
export interface TransferToGasKeyAction {
  type: "TransferToGasKey";
  params: { publicKey: string; deposit: string };
}

/** Move `amount` from a gas key back to its account. Only the owning account may sign it; not allowed inside a delegate. */
export interface WithdrawFromGasKeyAction {
  type: "WithdrawFromGasKey";
  params: { publicKey: string; amount: string };
}

export interface DeleteKeyAction {
  type: "DeleteKey";
  params: { publicKey: string };
}
export interface DeleteAccountActionParams {
  beneficiaryId: string;
}
export interface DeleteAccountAction {
  type: "DeleteAccount";
  params: DeleteAccountActionParams;
}

export interface UseGlobalContractAction {
  type: "UseGlobalContract";
  params: { contractIdentifier: { accountId: string } | { codeHash: string } };
}

export interface DeployGlobalContractAction {
  type: "DeployGlobalContract";
  params: { code: Uint8Array; deployMode: "CodeHash" | "AccountId" };
}

export type ConnectorAction =
  | CreateAccountAction
  | DeployContractAction
  | FunctionCallAction
  | TransferAction
  | StakeAction
  | AddKeyAction
  | DeleteKeyAction
  | DeleteAccountAction
  | UseGlobalContractAction
  | DeployGlobalContractAction
  | TransferToGasKeyAction
  | WithdrawFromGasKeyAction;

/**
 * Convert ConnectorAction[] to the flat action format expected by @fastnear/utils mapAction().
 * Zero imports by design: used by the nightly and wallet-connect executors and by test/executor-bytes.test.cjs.
 */
export const connectorActionsToFastnearActions = (actions: ConnectorAction[]): any[] => {
  return actions.map((action) => {
    if (!("type" in action)) return action;

    switch (action.type) {
      case "FunctionCall":
        return {
          type: "FunctionCall",
          methodName: action.params.methodName,
          args: action.params.args,
          gas: action.params.gas,
          deposit: action.params.deposit,
        };
      case "Transfer":
        return { type: "Transfer", deposit: action.params.deposit };
      case "AddKey": {
        const { permission } = action.params.accessKey;
        const gasKey = action.params.gasKeyInfo;
        if (gasKey) {
          // @fastnear/utils flat shape: the permission kind plus the gas-key
          // fields beside it. The chain rejects an allowance on a gas key.
          if (permission !== "FullAccess" && permission.allowance != null) {
            throw new Error("A gas key cannot carry an allowance: its balance is the allowance");
          }
          return {
            type: "AddKey",
            publicKey: action.params.publicKey,
            accessKey: {
              nonce: action.params.accessKey.nonce ?? 0,
              permission: permission === "FullAccess" ? "GasKeyFullAccess" : "GasKeyFunctionCall",
              numNonces: gasKey.numNonces,
              balance: gasKey.balance,
              ...(permission === "FullAccess" ? {} : { receiverId: permission.receiverId, methodNames: permission.methodNames ?? [] }),
            },
          };
        }
        return {
          type: "AddKey",
          publicKey: action.params.publicKey,
          accessKey: {
            nonce: action.params.accessKey.nonce ?? 0,
            permission: permission === "FullAccess"
              ? "FullAccess"
              : {
                  receiverId: permission.receiverId,
                  methodNames: permission.methodNames ?? [],
                  allowance: permission.allowance,
                },
          },
        };
      }
      case "TransferToGasKey":
        return { type: "TransferToGasKey", publicKey: action.params.publicKey, deposit: action.params.deposit };
      case "WithdrawFromGasKey":
        return { type: "WithdrawFromGasKey", publicKey: action.params.publicKey, amount: action.params.amount };
      case "DeleteKey":
        return { type: "DeleteKey", publicKey: action.params.publicKey };
      case "CreateAccount":
        return { type: "CreateAccount" };
      case "DeleteAccount":
        return { type: "DeleteAccount", beneficiaryId: action.params.beneficiaryId };
      case "DeployContract":
        return { type: "DeployContract", codeBase64: _bytesToBase64(action.params.code) };
      case "Stake":
        return { type: "Stake", stake: action.params.stake, publicKey: action.params.publicKey };
      default:
        throw new Error("Unsupported action type");
    }
  });
};

