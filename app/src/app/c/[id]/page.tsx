import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CampaignArt } from "@/components/CampaignArt";
import { LiveCampaign } from "@/components/LiveCampaign";
import { campaignStatus, fetchCampaign } from "@/lib/lantern";
import { formatAmount, formatDeadline, shortAddress, timeRemaining } from "@/lib/format";
import { LANTERN_ADDRESS, VOYAGER_CONTRACT } from "@/lib/config";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return { title: "Campaign — Lantern" };

  const c = await fetchCampaign(n).catch(() => null);
  if (!c) return { title: "Campaign — Lantern" };

  const title = `Campaign #${c.id} — Lantern`;
  const description = `${formatAmount(c.raised, c.tokenDecimals)} of ${formatAmount(c.goal, c.tokenDecimals)} ${c.tokenSymbol} raised from ${c.backerCount} backers. Donor identities are private.`;

  return { title, description, openGraph: { title, description } };
}

export default async function CampaignPage({ params }: Props) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) notFound();

  const campaign = await fetchCampaign(n).catch(() => null);
  if (!campaign) notFound();

  const now = Math.floor(Date.now() / 1000);
  const status = campaignStatus(campaign, now);
  const ended = status !== "active";

  return (
    <article className="mx-auto max-w-2xl px-5 py-12">
      <CampaignArt id={campaign.id} className="h-40 w-full rounded-2xl" />

      <header className="mt-7">
        <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-500">
          <span>Campaign #{campaign.id}</span>
          <span aria-hidden="true">·</span>
          <span>{ended ? "Ended" : timeRemaining(campaign.deadline, now)}</span>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
          A sealed fundraiser
        </h1>
        <p className="mt-3 leading-relaxed text-stone-600 dark:text-stone-400">
          Every contribution to this campaign counts toward the public total
          below. None of them can be traced back to the person who gave.
        </p>
      </header>

      <section className="mt-8 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <LiveCampaign
          campaignId={campaign.id}
          token={campaign.token}
          tokenSymbol={campaign.tokenSymbol}
          tokenDecimals={campaign.tokenDecimals}
          goal={campaign.goal}
          initialRaised={campaign.raised.toString()}
          initialBackerCount={campaign.backerCount}
          active={status === "active"}
        />

        <div className="mt-6">
          {status === "failed" && <RefundNotice />}
          {status === "succeeded_unclaimed" && <GoalMetNotice />}
          {status === "succeeded_claimed" && <FundedNotice />}
        </div>
      </section>

      {status === "active" && (
        <p className="mt-4 text-center text-xs text-stone-500 dark:text-stone-500">
          No account needed to read this page. A wallet is only required to give.
        </p>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        <Detail label="Deadline" value={formatDeadline(campaign.deadline)} />
        <Detail label="Token" value={campaign.tokenSymbol} />
        <Detail
          label="Organizer"
          value={shortAddress(campaign.organizer)}
          title={campaign.organizer}
        />
        <Detail
          label="Contract"
          value={
            <a
              href={`${VOYAGER_CONTRACT}${LANTERN_ADDRESS}`}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-stone-300 underline-offset-4 hover:text-stone-900 dark:decoration-stone-700 dark:hover:text-stone-100"
            >
              {shortAddress(LANTERN_ADDRESS)}
            </a>
          }
        />
      </dl>

      <p className="mt-8 text-xs leading-relaxed text-stone-500 dark:text-stone-500">
        Every figure on this page is read directly from the Lantern contract on
        Starknet mainnet. There is no database behind it — you can verify the
        total yourself on the block explorer.
      </p>
    </article>
  );
}

function Detail({
  label,
  value,
  title,
}: {
  label: string;
  value: React.ReactNode;
  title?: string;
}) {
  return (
    <div>
      <dt className="text-stone-500 dark:text-stone-500">{label}</dt>
      <dd
        className="mt-0.5 font-medium text-stone-900 dark:text-stone-100"
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

function RefundNotice() {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm dark:border-stone-800 dark:bg-stone-900/50">
      <p className="font-medium text-stone-900 dark:text-stone-100">
        The goal was not reached.
      </p>
      <p className="mt-1 text-stone-600 dark:text-stone-400">
        Everyone who gave can claim their money back, privately. Nothing is kept.
      </p>
    </div>
  );
}

function GoalMetNotice() {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
      <p className="font-medium text-emerald-900 dark:text-emerald-200">
        The goal was reached.
      </p>
      <p className="mt-1 text-emerald-800 dark:text-emerald-300/80">
        The organizer can now claim the funds privately.
      </p>
    </div>
  );
}

function FundedNotice() {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
      <p className="font-medium text-emerald-900 dark:text-emerald-200">
        Funded and claimed.
      </p>
      <p className="mt-1 text-emerald-800 dark:text-emerald-300/80">
        This campaign met its goal and the funds have been collected.
      </p>
    </div>
  );
}
