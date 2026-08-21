import { formatAmount, progressPercent, rawProgressPercent } from "@/lib/format";

/**
 * The public tally.
 *
 * This is the emotional core of the product: it moves when someone gives, and
 * it never says who. Status is conveyed in text as well as colour, and the live
 * region announces changes to screen readers.
 */
export function ProgressBar({
  raised,
  goal,
  decimals,
  symbol,
  backerCount,
}: {
  raised: bigint;
  goal: bigint;
  decimals: number;
  symbol: string;
  backerCount: number;
}) {
  const pct = progressPercent(raised, goal);
  const truePct = rawProgressPercent(raised, goal);
  const met = raised >= goal;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">
          {formatAmount(raised, decimals)}{" "}
          <span className="text-base font-normal text-stone-500 dark:text-stone-400">
            of {formatAmount(goal, decimals)} {symbol}
          </span>
        </p>
        <p className="shrink-0 text-sm tabular-nums text-stone-500 dark:text-stone-400">
          {truePct >= 999 ? "999+" : truePct.toFixed(truePct < 10 ? 1 : 0)}%
        </p>
      </div>

      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Funding progress: ${formatAmount(raised, decimals)} of ${formatAmount(goal, decimals)} ${symbol} raised`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            met ? "bg-emerald-600" : "bg-amber-500"
          }`}
          style={{ width: `${Math.max(pct, raised > 0n ? 1.5 : 0)}%` }}
        />
      </div>

      <p
        className="mt-3 text-sm text-stone-600 dark:text-stone-400"
        aria-live="polite"
      >
        <span className="font-medium text-stone-900 dark:text-stone-100 tabular-nums">
          {backerCount}
        </span>{" "}
        {backerCount === 1 ? "backer" : "backers"}
        <span className="mx-2 text-stone-300 dark:text-stone-700">·</span>
        <span className="text-stone-500 dark:text-stone-500">
          identities hidden
        </span>
      </p>
    </div>
  );
}
