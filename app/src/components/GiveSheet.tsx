"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildDonateActions } from "@/lib/actions";
import { generateSecret, secretToRecoveryCode } from "@/lib/commitments";
import { formatAmount, parseAmount } from "@/lib/format";
import { waitForRaisedChange } from "@/lib/lantern";
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
}: {
  campaignId: number;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  goal: bigint;
  raised: bigint;
  /** Called after a confirmed donation so the page can re-read the tally. */
  onDonated?: () => void;
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
  /** What the last successful donation sent, so the balance can be adjusted
   *  locally without asking the wallet. */
  const [lastSent, setLastSent] = useState<bigint | null>(null);
  /** Guards against a second submit while one is already in flight — a second
   *  wallet request is exactly how duplicate prompts get created. */
  const inFlight = useRef(false);

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

  /**
   * Force the field to match React state on mount.
   *
   * Browsers restore form values on reload and back-navigation, and they do it
   * before hydration. The restored text lands in the DOM while React still
   * believes the value is empty, so the field shows an old amount that cannot be
   * edited normally and the Give button stays disabled because state says there
   * is no amount. Revisiting a campaign link days later hits this.
   *
   * `autoComplete="off"` is not sufficient — restoration is separate from
   * autofill — so the DOM is corrected explicitly.
   */
  useEffect(() => {
    const el = amountRef.current;
    if (el && el.value !== "") el.value = "";
  }, []);

  const submit = useCallback(async () => {
    if (!account || !amountValid) return;
    if (inFlight.current) return;
    inFlight.current = true;

    setError(null);
    setPhase("confirming");

    const secret = generateSecret();

    try {
      const actions = buildDonateActions({
        token,
        amount: parsed!,
        campaignId,
        secret,
      });

      setPhase("submitting");

      // The wallet leads; the chain is a safety net.
      //
      // Wallets queue one approval per STRK20 action, so a donation legitimately
      // sits unfinished while the user works through them. Confirming from the
      // chain immediately declared success while an approval was still queued,
      // which surfaced as a stray prompt after the UI said "done". So we wait on
      // the wallet, and only fall back to chain confirmation if it stalls well
      // past the point a human would have finished approving.
      const RESCUE_AFTER_MS = 90_000;
      const abort = new AbortController();

      const viaWallet = account
        .strk20InvokeTransaction(actions)
        .then((r) => ({ kind: "wallet" as const, hash: r.transaction_hash }));

      const viaChain = waitForRaisedChange(campaignId, raised, {
        signal: abort.signal,
        initialDelayMs: RESCUE_AFTER_MS,
      }).then((c) =>
        c ? { kind: "chain" as const, hash: null } : null,
      );

      const winner = await Promise.race([
        viaWallet,
        viaChain.then((r) => r ?? new Promise<never>(() => {})),
      ]);

      abort.abort();

      setTxHash(winner.kind === "wallet" ? winner.hash : null);
      setRecoveryCode(secretToRecoveryCode(secret));
      setLastSent(parsed!);
      setPhase("done");

      // Refresh the tally on the page behind the sheet.
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
      } else if (up.includes("INVALID_REQUEST_PAYLOAD")) {
        setError({
          title: "The pool rejected the request",
          body: "This is a wiring problem on our side, not something you did. Nothing was sent and your funds are untouched.",
        });
      } else {
        setError({ title: "The donation didn't go through", body: m });
      }
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }, [account, amountValid, parsed, token, campaignId, onDonated, raised]);

  /**
   * Start a fresh donation after a successful one.
   *
   * Deliberately makes NO wallet call. Reading the shielded balance goes through
   * the wallet, and any such request makes the wallet flush approvals still
   * sitting in its queue — which surfaced a stale prompt carrying the previous
   * amount, seconds after the user had only pressed "Give again". Instead the
   * balance is decremented locally by what was just sent, which is exact.
   */
  const giveAgain = useCallback(() => {
    setShielded((prev) =>
      prev !== null && lastSent !== null && prev >= lastSent
        ? prev - lastSent
        : prev,
    );
    setLastSent(null);
    setAmountInput("");
    if (amountRef.current) amountRef.current.value = "";
    setTxHash(null);
    setRecoveryCode(null);
    setCopied(false);
    setError(null);
    setPhase("ready");
  }, [lastSent]);

  // ---------- Success ----------
  if (phase === "done") {
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

        {txHash ? (
          <a
            href={`${VOYAGER_TX}${txHash}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-block text-sm underline decoration-emerald-400 underline-offset-4 hover:text-emerald-950 dark:hover:text-emerald-100"
          >
            View transaction
          </a>
        ) : (
          <p className="mt-3 text-xs text-emerald-800/80 dark:text-emerald-300/70">
            Confirmed on-chain. Your wallet didn&apos;t hand back a transaction
            hash, so there&apos;s no link — the donation is recorded either way,
            as the total above shows.
          </p>
        )}

        <div className="mt-4 border-t border-emerald-300/60 pt-3 dark:border-emerald-900">
          <button
            type="button"
            onClick={giveAgain}
            className="rounded-md border border-emerald-400 bg-white/80 px-3 py-1.5 text-sm font-medium text-emerald-900 transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-emerald-800 dark:bg-stone-900/60 dark:text-emerald-200 dark:hover:bg-stone-900"
          >
            Give again
          </button>
          <p className="mt-2 text-xs text-emerald-800/80 dark:text-emerald-300/70">
            Save your refund code first — it disappears when you start another
            donation, and it cannot be recovered.
          </p>
        </div>
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

        {/*
          Preset amounts.

          Typing is not always available or reliable — mobile wallet browsers and
          restored form state both interfere with it — so every amount is
          reachable without the keyboard. These write straight to state, which
          also resets any stale value the browser left in the field.
        */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {["0.1", "0.5", "1", "5"].map((preset) => {
            const p = parseAmount(preset, tokenDecimals);
            const affordable = p !== null && (shielded === null || p <= shielded);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setAmountInput(preset)}
                disabled={busy || !affordable}
                aria-pressed={amountInput === preset}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-30 ${
                  amountInput === preset
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "border border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                }`}
              >
                {preset}
              </button>
            );
          })}

          {shielded !== null && shielded > 0n && (
            <button
              type="button"
              onClick={() =>
                setAmountInput(formatAmount(shielded, tokenDecimals, tokenDecimals))
              }
              disabled={busy}
              className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-30 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Max
            </button>
          )}

          {amountInput !== "" && (
            <button
              type="button"
              onClick={() => {
                setAmountInput("");
                if (amountRef.current) amountRef.current.value = "";
                amountRef.current?.focus();
              }}
              disabled={busy}
              className="rounded-full px-2 py-1 text-xs font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:text-stone-500 dark:hover:text-stone-300"
            >
              Clear
            </button>
          )}
        </div>

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

      <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-600 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-400">
        <strong className="font-medium text-stone-800 dark:text-stone-200">
          Your wallet will show two approval requests, often both at once.
        </strong>{" "}
        They look almost identical, and that is expected: a private donation is
        two steps — move the funds out of your shielded balance, then record the
        donation. <strong className="font-medium">Approve both.</strong> They are
        halves of one transaction, so nothing moves unless both go through, and
        you are never charged twice.
      </p>

      <button
        type="button"
        onClick={submit}
        disabled={!amountValid || overBalance || busy || notRegistered}
        className="w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
      >
        {phase === "confirming"
          ? "Approve both steps in your wallet…"
          : phase === "submitting"
            ? "Proving and sending…"
            : raised >= goal
              ? "Add to it"
              : "Give"}
      </button>

      <p aria-live="polite" className="text-center text-xs text-stone-500 dark:text-stone-500">
        {phase === "confirming"
          ? "Approve both requests in your wallet."
          : phase === "submitting"
            ? "Generating a zero-knowledge proof. If a second request is still open in your wallet, approve it — it is the other half of this donation."
            : ""}
      </p>
    </div>
  );
}
