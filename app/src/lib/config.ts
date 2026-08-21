/**
 * Lantern configuration — Starknet mainnet.
 *
 * The RPC key is read from the environment. Never commit a key.
 * Falls back to a public endpoint so the public campaign pages still render
 * without any configuration.
 */

export const CHAIN_ID = "SN_MAIN" as const;

/** Deployed Lantern anonymizer contract. */
export const LANTERN_ADDRESS =
  "0x06fed63d5a8a4af0d3edf59c01776883e29ee6730158a645a2c7204a0d93022c";

/** The canonical STRK20 privacy pool. */
export const POOL_ADDRESS =
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

/**
 * Tokens Lantern supports.
 *
 * Starknet has two live USDC deployments and they are NOT interchangeable:
 *
 * - USDC  (native, ByteArray metadata) — 0x033068f6…  ← default for new campaigns
 * - USDC.e (older bridged, felt252 short-string metadata) — 0x053c9125…
 *
 * A campaign's token is fixed at creation, so a balance in one cannot fund a
 * campaign denominated in the other. Both are listed so existing campaigns keep
 * rendering correct symbols and decimals.
 */
export const TOKENS = {
  USDC: {
    address:
      "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
    symbol: "USDC",
    decimals: 6,
  },
  USDCe: {
    address:
      "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    symbol: "USDC.e",
    decimals: 6,
  },
} as const;

/** The token new campaigns are denominated in. */
export const DEFAULT_TOKEN = TOKENS.USDC;

export type TokenKey = keyof typeof TOKENS;

/** Look up token metadata by address. Returns undefined for unknown tokens. */
export function tokenByAddress(address: string) {
  const normalized = normalizeAddress(address);
  return Object.values(TOKENS).find(
    (t) => normalizeAddress(t.address) === normalized,
  );
}

/**
 * Starknet addresses are felts, so the same address can appear with or without
 * leading zeros. Compare and key on the normalized form.
 */
export function normalizeAddress(address: string): string {
  if (!address) return "";
  const hex = address.toLowerCase().replace(/^0x/, "").replace(/^0+/, "");
  return "0x" + (hex || "0");
}

/**
 * RPC endpoint.
 *
 * Set `NEXT_PUBLIC_STARKNET_RPC_URL` to a dedicated key (Alchemy recommended):
 *   https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_8/<KEY>
 *
 * The fallback is a public endpoint so campaign pages still render for someone
 * who clones this repo with no configuration. Public endpoints are rate-limited
 * and must not be relied on in production.
 *
 * Note: Blast API endpoints are discontinued and will fail.
 */
export function rpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_STARKNET_RPC_URL ?? "https://rpc.starknet.lava.build"
  );
}

export const VOYAGER_TX = "https://voyager.online/tx/";
export const VOYAGER_CONTRACT = "https://voyager.online/contract/";
