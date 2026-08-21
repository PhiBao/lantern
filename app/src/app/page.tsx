import Link from "next/link";
import { CampaignArt } from "@/components/CampaignArt";
import { campaignStatus, fetchCampaigns, type Campaign } from "@/lib/lantern";
import { formatAmount, progressPercent, timeRemaining } from "@/lib/format";

// Always read fresh from chain — a stale tally would undermine the whole point.
export const dynamic = "force-dynamic";

export default async function Home() {
  let campaigns: Campaign[] = [];
  let readFailed = false;

  try {
    campaigns = await fetchCampaigns();
  } catch {
    readFailed = true;
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <section className="max-w-xl">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
          Everyone sees the goal.
          <br />
          <span className="text-stone-400 dark:text-stone-500">
            No one sees the givers.
          </span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-stone-600 dark:text-stone-400">
          Fund what matters without ending up on a list. The total is public and
          verifiable on-chain. Who gave it is not.
        </p>
      </section>

      <section className="mt-14" aria-labelledby="campaigns-heading">
        <h2
          id="campaigns-heading"
          className="text-xs font-medium uppercase tracking-widest text-stone-500 dark:text-stone-500"
        >
          Campaigns
        </h2>

        {readFailed ? (
          <p
            role="status"
            className="mt-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-600 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-400"
          >
            Could not reach Starknet right now. The campaigns are still on-chain
            — this page just cannot read them at the moment. Try again shortly.
          </p>
        ) : campaigns.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-stone-300 px-4 py-12 text-center dark:border-stone-700">
            <p className="text-stone-600 dark:text-stone-400">
              No campaigns yet.
            </p>
            <Link
              href="/new"
              className="mt-4 inline-block rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              Start the first one
            </Link>
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {campaigns.map((c) => (
              <li key={c.id}>
                <CampaignRow campaign={c} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CampaignRow({ campaign: c, now }: { campaign: Campaign; now: number }) {
  const status = campaignStatus(c, now);
  const pct = progressPercent(c.raised, c.goal);

  return (
    <Link
      href={`/c/${c.id}`}
      className="group flex items-center gap-4 rounded-xl border border-stone-200 p-4 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-stone-800 dark:hover:border-stone-700 dark:hover:bg-stone-900/50"
    >
      <CampaignArt id={c.id} className="h-14 w-14 shrink-0 rounded-lg" />

      <div className="min-w-0 flex-1">
        <p className="font-medium text-stone-900 dark:text-stone-100">
          Campaign #{c.id}
        </p>
        <p className="mt-0.5 text-sm tabular-nums text-stone-600 dark:text-stone-400">
          {formatAmount(c.raised, c.tokenDecimals)} of{" "}
          {formatAmount(c.goal, c.tokenDecimals)} {c.tokenSymbol}
          <span className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
          {c.backerCount} {c.backerCount === 1 ? "backer" : "backers"}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div
            className={`h-full rounded-full ${
              c.raised >= c.goal ? "bg-emerald-600" : "bg-amber-500"
            }`}
            style={{ width: `${Math.max(pct, c.raised > 0n ? 2 : 0)}%` }}
          />
        </div>
      </div>

      <StatusBadge status={status} deadline={c.deadline} now={now} />
    </Link>
  );
}

function StatusBadge({
  status,
  deadline,
  now,
}: {
  status: ReturnType<typeof campaignStatus>;
  deadline: number;
  now: number;
}) {
  const base =
    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap";

  if (status === "active") {
    return (
      <span
        className={`${base} bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300`}
      >
        {timeRemaining(deadline, now)}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className={`${base} bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400`}
      >
        Refundable
      </span>
    );
  }
  return (
    <span
      className={`${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300`}
    >
      {status === "succeeded_claimed" ? "Funded" : "Goal met"}
    </span>
  );
}
