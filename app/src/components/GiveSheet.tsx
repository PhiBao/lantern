"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildDonateActions, type DonateShape } from "@/lib/actions";
import { generateSecret, secretToRecoveryCode } from "@/lib/commitments";
import { formatAmount, parseAmount } from "@/lib/format";
import { VOYAGER_TX } from "@/lib/config";
import {
  connectWallet,
  explainFailure,
  readShieldedBalance,
  type Strk20Account,
} from "@/lib/wallet";
import { HonestyPanel } from "./HonestyPanel";

type Phase =
  | "idle"
  | "connecting"
  | "ready"

  | "confirming"
  | "submitting"
  | "done"
  | "error";

/**
 * The give flow.
 *
 * Ordering is deliberate: connect and capability-check first, then read the
 * shielded balance, then dry-run, and only then ask for a signature. Every
 * failure that can be discovered cheaply is discovered before the user commits.
 */
export function GiveSheet({
  campaignId,
  token,
  tokenSymbol,
  tokenDecimals,
  goal,
  raised,
  onDonated,
  shapeOverride,
}: {
  campaignId: number;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  goal: bigint;
  raised: bigint;
  /** Called after a confirmed donation so the page can re-read the tally. */
  onDonated?: () => void;
  /**
   * Force a specific action shape. Only for diagnosing wallet behaviour —
   * `withdraw-then-invoke` is the proven default.
   */
  shapeOverride?: DonateShape;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [account, setAccount] = useState<Strk20Account | null>(null);
  const [walletName, setWalletName] = useState<string>("");
  const [shielded, setShielded] = useState<bigint | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  const remaining = goal > raised ? goal - raised : 0n;

  const parsed = parseAmount(amountInput, tokenDecimals);
  const amountValid = parsed !== null && parsed > 0n;
  const overBalance =
    amountValid && shielded !== null && parsed! > shielded;

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
    setWalletName(res.walletName);

    const bal = await readShieldedBalance(res.account, token);
    if (bal.ok) {
      setShielded(bal.balance);
      setNotRegistered(false);
    } else if (bal.reason === "not-registered") {
      setNotRegistered(true);
      setShielded(0n);
    } else {
      setShielded(null);
    }

    setPhase("ready");
  }, [token]);

  useEffect(() => {
    if (phase === "ready") amountRef.current?.focus();
  }, [phase]);

  const submit = useCallback(async () => {
    if (!account || !amountValid) return;

    setError(null);
    setPhase("confirming");

    const secret = generateSecret();

    try {
      // No dry run here on purpose.
      //
      // strk20PrepareInvoke triggers its own wallet prompt, so running it before
      // strk20InvokeTransaction made users approve twice for one donation. The
      // dry run existed to resolve which action shape the pool accepts; that is
      // now settled empirically on mainnet (see lib/actions.ts), so the cost no
      // longer buys anything. verifyDonateShape() remains exported for
      // diagnostics if the protocol changes.
      setPhase("confirming");

      const actions = buildDonateActions({
        token,
        amount: parsed!,
        campaignId,
        secret,
        shape: shapeOverride,
      });

      setPhase("submitting");
      const { transaction_hash } = await account.strk20InvokeTransaction(actions);

      setTxHash(transaction_hash);
      setRecoveryCode(secretToRecoveryCode(secret));
      setPhase("done");

      // Pull the new tally in without making the user reload.
      //
      // The tally is the whole point of the product, so it moving is the
      // feedback that matters. It lags the transaction by a block or two, so we
      // re-read a few times with a backoff rather than once and hoping.
      onDonated?.();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      const up = m.toUpperCase();
      if (up.includes("USER_REFUSED") || up.includes("REJECT")) {
        setError({
          title: "Cancelled",
          body: "Nothing was sent. Your funds are untouched.",
        });
      } else if (up.includes("INSUFFICIENT_PRIVATE_BALANCE")) {
        setError({
          title: "Not enough shielded balance",
          body: "Shield more funds in your wallet, then come back.",
        });
      } else if (up.includes("NOT_REGISTERED")) {
        setError({
          title: "Wallet not registered with the pool",
          body: "Shield any amount once in your wallet — that registers you — then try again.",
        });
      } else {
        setError({ title: "The donation didn't go through", body: m });
      }
      setPhase("error");
    }
  }, [account, amountValid, parsed, token, campaignId, onDonated, shapeOverride]);

  // ---------- Success ----------
  if (phase === "done" && txHash) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
        <p className="font-medium text-emerald-900 dark:text-emerald-200">
          Your donation counted.
        </p>
        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300/80">
          The total went up. Your address did not appear anywhere on this page.
        </p>

        {recoveryCode && (
          <div className="mt-4 rounded-md border border-emerald-300/70 bg-white/70 p-3 dark:border-emerald-900 dark:bg-stone-900/60">
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
              Save this refund code
            </p>
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
              If this campaign misses its goal, this code is what lets you claim
              your money back. It is shown once and is not stored anywhere.
            </p>
            <code className="mt-2 block break-all rounded bg-stone-100 px-2 py-1.5 font-mono text-xs text-stone-800 dark:bg-stone-800 dark:text-stone-200">
              {recoveryCode}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(recoveryCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-2 rounded border border-stone-300 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
            <span aria-live="polite" className="sr-only">
              {copied ? "Refund code copied to clipboard" : ""}
            </span>
          </div>
        )}

        <a
          href={`${VOYAGER_TX}${txHash}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-block text-sm underline decoration-emerald-400 underline-offset-4 hover:text-emerald-950 dark:hover:text-emerald-100"
        >
          View transaction
        </a>
      </div>
    );
  }

  // ---------- Not connected ----------
  if (phase === "idle" || phase === "connecting") {
    return (
      <div>
        <button
          type="button"
          onClick={connect}
          disabled={phase === "connecting"}
          className="w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
        >
          {phase === "connecting" ? "Opening wallet…" : "Give privately"}
        </button>
        <p className="mt-2 text-center text-xs text-stone-500 dark:text-stone-500">
          Needs a wallet with shielded balances, like Ready.
        </p>
      </div>
    );
  }

  // ---------- Error ----------
  if (phase === "error" && error) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
        <p className="font-medium text-red-900 dark:text-red-200">
          {error.title}
        </p>
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

  const busy = phase === "confirming" || phase === "submitting";

  // ---------- Connected: amount entry ----------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-500">
        <span>Connected: {walletName}</span>
        {shielded !== null && (
          <span className="tabular-nums">
            Shielded: {formatAmount(shielded, tokenDecimals, 6)} {tokenSymbol}
          </span>
        )}
      </div>

      {raised >= goal && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <strong className="font-medium">Goal reached.</strong> Giving stays open
          until the deadline — anything extra goes to the same cause.
        </p>
      )}

      {notRegistered && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          Your wallet isn&apos;t registered with the privacy pool yet. Shield any
          amount once in your wallet — that registers you — then come back.
        </p>
      )}

      <div>
        <label
          htmlFor="give-amount"
          className="block text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Amount
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            ref={amountRef}
            id="give-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.00"
            aria-describedby="give-amount-help"
            aria-invalid={amountInput !== "" && !amountValid}
            disabled={busy}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 tabular-nums text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          />
          <span className="shrink-0 text-sm text-stone-500 dark:text-stone-400">
            {tokenSymbol}
          </span>
        </div>

        <p id="give-amount-help" className="mt-1.5 text-xs text-stone-500 dark:text-stone-500">
          {remaining > 0n
            ? `${formatAmount(remaining, tokenDecimals, 6)} ${tokenSymbol} still needed to reach the goal.`
            : "This campaign has already reached its goal — extra still helps."}
        </p>

        {amountInput !== "" && !amountValid && (
          <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
            Enter a number with at most {tokenDecimals} decimal places.
          </p>
        )}
        {overBalance && (
          <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
            That&apos;s more than your shielded balance.
          </p>
        )}
      </div>

      <HonestyPanel />

      <button
        type="button"
        onClick={submit}
        disabled={!amountValid || overBalance || busy || notRegistered}
        className="w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
      >
        {phase === "confirming"
          ? "Confirm in your wallet…"
          : phase === "submitting"
            ? "Proving and sending…"
            : raised >= goal
              ? "Add to it"
              : "Give"}
      </button>

      <p aria-live="polite" className="text-center text-xs text-stone-500 dark:text-stone-500">
        {phase === "submitting"
          ? "Generating a zero-knowledge proof. This can take a while — keep this tab open."
          : ""}
      </p>
    </div>
  );
}
