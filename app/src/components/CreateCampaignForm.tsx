"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generateSecret, computePayoutCommitment, secretToRecoveryCode } from "@/lib/commitments";
import { parseAmount, formatAmount } from "@/lib/format";
import { DEFAULT_TOKEN, LANTERN_ADDRESS, VOYAGER_TX } from "@/lib/config";
import { fetchCampaignCount } from "@/lib/lantern";
import { connectWallet, explainFailure, type Strk20Account } from "@/lib/wallet";

type Phase = "idle" | "connecting" | "ready" | "submitting" | "done" | "error";

const DURATIONS = [
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "1 week", seconds: 604800 },
  { label: "2 weeks", seconds: 1209600 },
  { label: "30 days", seconds: 2592000 },
];

/**
 * Create a campaign.
 *
 * `create_campaign` is a plain contract call, not a pool operation — the
 * organizer calls it directly. What makes it delicate is the payout key: it is
 * generated in the browser, hashed, and only the hash goes on-chain. Lose the
 * key and the funds are unreachable, so the flow refuses to finish until the
 * organizer confirms they have saved it.
 */
export function CreateCampaignForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [account, setAccount] = useState<Strk20Account | null>(null);
  const [goalInput, setGoalInput] = useState("");
  const [durationIdx, setDurationIdx] = useState(2);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [result, setResult] = useState<{
    txHash: string;
    payoutKey: string;
    campaignId: number | null;
  } | null>(null);
  const [savedKey, setSavedKey] = useState(false);

  const token = DEFAULT_TOKEN;
  const goal = useMemo(
    () => parseAmount(goalInput, token.decimals),
    [goalInput, token.decimals],
  );
  const goalValid = goal !== null && goal > 0n;

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
    if (!account || !goalValid) return;
    setError(null);
    setPhase("submitting");

    try {
      // Predict the id so we can hash the commitment for the right campaign.
      // create_campaign assigns sequentially, so the next id is count + 1.
      const count = await fetchCampaignCount();
      const nextId = count + 1;

      const secret = generateSecret();
      const commitment = computePayoutCommitment(nextId, secret);
      const deadline =
        Math.floor(Date.now() / 1000) + DURATIONS[durationIdx].seconds;

      const { transaction_hash } = await account.execute([
        {
          contractAddress: LANTERN_ADDRESS,
          entrypoint: "create_campaign",
          calldata: [
            token.address,
            "0x" + goal!.toString(16),
            "0x" + deadline.toString(16),
            commitment,
          ],
        },
      ]);

      setResult({
        txHash: transaction_hash,
        payoutKey: secretToRecoveryCode(secret),
        campaignId: nextId,
      });
      setPhase("done");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      const up = m.toUpperCase();
      if (up.includes("USER_REFUSED") || up.includes("REJECT")) {
        setError({ title: "Cancelled", body: "No campaign was created." });
      } else if (up.includes("DEADLINE_IN_PAST")) {
        setError({
          title: "Deadline already passed",
          body: "Pick a longer duration and try again.",
        });
      } else if (up.includes("ZERO_GOAL")) {
        setError({ title: "Goal must be above zero", body: "Enter an amount." });
      } else {
        setError({ title: "Couldn't create the campaign", body: m });
      }
      setPhase("error");
    }
  }, [account, goalValid, goal, durationIdx, token.address]);

  // ---------- Created ----------
  if (phase === "done" && result) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
        <p className="font-medium text-emerald-900 dark:text-emerald-200">
          Campaign created.
        </p>

        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/50">
          <p className="text-sm font-semibold text-red-900 dark:text-red-200">
            Save your payout key now
          </p>
          <p className="mt-1 text-xs text-red-800 dark:text-red-300/90">
            This is the only thing that can release the funds if you hit your
            goal. It is shown once, it is not stored anywhere, and it cannot be
            recovered. Without it the money stays locked in the contract forever.
          </p>
          <code className="mt-2 block break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-stone-900 dark:bg-stone-900 dark:text-stone-100">
            {result.payoutKey}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(result.payoutKey)}
            className="mt-2 rounded border border-red-300 px-2.5 py-1 text-xs font-medium text-red-900 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/40"
          >
            Copy key
          </button>

          <label className="mt-3 flex items-start gap-2 text-xs text-red-900 dark:text-red-200">
            <input
              type="checkbox"
              checked={savedKey}
              onChange={(e) => setSavedKey(e.target.checked)}
              className="mt-0.5"
            />
            <span>I have saved this key somewhere safe.</span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!savedKey}
            onClick={() => router.push(`/c/${result.campaignId}`)}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
          >
            Open my campaign
          </button>
          <a
            href={`${VOYAGER_TX}${result.txHash}`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm underline decoration-emerald-400 underline-offset-4"
          >
            View transaction
          </a>
        </div>
      </div>
    );
  }

  // ---------- Error ----------
  if (phase === "error" && error) {
    return (
      <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40">
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
          className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100 dark:border-red-800 dark:text-red-200"
        >
          Try again
        </button>
      </div>
    );
  }

  // ---------- Not connected ----------
  if (phase === "idle" || phase === "connecting") {
    return (
      <div className="rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <p className="font-medium">Ready to start?</p>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Connect a wallet to create your campaign on Starknet mainnet.
        </p>
        <button
          type="button"
          onClick={connect}
          disabled={phase === "connecting"}
          className="mt-4 w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
        >
          {phase === "connecting" ? "Opening wallet…" : "Connect wallet"}
        </button>
      </div>
    );
  }

  // ---------- Form ----------
  return (
    <div className="space-y-5 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
      <div>
        <label htmlFor="goal" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          Funding goal
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="goal"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            placeholder="1000"
            aria-describedby="goal-help"
            aria-invalid={goalInput !== "" && !goalValid}
            disabled={phase === "submitting"}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 tabular-nums text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          />
          <span className="shrink-0 text-sm text-stone-500 dark:text-stone-400">
            {token.symbol}
          </span>
        </div>
        <p id="goal-help" className="mt-1.5 text-xs text-stone-500 dark:text-stone-500">
          If you don&apos;t reach this by the deadline, every backer can claim a
          refund and you receive nothing.
        </p>
        {goalInput !== "" && !goalValid && (
          <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
            Enter a number with at most {token.decimals} decimal places.
          </p>
        )}
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-stone-700 dark:text-stone-300">
          Runs for
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DURATIONS.map((d, i) => (
            <button
              key={d.label}
              type="button"
              onClick={() => setDurationIdx(i)}
              aria-pressed={durationIdx === i}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${
                durationIdx === i
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "border border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>

      {goalValid && (
        <p className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600 dark:bg-stone-900/60 dark:text-stone-400">
          Raising <strong className="text-stone-900 dark:text-stone-100">
            {formatAmount(goal!, token.decimals)} {token.symbol}
          </strong>{" "}
          over {DURATIONS[durationIdx].label}. Backers stay private; the total is
          public.
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!goalValid || phase === "submitting"}
        className="w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
      >
        {phase === "submitting" ? "Creating…" : "Create campaign"}
      </button>
    </div>
  );
}
