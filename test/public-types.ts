import type {
  BorshSerializedSignedDelegate,
  ConnectorAction,
  FinalExecutionOutcome,
  LegacySignDelegateActionResult,
  SignAndSendTransactionParams,
  SignDelegateActionResult,
  SignDelegateActionsParams,
  SignDelegateActionsResponse,
  WalletFeatures,
} from "../src";

const request: SignDelegateActionsParams = {
  network: "testnet",
  delegateActions: [
    {
      receiverId: "wrap.testnet",
      actions: [],
      blockHeightTtl: 300,
    },
  ],
};

const canonical: BorshSerializedSignedDelegate = {
  borshSerializedBase64: "AA==",
};
declare const legacy: LegacySignDelegateActionResult;
const compatibleResults: SignDelegateActionResult[] = [canonical, legacy, "AA=="];
const response: SignDelegateActionsResponse = {
  signedDelegateActions: compatibleResults,
};
const optionalCapability: Pick<WalletFeatures, "signDelegateActionsWithTtl"> = {};

void request;
void response;
void optionalCapability;

// Both action shapes are accepted: a connector action, and an object shaped like
// near-api-js actionCreators output (structural — no near-api-js import here).
const connectorAction: ConnectorAction = { type: "Transfer", params: { deposit: "1" } };
const gasKeyAddKey: ConnectorAction = {
  type: "AddKey",
  params: { publicKey: "ed25519:x", accessKey: { permission: { receiverId: "app.near", methodNames: ["ping"] } }, gasKeyInfo: { balance: "0", numNonces: 4 } },
};
const fundGasKey: ConnectorAction = { type: "TransferToGasKey", params: { publicKey: "ed25519:x", deposit: "1" } };
const nearApiJsShaped = { enum: "transfer", transfer: { deposit: 1n } };
const send: SignAndSendTransactionParams = {
  receiverId: "bob.near",
  actions: [connectorAction, gasKeyAddKey, fundGasKey, nearApiJsShaped],
};

declare const outcome: FinalExecutionOutcome;
const outcomeStatus: FinalExecutionOutcome["status"] = outcome.status;
const outcomeLogs: string[] = outcome.transaction_outcome.outcome.logs;

void send;
void outcomeStatus;
void outcomeLogs;
