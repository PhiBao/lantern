import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start a campaign — Lantern",
  description:
    "Raise money with a public total and private donors, on Starknet mainnet.",
};

export default function NewCampaignPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">
        Start a campaign
      </h1>
      <p className="mt-3 leading-relaxed text-stone-600 dark:text-stone-400">
        You set a goal and a deadline. Lantern shows the world how much has been
        raised and how many people gave — and never who they were.
      </p>

      <ol className="mt-8 space-y-5">
        <Step n={1} title="Set a goal and a deadline">
          Both are public. If the goal is not met by the deadline, everyone who
          gave can claim a refund and you receive nothing.
        </Step>
        <Step n={2} title="Share your link">
          Anyone can open the campaign page and see the progress. No wallet, no
          account, no sign-up needed to look.
        </Step>
        <Step n={3} title="Collect privately">
          If you hit the goal, you claim the funds into a shielded balance. The
          payout is not linked to your public wallet.
        </Step>
      </ol>

      <div className="mt-10 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <p className="font-medium">Not open yet</p>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Campaign creation is being wired up. In the meantime you can see a live
          campaign running on Starknet mainnet.
        </p>
        <Link
          href="/c/1"
          className="mt-4 inline-block rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
        >
          View campaign #1
        </Link>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400"
      >
        {n}
      </span>
      <div>
        <p className="font-medium text-stone-900 dark:text-stone-100">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          {children}
        </p>
      </div>
    </li>
  );
}
