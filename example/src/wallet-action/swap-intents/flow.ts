// Pure helpers for the NEAR Intents (1Click) swap panel. Kept free of React
// and wallet objects so the request and transaction shapes can be checked
// against the live 1Click API without a browser.
//
// The sequence mirrors the monorepo's verified mainnet smoke
// (fastnear-js-monorepo/scripts/smoke-intents-mainnet.mjs, QA table in
// packages/intents/MAINNET_QA.md):
//   1. dry quote (free)            -> price preview
//   2. committed quote             -> depositAddress
//   3. ONE transaction to wrap.near: register self + depositAddress,
//      wrap the NEAR, ft_transfer wNEAR to the depositAddress
//   4. submitDeposit(txHash)       -> accelerator
//   5. poll status(depositAddress) -> SUCCESS | REFUNDED | FAILED

import type { ConnectorAction, FinalExecutionOutcome } from "@fastnear/near-connect";
import type { OneClickQuoteRequest, OneClickStatus } from "@fastnear/intents";

export const WNEAR_CONTRACT = "wrap.near";
export const WNEAR_ASSET = "nep141:wrap.near";

export const DESTINATION_ASSETS = {
  USDC: {
    label: "USDC (NEAR)",
    assetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    decimals: 6,
  },
  USDT: {
    label: "USDT (NEAR)",
    assetId: "nep141:usdt.tether-token.near",
    decimals: 6,
  },
} as const;
export type DestinationSymbol = keyof typeof DESTINATION_ASSETS;

/** 1% — the same tolerance the release smoke uses. */
export const SLIPPAGE_BPS = 100;
/** 1Click quotes are honoured for a bounded window; 15 minutes matches the smoke. */
export const QUOTE_DEADLINE_MS = 15 * 60_000;
/** Give the swap up to 15 minutes to reach a terminal state before we stop polling. */
export const POLL_TIMEOUT_MS = 15 * 60_000;
export const POLL_INTERVAL_MS = 5_000;

const FT_GAS = "30000000000000"; // 30 TGas per action; four actions stay well under the 300 TGas cap
const ONE_YOCTO = "1";
/** NEP-145 minimum for wrap.near; the contract refunds it when the account is already registered. */
const STORAGE_DEPOSIT_YOCTO = "1250000000000000000000";

export function buildQuoteRequest(params: {
  accountId: string;
  amountYocto: string;
  destination: DestinationSymbol;
  dry: boolean;
}): OneClickQuoteRequest {
  return {
    dry: params.dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: SLIPPAGE_BPS,
    originAsset: WNEAR_ASSET,
    destinationAsset: DESTINATION_ASSETS[params.destination].assetId,
    amount: params.amountYocto,
    depositType: "ORIGIN_CHAIN",
    refundTo: params.accountId,
    refundType: "ORIGIN_CHAIN",
    recipient: params.accountId,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + QUOTE_DEADLINE_MS).toISOString(),
  };
}

function functionCall(methodName: string, args: Record<string, unknown>, deposit: string): ConnectorAction {
  return { type: "FunctionCall", params: { methodName, args, gas: FT_GAS, deposit } };
}

/**
 * The single wallet approval of the flow. Everything targets wrap.near, so
 * it is one transaction with four actions:
 *   storage_deposit(self)            idempotent; wrap.near refunds if registered
 *   storage_deposit(depositAddress)  ft_transfer reverts on an unregistered receiver
 *   near_deposit                     wraps exactly the swap amount from native NEAR
 *   ft_transfer(depositAddress)      hands the wNEAR to 1Click's deposit account
 */
export function buildDepositTransaction(params: { accountId: string; depositAddress: string; amountYocto: string }) {
  return {
    receiverId: WNEAR_CONTRACT,
    actions: [
      functionCall("storage_deposit", { account_id: params.accountId, registration_only: true }, STORAGE_DEPOSIT_YOCTO),
      functionCall("storage_deposit", { account_id: params.depositAddress, registration_only: true }, STORAGE_DEPOSIT_YOCTO),
      functionCall("near_deposit", {}, params.amountYocto),
      functionCall("ft_transfer", { receiver_id: params.depositAddress, amount: params.amountYocto }, ONE_YOCTO),
    ],
  };
}

export const TERMINAL_STATUSES: ReadonlySet<OneClickStatus> = new Set<OneClickStatus>(["SUCCESS", "REFUNDED", "FAILED"]);

export function isTerminalStatus(status: OneClickStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Transaction hash plus any on-chain failure, read the way the smoke reads it. */
export function summarizeOutcome(outcome: FinalExecutionOutcome): { txHash: string; failure?: unknown } {
  const txHash = outcome.transaction_outcome?.id;
  if (!txHash) throw new Error("Wallet returned an outcome without a transaction hash");
  const failures: unknown[] = [];
  const top = outcome.status;
  if (top && typeof top === "object" && "Failure" in top) failures.push(top.Failure);
  for (const receipt of outcome.receipts_outcome ?? []) {
    const status = receipt?.outcome?.status;
    if (status && typeof status === "object" && "Failure" in status) failures.push(status.Failure);
  }
  return failures.length > 0 ? { txHash, failure: failures[0] } : { txHash };
}

/** Human-readable amount from base units, without floating point. */
export function formatUnits(amount: string, decimals: number): string {
  const digits = amount.replace(/^0+(?=\d)/, "");
  if (digits.length <= decimals) return `0.${"0".repeat(decimals - digits.length)}${digits}`.replace(/\.?0+$/, "") || "0";
  const whole = digits.slice(0, -decimals);
  const frac = digits.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
