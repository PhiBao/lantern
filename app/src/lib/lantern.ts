import { RpcProvider } from "starknet";
import { LANTERN_ADDRESS, rpcUrl, tokenByAddress } from "./config";
import { computeDonationCommitment } from "./commitments";

/**
 * Read-only access to the Lantern contract.
 *
 * Every number shown on a campaign page comes from here — there is no database
 * and no server state. That is deliberate: the tally is the product, so it has
 * to be verifiable by anyone against the chain.
 */

export type Campaign = {
  id: number;
  organizer: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  goal: bigint;
  raised: bigint;
  backerCount: number;
  deadline: number;
  payoutClaimed: boolean;
};

export type CampaignStatus =
  | "active"
  | "succeeded_unclaimed"
  | "succeeded_claimed"
  | "failed";

let provider: RpcProvider | null = null;

function getProvider(): RpcProvider {
  if (!provider) provider = new RpcProvider({ nodeUrl: rpcUrl() });
  return provider;
}

/** Selector-based raw call. Keeps us independent of ABI drift. */
async function call(entrypoint: string, calldata: string[] = []) {
  return getProvider().callContract({
    contractAddress: LANTERN_ADDRESS,
    entrypoint,
    calldata,
  });
}

export async function fetchCampaignCount(): Promise<number> {
  const res = await call("campaign_count");
  return Number(BigInt(res[0]));
}

/**
 * Decode a Campaign struct. Field order must match the Cairo struct:
 * organizer, token, goal, raised, backer_count, deadline, payout_claimed
 */
function decodeCampaign(id: number, raw: string[]): Campaign {
  const organizer = raw[0];
  const token = raw[1];
  const meta = tokenByAddress(token);
  return {
    id,
    organizer,
    token,
    tokenSymbol: meta?.symbol ?? "TOKEN",
    tokenDecimals: meta?.decimals ?? 18,
    goal: BigInt(raw[2]),
    raised: BigInt(raw[3]),
    backerCount: Number(BigInt(raw[4])),
    deadline: Number(BigInt(raw[5])),
    payoutClaimed: BigInt(raw[6]) === 1n,
  };
}

export async function fetchCampaign(id: number): Promise<Campaign | null> {
  try {
    const res = await call("get_campaign", ["0x" + id.toString(16)]);
    return decodeCampaign(id, res as unknown as string[]);
  } catch {
    // get_campaign asserts CAMPAIGN_NOT_FOUND for unknown ids.
    return null;
  }
}

/** Fetch all campaigns, newest first. */
export async function fetchCampaigns(): Promise<Campaign[]> {
  const count = await fetchCampaignCount();
  if (count === 0) return [];
  const ids = Array.from({ length: count }, (_, i) => count - i);
  const results = await Promise.all(ids.map((id) => fetchCampaign(id)));
  return results.filter((c): c is Campaign => c !== null);
}

export function campaignStatus(c: Campaign, nowSeconds: number): CampaignStatus {
  const ended = nowSeconds > c.deadline;
  const met = c.raised >= c.goal;

  // Giving stays open past the goal on purpose — overfunding is normal and the
  // extra goes to the same cause. Payout waits for the deadline either way,
  // which the contract enforces.
  if (!ended) return "active";

  if (!met) return "failed";
  return c.payoutClaimed ? "succeeded_claimed" : "succeeded_unclaimed";
}

/**
 * Resolve once a claim is visible on-chain.
 *
 * A payout flips the campaign's `payout_claimed`; a refund flips the stored
 * commitment's `claimed`. Either is proof the transaction landed, which lets the
 * UI stop depending on the wallet resolving its promise.
 */
export async function waitForClaimLanded(
  campaignId: number,
  kind: "refund" | "payout",
  secret: string,
  opts: { signal?: AbortSignal } = {},
): Promise<boolean> {
  const delays = [
    1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000,
    25000, 30000,
  ];

  for (const ms of delays) {
    if (opts.signal?.aborted) return false;
    await new Promise((r) => setTimeout(r, ms));
    if (opts.signal?.aborted) return false;

    try {
      if (kind === "payout") {
        const c = await fetchCampaign(campaignId);
        if (c?.payoutClaimed) return true;
      } else {
        const commitment = computeDonationCommitment(campaignId, secret);
        const res = await call("get_donation", [commitment]);
        // DonationEntry: campaign_id, token, amount, claimed
        if (res.length >= 4 && BigInt(res[3]) === 1n) return true;
      }
    } catch {
      // Transient RPC failure; later attempts retry.
    }
  }
  return false;
}

/**
 * Resolve once the campaign's raised total differs from `baseline`.
 *
 * Wallets do not agree on when to resolve a private transaction: some return as
 * soon as it is submitted, others hold the promise until it is accepted, and at
 * least one appears not to resolve it at all. Waiting on the wallet alone leaves
 * the UI stuck on "sending" for a donation that has already landed.
 *
 * The chain is the authority, so watch it directly. Resolves with the updated
 * campaign, or null if nothing changed inside the window.
 */
export async function waitForRaisedChange(
  campaignId: number,
  baseline: bigint,
  opts: { signal?: AbortSignal } = {},
): Promise<Campaign | null> {
  // ~2 minutes total, front-loaded since most donations land within ~20s.
  const delays = [
    1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000,
    25000, 30000,
  ];

  for (const ms of delays) {
    if (opts.signal?.aborted) return null;
    await new Promise((r) => setTimeout(r, ms));
    if (opts.signal?.aborted) return null;

    try {
      const fresh = await fetchCampaign(campaignId);
      if (fresh && fresh.raised !== baseline) return fresh;
    } catch {
      // Transient RPC failure; later attempts retry.
    }
  }
  return null;
}
