"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressBar } from "./ProgressBar";
import { GiveSheet } from "./GiveSheet";
import { fetchCampaign } from "@/lib/lantern";

/**
 * The tally plus the give flow, kept in sync without a page reload.
 *
 * A donation is only believable if the number moves in front of you. The tally
 * lags the transaction by a block or two, so after a confirmed donation we
 * re-read on a backoff until it changes rather than reading once and giving up
 * — which is what made it look broken until a manual refresh.
 */
export function LiveCampaign({
  campaignId,
  token,
  tokenSymbol,
  tokenDecimals,
  goal,
  initialRaised,
  initialBackerCount,
  active,
  shapeOverride,
}: {
  campaignId: number;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  goal: bigint;
  initialRaised: string;
  initialBackerCount: number;
  active: boolean;
  shapeOverride?: "withdraw-then-invoke" | "invoke-only";
}) {
  const [raised, setRaised] = useState<bigint>(BigInt(initialRaised));
  const [backerCount, setBackerCount] = useState(initialBackerCount);
  const [syncing, setSyncing] = useState(false);
  const [bumped, setBumped] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const resync = useCallback(() => {
    const baseline = raised;
    setSyncing(true);

    // Widening backoff: most donations land within ~15s, but L2 inclusion can
    // occasionally take longer, so keep checking for about a minute.
    const delays = [2000, 4000, 7000, 11000, 16000, 24000, 35000, 50000];

    delays.forEach((ms) => {
      const t = setTimeout(async () => {
        try {
          const fresh = await fetchCampaign(campaignId);
          if (!fresh) return;
          if (fresh.raised !== baseline) {
            setRaised(fresh.raised);
            setBackerCount(fresh.backerCount);
            setSyncing(false);
            setBumped(true);
            setTimeout(() => setBumped(false), 1800);
            timers.current.forEach(clearTimeout);
          }
        } catch {
          /* transient RPC failure — later attempts will retry */
        }
      }, ms);
      timers.current.push(t);
    });

    // Stop claiming to sync even if nothing changed.
    const done = setTimeout(() => setSyncing(false), 55000);
    timers.current.push(done);
  }, [campaignId, raised]);

  return (
    <>
      <div className={bumped ? "animate-pulse" : undefined}>
        <ProgressBar
          raised={raised}
          goal={goal}
          decimals={tokenDecimals}
          symbol={tokenSymbol}
          backerCount={backerCount}
        />
      </div>

      {syncing && (
        <p
          aria-live="polite"
          className="mt-2 text-xs text-stone-500 dark:text-stone-500"
        >
          Waiting for the total to update on-chain…
        </p>
      )}

      {active && (
        <div className="mt-6">
          <GiveSheet
            campaignId={campaignId}
            token={token}
            tokenSymbol={tokenSymbol}
            tokenDecimals={tokenDecimals}
            goal={goal}
            raised={raised}
            onDonated={resync}
            shapeOverride={shapeOverride}
          />
        </div>
      )}
    </>
  );
}
