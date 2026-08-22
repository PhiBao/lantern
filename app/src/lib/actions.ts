import type { STRK20_ACTION } from "@starknet-io/types-js";
import { LANTERN_ADDRESS } from "./config";
import { computeDonationCommitment } from "./commitments";

/**
 * STRK20 action builders — the ONE place the wire format is decided.
 *
 * The docs are genuinely ambiguous about how the pool learns the input leg of a
 * `privacy_invoke`. Two readings exist:
 *
 *   A. An explicit `withdraw` action moves tokens to the helper, then `invoke`
 *      runs. Supported by the escrow reference: "Tokens already transferred by
 *      the pool via Withdraw. Return empty span."
 *
 *   B. The pool infers token+amount from leading calldata. Implied by the swap
 *      example, which shows only transfer(OPEN) + invoke yet states "the pool
 *      withdraws amountIn to your helper".
 *
 * We ship A and keep B one line away, because the cost of guessing wrong is a
 * failed mainnet transaction rather than a compile error. `verifyDonateShape()`
 * resolves it against the live pool via a simulate-only dry run.
 *
 * See docs/ACTION-SHAPES.md.
 */

/** Matches the Cairo `LanternOperation` enum discriminant order. */
export const OP = {
  Donate: "0x0",
  ClaimRefund: "0x1",
  ClaimPayout: "0x2",
} as const;

export type DonateShape = "withdraw-then-invoke" | "invoke-only";

/**
 * Active shape — CONFIRMED against the live mainnet pool.
 *
 * Donate tx 0x0449e60d...620689 succeeded with withdraw-then-invoke and moved
 * campaign #2's tally from 0 to 0.300000 with backer_count 1. Reading B
 * (invoke-only) is retained for reference but is not the wire format.
 */
export const DONATE_SHAPE: DonateShape = "withdraw-then-invoke";

function toFelt(v: bigint | number | string): string {
  if (typeof v === "string") return v.startsWith("0x") ? v : "0x" + BigInt(v).toString(16);
  return "0x" + BigInt(v).toString(16);
}

/**
 * Donate: the pool moves `amount` into Lantern, Lantern records the commitment
 * and parks the funds, returning an empty span. No open note is created because
 * nothing is credited back to the giver.
 */
export function buildDonateActions(params: {
  token: string;
  amount: bigint;
  campaignId: number;
  secret: string;
  shape?: DonateShape;
}): STRK20_ACTION[] {
  const { token, amount, campaignId, secret } = params;
  const shape = params.shape ?? DONATE_SHAPE;

  const commitmentHash = computeDonationCommitment(campaignId, secret);

  const invoke: STRK20_ACTION = {
    type: "invoke",
    contract: LANTERN_ADDRESS,
    calldata: [
      token,
      toFelt(amount),
      OP.Donate,
      toFelt(campaignId),
      commitmentHash,
      "0x0", // note_id unused on donate
      "0x0", // secret never leaves the browser on donate
    ],
  };

  if (shape === "invoke-only") return [invoke];

  return [
    { type: "withdraw", token, amount: toFelt(amount), recipient: LANTERN_ADDRESS },
    invoke,
  ];
}

/**
 * Claim (refund or payout): an open note is created first, then Lantern
 * approves the pool and returns an OpenNoteDeposit naming that note.
 *
 * `amount: 0` in the calldata signals "no withdrawal" — the contract already
 * holds the funds.
 */
export function buildClaimActions(params: {
  token: string;
  campaignId: number;
  secret: string;
  recipient: string;
  kind: "refund" | "payout";
}): STRK20_ACTION[] {
  const { token, campaignId, secret, recipient, kind } = params;

  return [
    { type: "transfer", token, amount: "OPEN", recipient },
    {
      type: "invoke",
      contract: LANTERN_ADDRESS,
      calldata: [
        token,
        "0x0", // amount = 0 -> nothing withdrawn from the pool
        kind === "refund" ? OP.ClaimRefund : OP.ClaimPayout,
        toFelt(campaignId),
        "0x0", // commitment_hash recomputed on-chain from the secret
        "${openNoteIds[0]}",
        secret,
      ],
    },
  ];
}

/**
 * Resolve the donate shape against the live pool.
 *
 * Runs both candidates as simulate-only dry runs and reports which the wallet
 * and pool accept. Cheap, submits nothing, and turns a guess into a fact.
 */
export async function verifyDonateShape(
  account: {
    strk20PrepareInvoke: (a: STRK20_ACTION[], simulate?: boolean) => Promise<unknown>;
  },
  params: { token: string; amount: bigint; campaignId: number; secret: string },
): Promise<{ shape: DonateShape | null; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};

  for (const shape of ["withdraw-then-invoke", "invoke-only"] as const) {
    try {
      await account.strk20PrepareInvoke(
        buildDonateActions({ ...params, shape }),
        true,
      );
      return { shape, errors };
    } catch (e) {
      errors[shape] = e instanceof Error ? e.message : String(e);
    }
  }

  return { shape: null, errors };
}
