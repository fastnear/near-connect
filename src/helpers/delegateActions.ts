import { nearActionsToConnectorActions } from "../actions";
import type { SignDelegateActionsParams } from "../types";

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
export function prepareDelegateActionsForTransport(delegateActions: SignDelegateActionsParams["delegateActions"]): DelegateAction[] {
  return delegateActions.map((delegateAction) => {
    if (delegateAction.blockHeightTtl !== undefined) {
      validateBlockHeightTtl(delegateAction.blockHeightTtl);
    }

    return {
      ...delegateAction,
      actions: nearActionsToConnectorActions(delegateAction.actions),
    };
  });
}
