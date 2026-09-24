import { nearActionsToConnectorActions } from "../actions";
import { assertGasKeyActionsSupported } from "../actions/gas-keys";
import type { SignDelegateActionsParams, WalletFeatures } from "../types";

type DelegateAction = SignDelegateActionsParams["delegateActions"][number];

/** Validate the relative lifetime requested for a delegated action. */
export function validateBlockHeightTtl(blockHeightTtl: number): void {
  if (!Number.isSafeInteger(blockHeightTtl) || blockHeightTtl <= 0) {
    throw new RangeError("blockHeightTtl must be a positive safe integer");
  }
}

/**
 * Validate timeout metadata and convert actions without dropping fields that
 * wallet executors need to construct the delegate.
 */
export function prepareDelegateActionsForTransport(
  delegateActions: SignDelegateActionsParams["delegateActions"],
  wallet?: { name: string; features?: Partial<WalletFeatures> },
): DelegateAction[] {
  return delegateActions.map((delegateAction) => {
    if (delegateAction.blockHeightTtl !== undefined) {
      validateBlockHeightTtl(delegateAction.blockHeightTtl);
    }

    const actions = nearActionsToConnectorActions(delegateAction.actions);
    if (wallet) assertGasKeyActionsSupported(wallet.features, actions, wallet.name);

    return { ...delegateAction, actions };
  });
}
