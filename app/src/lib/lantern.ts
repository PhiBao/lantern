import { RpcProvider } from "starknet";
import { LANTERN_ADDRESS, rpcUrl, tokenByAddress } from "./config";

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
  if (!ended) return "active";
  if (!met) return "failed";
  return c.payoutClaimed ? "succeeded_claimed" : "succeeded_unclaimed";
}
