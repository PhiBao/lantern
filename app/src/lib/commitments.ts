import { hash } from "starknet";

/**
 * Commitment derivation — must stay byte-for-byte compatible with
 * `contracts/src/lantern.cairo`.
 *
 * Parity is locked by reference vectors in
 * `contracts/tests/test_commitments.cairo`. If you change anything here,
 * that test must be updated and must still pass.
 */

/** Domain tags, as short-string felts (matches Cairo's `'LANTERN_DONATE:V1'`). */
export const LANTERN_DONATE_TAG = shortStringToHex("LANTERN_DONATE:V1");
export const LANTERN_PAYOUT_TAG = shortStringToHex("LANTERN_PAYOUT:V1");

function shortStringToHex(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    out += s.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return "0x" + out;
}

/**
 * Generate a cryptographically random secret that fits inside felt252.
 *
 * felt252 holds values < 2^251 + 17*2^192 + 1, so we generate 248 bits and stay
 * comfortably inside the field. Using 256 bits would intermittently produce
 * values the contract cannot store — a bug that would only surface as an
 * unclaimable refund, so it is guarded here rather than validated later.
 */
export function generateSecret(): string {
  const bytes = new Uint8Array(31); // 248 bits
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return "0x" + hex.replace(/^0+/, "").padStart(2, "0");
}

/** poseidon(LANTERN_DONATE:V1, campaign_id, secret) */
export function computeDonationCommitment(
  campaignId: number,
  secret: string,
): string {
  return hash.computePoseidonHashOnElements([
    LANTERN_DONATE_TAG,
    campaignId.toString(),
    secret,
  ]);
}

/** poseidon(LANTERN_PAYOUT:V1, campaign_id, secret) */
export function computePayoutCommitment(
  campaignId: number,
  secret: string,
): string {
  return hash.computePoseidonHashOnElements([
    LANTERN_PAYOUT_TAG,
    campaignId.toString(),
    secret,
  ]);
}

/**
 * Format a secret as a human-transcribable recovery code.
 *
 * Donors need this if they ever claim from a different wallet, so it has to
 * survive being written on paper: uppercase, grouped, no 0x prefix.
 */
export function secretToRecoveryCode(secret: string): string {
  const hex = secret.replace(/^0x/, "").toUpperCase().padStart(62, "0");
  return (hex.match(/.{1,4}/g) ?? []).join("-");
}

/** Parse a recovery code back into a felt hex string. Returns null if invalid. */
export function recoveryCodeToSecret(code: string): string | null {
  const hex = code.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length === 0 || hex.length > 62) return null;
  return "0x" + hex.replace(/^0+/, "").padStart(2, "0");
}
