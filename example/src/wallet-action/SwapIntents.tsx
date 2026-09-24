import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { parseNearAmount } from "@near-js/utils";
import { createOneClickClient } from "@fastnear/intents";
import type { OneClickQuoteResponse, OneClickStatusResponse } from "@fastnear/intents";

import { IPropsWalletAction } from "./wallet-action.types.ts";
import {
  DESTINATION_ASSETS,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  buildDepositTransaction,
  buildQuoteRequest,
  formatUnits,
  isTerminalStatus,
  summarizeOutcome,
  type DestinationSymbol,
} from "./swap-intents/flow.ts";

interface InFlightSwap {
  depositAddress: string;
  txHash: string;
  amountNear: string;
  destination: DestinationSymbol;
  startedAt: number;
}

const oneClick = createOneClickClient();

const explorerTx = (hash: string) => `https://nearblocks.io/txns/${hash}`;

/**
 * NEAR Intents swap through the connected wallet: native NEAR in, a NEAR
 * stablecoin out, priced and routed by the hosted 1Click API. Mainnet only —
 * the verifier, 1Click and the solver network have no meaningful testnet.
 */
export const SwapIntents = ({ wallet, network }: IPropsWalletAction) => {
  const [amountNear, setAmountNear] = useLocalStorage("swap-intents-amount", "0.05");
  const [destination, setDestination] = useLocalStorage<DestinationSymbol>("swap-intents-destination", "USDC");
  const [inFlight, setInFlight] = useLocalStorage<InFlightSwap | undefined>("swap-intents-in-flight", undefined);

  const [quote, setQuote] = useState<OneClickQuoteResponse>();
  const [status, setStatus] = useState<OneClickStatusResponse>();
  const [phase, setPhase] = useState<"idle" | "quoting" | "committing" | "signing" | "polling">("idle");
  const [error, setError] = useState("");
  const pollTimer = useRef<number>();

  const amountYocto = parseNearAmount(amountNear.trim() || "0");
  const amountValid = amountYocto != null && amountYocto !== "0";

  const accountId = async () => {
    const accounts = await wallet.getAccounts();
    const id = accounts[0]?.accountId;
    if (!id) throw new Error("No account is connected");
    return id;
  };

  // Resume polling for a swap that was in flight when the page reloaded.
  useEffect(() => {
    if (!inFlight || network !== "mainnet") return;
    startPolling(inFlight.depositAddress, inFlight.startedAt);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight?.depositAddress, network]);

  const stopPolling = () => {
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
    pollTimer.current = undefined;
  };

  const startPolling = (depositAddress: string, startedAt: number) => {
    stopPolling();
    setPhase("polling");
    const tick = async () => {
      try {
        const next = await oneClick.status({ depositAddress });
        setStatus(next);
        if (isTerminalStatus(next.status)) {
          setPhase("idle");
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setError("Stopped polling after 15 minutes; the swap may still settle. Check the deposit address on 1Click later.");
        setPhase("idle");
        return;
      }
      pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();
  };

  const getQuote = async () => {
    setError("");
    setQuote(undefined);
    if (!amountValid) return setError("Enter a NEAR amount greater than zero");
    setPhase("quoting");
    try {
      const request = buildQuoteRequest({ accountId: await accountId(), amountYocto, destination, dry: true });
      setQuote(await oneClick.quote(request));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
    }
  };

  const swap = async () => {
    setError("");
    setStatus(undefined);
    if (!amountValid) return setError("Enter a NEAR amount greater than zero");
    try {
      const signerId = await accountId();

      setPhase("committing");
      const committed = await oneClick.quote(buildQuoteRequest({ accountId: signerId, amountYocto, destination, dry: false }));
      const depositAddress = committed.quote.depositAddress;
      if (!depositAddress) throw new Error("1Click returned a committed quote without a deposit address");
      setQuote(committed);

      setPhase("signing");
      const outcome = await wallet.signAndSendTransaction(buildDepositTransaction({ accountId: signerId, depositAddress, amountYocto }));
      const { txHash, failure } = summarizeOutcome(outcome);
      if (failure) throw new Error(`Deposit transaction ${txHash} failed on-chain: ${JSON.stringify(failure)}`);

      const startedAt = Date.now();
      setInFlight({ depositAddress, txHash, amountNear, destination, startedAt });
      try {
        // Accelerator only; 1Click also discovers the deposit on its own.
        setStatus(await oneClick.submitDeposit({ txHash, depositAddress }));
      } catch {
        /* status polling below is the source of truth */
      }
      startPolling(depositAddress, startedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  };

  const clear = () => {
    stopPolling();
    setInFlight(undefined);
    setStatus(undefined);
    setQuote(undefined);
    setError("");
    setPhase("idle");
  };

  const busy = phase !== "idle";
  const dest = DESTINATION_ASSETS[destination];
  const details = status?.swapDetails;

  if (network !== "mainnet") {
    return (
      <div className={"input-form"} style={{ width: 500 }}>
        <p className={"input-form-label"}>Swap via NEAR Intents (1Click)</p>
        <p className={"text-left text-xs text-[rgb(126,130,144)]"}>
          NEAR Intents runs on mainnet only: the verifier, the 1Click API and the solver network have no testnet. Switch the network
          selector to mainnet to use this panel.
        </p>
      </div>
    );
  }

  return (
    <div className={"input-form"} style={{ width: 500 }}>
      <p className={"input-form-label"}>Swap via NEAR Intents (1Click)</p>

      <div className={"flex flex-col gap-4"}>
        <p className={"text-left text-xs text-[rgb(126,130,144)]"}>
          Real mainnet funds. One wallet approval sends a single transaction to <code>wrap.near</code> that registers storage, wraps
          exactly this amount and transfers the wNEAR to 1Click&apos;s deposit address. 1Click then fills the swap and delivers{" "}
          {dest.label.split(" ")[0]} to your account. Keyless quotes carry a 0.2% platform fee; slippage tolerance is 1%.
        </p>

        <div className={"flex flex-wrap gap-2 items-end"}>
          <div className={"input-group grow min-w-[10rem]"}>
            <p className={"input-label"}>Amount (NEAR)</p>
            <input className={"input-text"} type={"text"} inputMode={"decimal"} value={amountNear} disabled={busy} onChange={(e) => setAmountNear(e.target.value)} />
          </div>
          <div className={"input-group w-[12rem]"}>
            <p className={"input-label"}>Receive</p>
            <select className={"input-text"} value={destination} disabled={busy} onChange={(e) => setDestination(e.target.value as DestinationSymbol)}>
              {(Object.keys(DESTINATION_ASSETS) as DestinationSymbol[]).map((symbol) => (
                <option key={symbol} value={symbol}>
                  {DESTINATION_ASSETS[symbol].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={"flex flex-wrap gap-2"}>
          <button className={"input-button compact flex-1"} disabled={busy || !amountValid} onClick={() => getQuote()}>
            {phase === "quoting" ? "Quoting…" : "Get quote (free)"}
          </button>
          <button className={"input-button compact flex-1"} disabled={busy || !amountValid || inFlight != null} onClick={() => swap()}>
            {phase === "committing" ? "Committing quote…" : phase === "signing" ? "Approve in wallet…" : "Swap"}
          </button>
        </div>

        {quote?.quote && (
          <div className={"input-group"}>
            <p className={"input-label"}>{quote.quote.depositAddress ? "Committed quote" : "Quote"}</p>
            <div className={"text-left text-sm flex flex-col gap-1"}>
              <span>
                {amountNear} NEAR → {quote.quote.amountOutFormatted ?? formatUnits(quote.quote.amountOut, dest.decimals)} {destination}
                {quote.quote.amountOutUsd ? ` (≈ $${quote.quote.amountOutUsd})` : ""}
              </span>
              {quote.quote.minAmountOut && (
                <span className={"text-xs text-[rgb(126,130,144)]"}>
                  Minimum after slippage: {formatUnits(quote.quote.minAmountOut, dest.decimals)} {destination}
                  {quote.quote.timeEstimate ? ` · estimated ${quote.quote.timeEstimate}s` : ""}
                </span>
              )}
              {quote.quote.depositAddress && <span className={"text-xs break-all text-[rgb(126,130,144)]"}>Deposit address: {quote.quote.depositAddress}</span>}
            </div>
          </div>
        )}

        {inFlight && (
          <div className={"input-group"}>
            <p className={"input-label"}>Swap status</p>
            <div className={"text-left text-sm flex flex-col gap-1"}>
              <span>
                {status?.status ?? (phase === "polling" ? "Waiting for 1Click…" : "Unknown")}
                {phase === "polling" ? " (polling every 5s)" : ""}
              </span>
              <a className={"break-all text-xs text-sky-500"} target={"_blank"} rel={"noreferrer"} href={explorerTx(inFlight.txHash)}>
                deposit tx {inFlight.txHash}
              </a>
              {details?.amountOutFormatted && (
                <span>
                  Received {details.amountOutFormatted} {inFlight.destination}
                  {details.amountOutUsd ? ` (≈ $${details.amountOutUsd})` : ""}
                </span>
              )}
              {details?.refundedAmount && /[1-9]/.test(details.refundedAmount) && (
                <span className={"text-amber-400 text-xs"}>
                  Refunded {formatUnits(details.refundedAmount, 24)} wNEAR{details.refundReason ? `: ${details.refundReason}` : ""}
                </span>
              )}
              {details?.nearTxHashes?.map((hash) => (
                <a key={hash} className={"break-all text-xs text-sky-500"} target={"_blank"} rel={"noreferrer"} href={explorerTx(hash)}>
                  settlement tx {hash}
                </a>
              ))}
              {details?.intentHashes?.map((hash) => (
                <span key={hash} className={"break-all text-xs text-[rgb(126,130,144)]"}>
                  intent {hash}
                </span>
              ))}
              {status && isTerminalStatus(status.status) && (
                <button className={"input-button compact"} onClick={clear}>
                  Start another swap
                </button>
              )}
            </div>
          </div>
        )}

        {error ? <p className={"text-left text-xs text-red-400 break-words"}>{error}</p> : null}
      </div>
    </div>
  );
};
