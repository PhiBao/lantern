"use client";

import { WalletAccountV6, RpcProvider } from "starknet";
import type { STRK20_ACTION, STRK20_BALANCE_ENTRY } from "@starknet-io/types-js";
import { rpcUrl } from "./config";

/**
 * Wallet connection and capability detection.
 *
 * Only a subset of Starknet wallets implement the STRK20 Wallet API — at time of
 * writing, Ready (mainnet) and Xverse (dapp support in progress). Detecting that
 * BEFORE offering the give button is the difference between "this wallet cannot
 * do it yet" and a transaction that dies half way through.
 */

export type Strk20Account = {
  address: string;
  /** Plain Starknet call — used for create_campaign, which bypasses the pool. */
  execute: (calls: {
    contractAddress: string;
    entrypoint: string;
    calldata: string[];
  }[]) => Promise<{ transaction_hash: string }>;
  strk20Balances: (tokens: string[]) => Promise<STRK20_BALANCE_ENTRY[]>;
  strk20PrepareInvoke: (
    actions: STRK20_ACTION[],
    simulate?: boolean,
  ) => Promise<unknown>;
  strk20InvokeTransaction: (
    actions: STRK20_ACTION[],
  ) => Promise<{ transaction_hash: string }>;
};

export type ConnectResult =
  | { ok: true; account: Strk20Account; walletName: string }
  | { ok: false; reason: ConnectFailure; walletName?: string; detail?: string };

export type ConnectFailure =
  | "no-wallet-found"
  | "user-cancelled"
  | "no-strk20-support"
  | "wrong-network"
  | "unknown";

/**
 * Discover installed wallets that expose the Starknet wallet standard.
 *
 * get-starknet v6 exposes a reactive store rather than a one-shot getter.
 * Injected wallets can register slightly after page load, so we refresh and
 * give them a brief moment before concluding nothing is installed.
 */
export async function discoverWallets() {
  const { createStore } = await import(
    "@starknet-io/get-starknet-discovery"
  );
  const store = createStore();

  let wallets = store.getWallets();
  if (wallets.length === 0) {
    store._refreshInjectedWallets();
    await new Promise((r) => setTimeout(r, 250));
    wallets = store.getWallets();
  }
  return wallets;
}

/**
 * Connect and verify STRK20 capability.
 *
 * Capability is checked by probing for the methods rather than trusting a
 * version string, because a wallet can advertise the spec and still not
 * implement the STRK20 surface.
 */
export async function connectWallet(): Promise<ConnectResult> {
  let wallets: Awaited<ReturnType<typeof discoverWallets>>;

  try {
    wallets = await discoverWallets();
  } catch (e) {
    return { ok: false, reason: "unknown", detail: msg(e) };
  }

  if (!wallets || wallets.length === 0) {
    return { ok: false, reason: "no-wallet-found" };
  }

  // Prefer a wallet that advertises STRK20 support.
  const ordered = [...wallets].sort(
    (a, b) => score(b) - score(a),
  );
  const chosen = ordered[0];
  const walletName = nameOf(chosen);

  let account: WalletAccountV6;
  try {
    account = await WalletAccountV6.connect(
      new RpcProvider({ nodeUrl: rpcUrl() }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chosen as any,
    );
  } catch (e) {
    const m = msg(e).toLowerCase();
    if (m.includes("reject") || m.includes("cancel") || m.includes("denied")) {
      return { ok: false, reason: "user-cancelled", walletName };
    }
    return { ok: false, reason: "unknown", walletName, detail: msg(e) };
  }

  const hasStrk20 =
    typeof account.strk20InvokeTransaction === "function" &&
    typeof account.strk20PrepareInvoke === "function" &&
    typeof account.strk20Balances === "function";

  if (!hasStrk20) {
    return { ok: false, reason: "no-strk20-support", walletName };
  }

  return {
    ok: true,
    walletName,
    account: {
      address: account.address,
      execute: (calls) =>
        account.execute(calls) as Promise<{ transaction_hash: string }>,
      strk20Balances: (tokens) => account.strk20Balances(tokens as never),
      strk20PrepareInvoke: (actions, simulate) =>
        account.strk20PrepareInvoke(actions, simulate),
      strk20InvokeTransaction: (actions) =>
        account.strk20InvokeTransaction(actions),
    },
  };
}

/**
 * Confirm the wallet can actually report a shielded balance.
 *
 * A wallet that has never registered a viewing key throws NOT_REGISTERED here,
 * which is a distinct and recoverable state worth surfacing on its own.
 */
export async function readShieldedBalance(
  account: Strk20Account,
  token: string,
): Promise<{ ok: true; balance: bigint } | { ok: false; reason: string }> {
  try {
    const entries = await account.strk20Balances([token]);
    const hit = entries.find(
      (e) =>
        BigInt(e.token) === BigInt(token) ||
        e.token.toLowerCase() === token.toLowerCase(),
    );
    return { ok: true, balance: hit ? BigInt(hit.balance) : 0n };
  } catch (e) {
    const m = msg(e);
    if (m.toUpperCase().includes("NOT_REGISTERED")) {
      return { ok: false, reason: "not-registered" };
    }
    return { ok: false, reason: m };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nameOf(w: any): string {
  return w?.name ?? w?.id ?? "your wallet";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function score(w: any): number {
  const features = w?.features ?? {};
  return Object.keys(features).some((k) => k.toLowerCase().includes("strk20"))
    ? 1
    : 0;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Turn a failure into copy a non-technical user can act on. */
export function explainFailure(r: Extract<ConnectResult, { ok: false }>): {
  title: string;
  body: string;
} {
  switch (r.reason) {
    case "no-wallet-found":
      return {
        title: "No Starknet wallet found",
        body: "Giving privately needs a wallet that supports shielded balances. Ready supports this on mainnet today.",
      };
    case "no-strk20-support":
      return {
        title: `${r.walletName ?? "That wallet"} can't do private transfers yet`,
        body: "Shielded balances need a privacy-enabled wallet. Ready supports this on mainnet today; Xverse support is in progress.",
      };
    case "user-cancelled":
      return {
        title: "Connection cancelled",
        body: "Nothing happened. You can try again whenever you're ready.",
      };
    case "wrong-network":
      return {
        title: "Wrong network",
        body: "Lantern runs on Starknet mainnet. Switch networks in your wallet and try again.",
      };
    default:
      return {
        title: "Couldn't connect",
        body: r.detail ?? "Something went wrong reaching your wallet.",
      };
  }
}
