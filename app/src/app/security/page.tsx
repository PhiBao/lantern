import type { Metadata } from "next";
import { LANTERN_ADDRESS, POOL_ADDRESS, REPO_URL, SECURITY_MD_URL, VOYAGER_CONTRACT } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy & security — Lantern",
  description:
    "Exactly what Lantern hides, what it does not, and the known limits. Written plainly.",
};

/**
 * The honest page.
 *
 * A privacy product that hides its own limitations is the one users should
 * trust least, so this states the leaks in plain language rather than burying
 * them in a repo file. Kept in sync with SECURITY.md.
 */
export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">
        What Lantern hides — and what it doesn&apos;t
      </h1>
      <p className="mt-3 leading-relaxed text-stone-600 dark:text-stone-400">
        Lantern hides the <strong>giver</strong>, not the <strong>money</strong>.
        That distinction is the whole design, so it is worth being precise about.
      </p>

      <Section title="Hidden">
        <Item>
          <strong>Who gave.</strong> Your wallet address never appears on a
          campaign. The privacy pool moves the funds, so observers see the pool
          paying the Lantern contract — not you instructing it.
        </Item>
        <Item>
          <strong>The link between a deposit and a donation.</strong> Shielding
          funds and giving are separate events with no on-chain connection.
        </Item>
        <Item>
          <strong>Who claimed.</strong> Refunds and payouts are authorised by
          proving knowledge of a secret, not by an address.
        </Item>
      </Section>

      <Section title="Visible — on purpose">
        <Item>
          <strong>Donation amounts.</strong> Each donation&apos;s size is public.
          This is deliberate: it is what lets anyone verify the total is real.
          The amount is simply not attached to a name.
        </Item>
        <Item>
          <strong>The running total, goal, and backer count.</strong> Read
          straight from the contract by anyone.
        </Item>
        <Item>
          <strong>Deposits and withdrawals at the edges.</strong> Moving money
          into or out of the pool is a public ERC-20 transfer, as is its timing.
        </Item>
      </Section>

      <Section title="Known limits">
        <Item>
          <strong>Timing correlation.</strong> Shielding funds and immediately
          donating can let an observer connect the two by timing. Separating them
          — by hours, ideally — weakens that link considerably. The give flow
          warns you when it detects this.
        </Item>
        <Item>
          <strong>Distinctive amounts.</strong> An unusual figure is easier to
          single out than a round one. There is no technical fix; it is a matter
          of blending in.
        </Item>
        <Item>
          <strong>Claiming reveals a secret in calldata.</strong> Starknet does
          not expose a general public pending transaction pool, so this is hard
          to exploit — but it is not zero risk, and a future version should bind
          claims to a specific caller.
        </Item>
        <Item>
          <strong>Regulatory disclosure exists by design.</strong> STRK20
          screens every deposit, and each user&apos;s viewing key is encrypted to
          an auditor key at registration. Private from the public is not the same
          as private from lawful oversight.
        </Item>
      </Section>

      <Section title="How the contract protects the total">
        <Item>
          <strong>It measures, it doesn&apos;t trust.</strong> Each donation is
          derived from the contract&apos;s own measured balance change, not from
          a number the caller supplies. Since the public total is the entire
          basis for trusting a campaign, an inflatable tally would be fatal.
        </Item>
        <Item>
          <strong>Only the pool can drive it.</strong> The{" "}
          <code className="rounded bg-stone-100 px-1 py-0.5 text-xs dark:bg-stone-800">
            privacy_invoke
          </code>{" "}
          entrypoint rejects every caller except the STRK20 pool.
        </Item>
        <Item>
          <strong>Claims are single-use and campaign-scoped.</strong> A refund
          cannot be taken twice, and a code from one campaign is useless on
          another.
        </Item>
        <Item>
          <strong>Refunds and payouts are mutually exclusive.</strong> Refunds
          require the goal to have been missed; payout requires it met. Both
          require the deadline to have passed.
        </Item>
      </Section>

      <Section title="Status">
        <Item>
          <strong>Unaudited.</strong> Lantern was built for a hackathon. It runs
          on mainnet and the logic is tested, but it has had no professional
          security review. Do not entrust it with significant funds.
        </Item>
        <Item>
          <strong>No campaign moderation.</strong> Anyone can create a campaign.
          Deposit screening covers where the money came from, not what a campaign
          claims to be for.
        </Item>
      </Section>

      <section className="mt-10 rounded-xl border border-stone-200 p-5 text-sm dark:border-stone-800">
        <h2 className="font-medium">Verify it yourself</h2>
        <dl className="mt-3 space-y-2">
          <Ref label="Lantern contract" href={`${VOYAGER_CONTRACT}${LANTERN_ADDRESS}`} value={LANTERN_ADDRESS} />
          <Ref label="STRK20 pool" href={`${VOYAGER_CONTRACT}${POOL_ADDRESS}`} value={POOL_ADDRESS} />
        </dl>
        <p className="mt-4 text-stone-600 dark:text-stone-400">
          Source is public and MIT licensed:{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100">
            github.com/PhiBao/lantern
          </a>
          {" · "}
          <a href={SECURITY_MD_URL} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100">
            SECURITY.md
          </a>
        </p>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-xs font-medium uppercase tracking-widest text-stone-500 dark:text-stone-500">
        {title}
      </h2>
      <ul className="mt-3 space-y-3">{children}</ul>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
      {children}
    </li>
  );
}

function Ref({ label, href, value }: { label: string; href: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-stone-500 dark:text-stone-500">{label}</dt>
      <dd>
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all font-mono text-xs underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          {value}
        </a>
      </dd>
    </div>
  );
}
