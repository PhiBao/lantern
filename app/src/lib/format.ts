/** Presentation helpers. Pure functions — unit tested in format.test.ts. */

/** Format a token amount from its smallest unit into a human string. */
export function formatAmount(
  raw: bigint,
  decimals: number,
  maxFractionDigits = 2,
): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;

  if (frac === 0n) return whole.toLocaleString("en-US");

  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return fracStr.length > 0
    ? `${whole.toLocaleString("en-US")}.${fracStr}`
    : whole.toLocaleString("en-US");
}

/** Parse a user-entered decimal amount into the token's smallest unit. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const trimmed = input.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    return null;
  }
  const [whole = "0", frac = ""] = trimmed.split(".");
  if (frac.length > decimals) return null;
  const padded = frac.padEnd(decimals, "0");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/** Progress toward goal as an integer percentage, capped at 100 for the bar. */
export function progressPercent(raised: bigint, goal: bigint): number {
  if (goal === 0n) return 0;
  const pct = Number((raised * 10000n) / goal) / 100;
  return Math.min(pct, 100);
}

/** True percentage, uncapped — so overfunded campaigns can say "142%". */
export function rawProgressPercent(raised: bigint, goal: bigint): number {
  if (goal === 0n) return 0;
  return Number((raised * 10000n) / goal) / 100;
}

/**
 * Human time remaining. Deliberately coarse: a donor deciding whether to give
 * needs "3 days left", not a ticking clock.
 */
export function timeRemaining(deadline: number, nowSeconds: number): string {
  const secs = deadline - nowSeconds;
  if (secs <= 0) return "Ended";

  const days = Math.floor(secs / 86400);
  if (days >= 2) return `${days} days left`;
  if (days === 1) return "1 day left";

  const hours = Math.floor(secs / 3600);
  if (hours >= 2) return `${hours} hours left`;
  if (hours === 1) return "1 hour left";

  const mins = Math.floor(secs / 60);
  if (mins >= 2) return `${mins} minutes left`;
  return "Ending now";
}

/** Shorten an address for display: 0x1234…abcd */
export function shortAddress(address: string): string {
  const hex = address.replace(/^0x/, "");
  if (hex.length <= 10) return address;
  return `0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export function formatDeadline(deadline: number): string {
  return new Date(deadline * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
