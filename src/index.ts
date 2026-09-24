export { type DataStorage, LocalStorage } from "./helpers/storage";
export { ParentFrameWallet } from "./ParentFrameWallet";
export { SandboxWallet } from "./SandboxedWallet";
export { InjectedWallet } from "./InjectedWallet";
export { NearConnector } from "./NearConnector";

export { nearActionsToConnectorActions } from "./actions";
export type { ConnectorAction, GasKeyInfo, TransferToGasKeyAction, WithdrawFromGasKeyAction } from "./actions/types";
export { isGasKeyAction, assertGasKeyActionsSupported } from "./actions/gas-keys";
export type {
  NearApiJsActionLike,
  NearApiJsAccessKeyPermissionLike,
  NearApiJsFunctionCallPermissionLike,
} from "./actions/near-api-js-shapes";
export type { WalletPlugin } from "./types/plugin";

export type {
  FooterBranding,
  NearWalletBase,
  WalletManifest,
  EventNearWalletInjected,
  SignMessageParams,
  SignedMessage,
  SignAndSendTransactionParams,
  SignAndSendTransactionsParams,
  SignDelegateActionsParams,
  SignDelegateActionsResponse,
  SignDelegateActionResult,
  LegacySignDelegateActionResult,
  BorshSerializedSignedDelegate,
  SignInAndSignMessageParams,
  AccountWithSignedMessage,
  AddFunctionCallKeyParams,
  AddFunctionCallKeyResult,
  WalletConnectConfig,
  WalletFeatures,
  Action,
  FinalExecutionOutcome,
  ExecutionOutcomeWithId,
  ExecutionOutcome,
  ExecutionStatus,
  FinalExecutionStatus,
  ExecutionError,
  LegacySignedDelegate,
} from "./types";
