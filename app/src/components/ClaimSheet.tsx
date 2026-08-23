"use client";

import { useCallback, useRef, useState } from "react";
import { buildClaimActions } from "@/lib/actions";
import { recoveryCodeToSecret } from "@/lib/commitments";
import { formatAmount } from "@/lib/format";
import { waitForClaimLanded } from "@/lib/lantern";
import { VOYAGER_TX } from "@/lib/config";
import {
  connectWallet,
  explainFailure,
  type Strk20Account,
} from "@/lib/wallet";

type Phase = "idle" | "connecting" | "ready" | "submitting" | "done" | "error";

/**
 * Claim flow — refund when a campaign missed its goal, payout when it met one.
 *
 * Both are the same mechanism: prove knowledge of a secret whose Poseidon
 * commitment the contract stored, and the funds are credited into a fresh open
 * note. Neither path reveals who is claiming.
 *
 * The two differ only in who holds the secret and which guard the contract
 * checks, so they share one component rather than duplicating the wiring.
 */
export function ClaimSheet({
  campaignId,
  token,
  tokenSymbol,
  tokenDecimals,
  amount,
  kind,
}: {
  campaignId: number;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  /** Refund: the donation. Payout: everything raised. */
  amount: bigint;
  kind: "refund" | "payout";
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [account, setAccount] = useState<Strk20Account | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  /** A second wallet request is how duplicate prompts appear, so one claim at a
   *  time. */
  const inFlight = useRef(false);

  const isRefund = kind === "refund";
  const secret = recoveryCodeToSecret(code);
  const codeValid = secret !== null && code.trim().length > 0;

  const connect = useCallback(async () => {
    setPhase("connecting");
    setError(null);
    const res = await connectWallet();
    if (!res.ok) {
      setError(explainFailure(res));
      setPhase("error");
      return;
    }
    setAccount(res.account);
    setPhase("ready");
  }, []);

  const submit = useCallback(async () => {
    if (!account || !secret) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPhase("submitting");

    try {
      const actions = buildClaimActions({
        token,
        campaignId,
        secret,
        recipient: account.address,
        kind,
      });
      // Same wallet-resolution caveat as the give flow: if the promise stalls,
      // fall back to watching the chain. A payout flips payout_claimed; a refund
      // flips the commitment's claimed flag. Either is proof it landed.
      const abort = new AbortController();
      const viaWallet = account
        .strk20InvokeTransaction(actions)
        .then((r) => r.transaction_hash as string | null);
      const viaChain = waitForClaimLanded(campaignId, kind, secret, {
        signal: abort.signal,
        initialDelayMs: 90_000,
      }).then((ok) => (ok ? null : new Promise<never>(() => {})));

      const hash = (await Promise.race([viaWallet, viaChain])) as string | null;
      abort.abort();

      setTxHash(hash);
      setPhase("done");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      const up = m.toUpperCase();

      // Map contract asserts to something a person can act on.
      if (up.includes("COMMITMENT_NOT_FOUND")) {
        setError({
          title: isRefund ? "That code doesn't match a donation" : "That isn't the payout key",
          body: isRefund
            ? "Check for typos. The code only works on the campaign it was issued for."
            : "Only the key generated when this campaign was created can release the funds.",
        });
      } else if (up.includes("ALREADY_CLAIMED")) {
        setError({
          title: "Already claimed",
          body: "This donation has been refunded already. It can only be claimed once.",
        });
      } else if (up.includes("PAYOUT_ALREADY_CLAIMED")) {
        setError({
          title: "Already paid out",
          body: "The funds for this campaign have already been collected.",
        });
      } else if (up.includes("CAMPAIGN_NOT_ENDED")) {
        setError({
          title: "Too early",
          body: "Claims open once the deadline passes.",
        });
      } else if (up.includes("GOAL_NOT_MET")) {
        setError({
          title: "The goal wasn't reached",
          body: "There's no payout. Backers can claim refunds instead.",
        });
      } else if (up.includes("GOAL_ALREADY_MET")) {
        setError({
          title: "No refunds — the goal was met",
          body: "This campaign succeeded, so the funds go to the organizer.",
        });
      } else if (up.includes("USER_REFUSED") || up.includes("REJECT")) {
        setError({ title: "Cancelled", body: "Nothing was claimed." });
      } else if (up.includes("NOT_REGISTERED")) {
        setError({
          title: "Wallet not registered with the pool",
          body: "Shield any amount once in your wallet, then try again.",
        });
      } else {
        setError({ title: "The claim didn't go through", body: m });
      }
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }, [account, secret, token, campaignId, kind, isRefund]);

  if (phase === "done") {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
        <p className="font-medium text-emerald-900 dark:text-emerald-200">
          {isRefund ? "Refunded." : "Funds collected."}
        </p>
        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300/80">
          {formatAmount(amount, tokenDecimals, 6)} {tokenSymbol} is back in your
          shielded balance. The claim isn&apos;t linked to your public address.
        </p>
        {txHash ? (
          <a
            href={`${VOYAGER_TX}${txHash}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-block text-sm underline decoration-emerald-400 underline-offset-4"
          >
            View transaction
          </a>
        ) : (
          <p className="mt-3 text-xs text-emerald-800/80 dark:text-emerald-300/70">
            Confirmed on-chain. Your wallet didn&apos;t return a transaction
            hash, so there&apos;s no link.
          </p>
        )}
      </div>
    );
  }

  if (phase === "error" && error) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
        <p className="font-medium text-red-900 dark:text-red-200">{error.title}</p>
        <p className="mt-1 break-words text-sm text-red-800 dark:text-red-300/80">
          {error.body}
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPhase(account ? "ready" : "idle");
          }}
          className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950"
        >
          Try again
        </button>
      </div>
    );
  }

  if (phase === "idle" || phase === "connecting") {
    return (
      <button
        type="button"
        onClick={connect}
        disabled={phase === "connecting"}
        className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 transition-colors hover:bg-stone-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
      >
        {phase === "connecting"
          ? "Opening wallet…"
          : isRefund
            ? "Claim my refund"
            : "Collect the funds"}
      </button>
    );
  }

  const label = isRefund ? "Refund code" : "Payout key";

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={`claim-${campaignId}`}
          className="block text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          {label}
        </label>
        <input
          id={`claim-${campaignId}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="8FCB-995B-468C-…"
          aria-describedby={`claim-help-${campaignId}`}
          aria-invalid={code !== "" && !codeValid}
          disabled={phase === "submitting"}
          className="mt-1.5 w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        />
        <p
          id={`claim-help-${campaignId}`}
          className="mt-1.5 text-xs text-stone-500 dark:text-stone-500"
        >
          {isRefund
            ? "The code shown once when you gave. Dashes and spacing don't matter."
            : "The key generated when this campaign was created."}
        </p>
        {code !== "" && !codeValid && (
          <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
            That doesn&apos;t look like a valid code.
          </p>
        )}
      </div>

      <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-600 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-400">
        <strong className="font-medium text-stone-800 dark:text-stone-200">
          Your wallet will ask twice, one prompt after the other.
        </strong>{" "}
        Once to open a slot for the incoming funds, and once to release them from
        the contract. The second is queued behind the first — it is not a repeat.
      </p>

      <button
        type="button"
        onClick={submit}
        disabled={!codeValid || phase === "submitting"}
        className="w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
      >
        {phase === "submitting"
          ? "Proving and sending…"
          : isRefund
            ? "Claim refund"
            : "Collect funds"}
      </button>

      <p aria-live="polite" className="text-center text-xs text-stone-500 dark:text-stone-500">
        {phase === "submitting"
          ? "Generating a zero-knowledge proof. Keep this tab open."
          : ""}
      </p>
    </div>
  );
}
