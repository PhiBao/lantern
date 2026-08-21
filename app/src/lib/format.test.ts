import { describe, expect, it } from "vitest";
import {
  formatAmount,
  parseAmount,
  progressPercent,
  rawProgressPercent,
  timeRemaining,
  shortAddress,
} from "./format";

describe("formatAmount", () => {
  it("formats whole USDC amounts", () => {
    expect(formatAmount(5_000_000n, 6)).toBe("5");
  });

  it("formats fractional amounts", () => {
    expect(formatAmount(5_500_000n, 6)).toBe("5.5");
    expect(formatAmount(1_250_000n, 6)).toBe("1.25");
  });

  it("adds thousands separators", () => {
    expect(formatAmount(1_234_000_000n, 6)).toBe("1,234");
  });

  it("handles zero", () => {
    expect(formatAmount(0n, 6)).toBe("0");
  });

  it("truncates beyond max fraction digits", () => {
    expect(formatAmount(1_239_999n, 6)).toBe("1.23");
  });
});

describe("parseAmount", () => {
  it("parses whole numbers", () => {
    expect(parseAmount("5", 6)).toBe(5_000_000n);
  });

  it("parses decimals", () => {
    expect(parseAmount("1.25", 6)).toBe(1_250_000n);
    expect(parseAmount("0.000001", 6)).toBe(1n);
  });

  it("rejects too many decimal places", () => {
    expect(parseAmount("1.1234567", 6)).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseAmount("abc", 6)).toBeNull();
    expect(parseAmount("", 6)).toBeNull();
    expect(parseAmount(".", 6)).toBeNull();
    expect(parseAmount("-5", 6)).toBeNull();
  });

  it("round-trips with formatAmount", () => {
    const parsed = parseAmount("42.5", 6);
    expect(parsed).not.toBeNull();
    expect(formatAmount(parsed!, 6)).toBe("42.5");
  });
});

describe("progressPercent", () => {
  it("computes partial progress", () => {
    expect(progressPercent(2_500_000n, 5_000_000n)).toBe(50);
  });

  it("caps at 100 for the bar", () => {
    expect(progressPercent(10_000_000n, 5_000_000n)).toBe(100);
  });

  it("reports true percentage uncapped", () => {
    expect(rawProgressPercent(10_000_000n, 5_000_000n)).toBe(200);
  });

  it("handles zero goal without dividing by zero", () => {
    expect(progressPercent(100n, 0n)).toBe(0);
  });

  it("handles zero raised", () => {
    expect(progressPercent(0n, 5_000_000n)).toBe(0);
  });
});

describe("timeRemaining", () => {
  const now = 1_000_000;

  it("reports days", () => {
    expect(timeRemaining(now + 86400 * 3, now)).toBe("3 days left");
  });

  it("singularizes one day", () => {
    expect(timeRemaining(now + 86400 * 1.5, now)).toBe("1 day left");
  });

  it("reports hours under two days", () => {
    expect(timeRemaining(now + 3600 * 5, now)).toBe("5 hours left");
  });

  it("reports minutes under an hour", () => {
    expect(timeRemaining(now + 60 * 30, now)).toBe("30 minutes left");
  });

  it("reports ended when past deadline", () => {
    expect(timeRemaining(now - 1, now)).toBe("Ended");
    expect(timeRemaining(now, now)).toBe("Ended");
  });
});

describe("shortAddress", () => {
  it("shortens long addresses", () => {
    expect(
      shortAddress(
        "0x06fed63d5a8a4af0d3edf59c01776883e29ee6730158a645a2c7204a0d93022c",
      ),
    ).toBe("0x06fe…022c");
  });

  it("leaves short values alone", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
  });
});
