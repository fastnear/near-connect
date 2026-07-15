import type {
  BorshSerializedSignedDelegate,
  LegacySignDelegateActionResult,
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
