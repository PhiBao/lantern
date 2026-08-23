import { describe, expect, it } from "vitest";
import { campaignStatus, type Campaign } from "./lantern";

const base: Campaign = {
  id: 1,
  organizer: "0x1",
  token: "0x2",
  tokenSymbol: "USDC",
  tokenDecimals: 6,
  goal: 1_000_000n,
  raised: 0n,
  backerCount: 0,
  deadline: 2000,
  payoutClaimed: false,
};

describe("campaignStatus", () => {
  it("is active before the deadline", () => {
    expect(campaignStatus(base, 1000)).toBe("active");
  });

  it("stays active once the goal is met, so overfunding is possible", () => {
    // Deliberate: extra contributions go to the same cause.
    expect(campaignStatus({ ...base, raised: 1_000_000n }, 1000)).toBe("active");
    expect(campaignStatus({ ...base, raised: 5_000_000n }, 1000)).toBe("active");
  });

  it("fails when the deadline passes short of the goal", () => {
    expect(campaignStatus({ ...base, raised: 999_999n }, 3000)).toBe("failed");
  });

  it("succeeds unclaimed when the goal was met exactly", () => {
    expect(campaignStatus({ ...base, raised: 1_000_000n }, 3000)).toBe(
      "succeeded_unclaimed",
    );
  });

  it("reports claimed once the payout is taken", () => {
    expect(
      campaignStatus({ ...base, raised: 1_000_000n, payoutClaimed: true }, 3000),
    ).toBe("succeeded_claimed");
  });

  it("treats the deadline instant itself as still open", () => {
    expect(campaignStatus(base, 2000)).toBe("active");
    expect(campaignStatus(base, 2001)).toBe("failed");
  });
});
