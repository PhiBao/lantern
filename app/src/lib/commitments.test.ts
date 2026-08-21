import { describe, expect, it } from "vitest";
import {
  LANTERN_DONATE_TAG,
  LANTERN_PAYOUT_TAG,
  computeDonationCommitment,
  computePayoutCommitment,
  generateSecret,
  recoveryCodeToSecret,
  secretToRecoveryCode,
} from "./commitments";

/**
 * These vectors are the SAME ones asserted in
 * contracts/tests/test_commitments.cairo.
 *
 * If this test and that test do not agree, refunds become unclaimable — so the
 * duplication is intentional. Both sides must be updated together.
 */
const SECRET =
  "0x1a2b3c4d5e6f7788990011223344556677889900aabbccddeeff0011223344";
const EXPECTED_DONATE_C1 =
  "0x6b501900b5ad2061db0ea5f53b1724cd546b2192651a24af65f06476a58b996";
const EXPECTED_PAYOUT_C1 =
  "0x31a85510f4f85ab2ff017d6aca3947ab38498decae952444b3fb804363a320a";

describe("domain tags", () => {
  it("encodes the donate tag as Cairo does", () => {
    expect(LANTERN_DONATE_TAG).toBe("0x4c414e5445524e5f444f4e4154453a5631");
  });

  it("encodes the payout tag as Cairo does", () => {
    expect(LANTERN_PAYOUT_TAG).toBe("0x4c414e5445524e5f5041594f55543a5631");
  });
});

describe("commitment parity with Cairo", () => {
  it("matches the donation reference vector", () => {
    expect(computeDonationCommitment(1, SECRET)).toBe(EXPECTED_DONATE_C1);
  });

  it("matches the payout reference vector", () => {
    expect(computePayoutCommitment(1, SECRET)).toBe(EXPECTED_PAYOUT_C1);
  });

  it("scopes commitments per campaign", () => {
    expect(computeDonationCommitment(1, SECRET)).not.toBe(
      computeDonationCommitment(2, SECRET),
    );
  });

  it("separates donate and payout domains", () => {
    expect(computeDonationCommitment(1, SECRET)).not.toBe(
      computePayoutCommitment(1, SECRET),
    );
  });
});

describe("generateSecret", () => {
  const FELT_MAX = 2n ** 251n + 17n * 2n ** 192n + 1n;

  it("always produces a value inside felt252", () => {
    for (let i = 0; i < 200; i++) {
      expect(BigInt(generateSecret())).toBeLessThan(FELT_MAX);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateSecret()));
    expect(seen.size).toBe(100);
  });

  it("produces a usable commitment", () => {
    const secret = generateSecret();
    expect(computeDonationCommitment(1, secret)).toMatch(/^0x[0-9a-f]+$/);
  });
});

describe("recovery codes", () => {
  it("round-trips a secret", () => {
    const secret = generateSecret();
    const code = secretToRecoveryCode(secret);
    expect(recoveryCodeToSecret(code)).toBe(secret);
  });

  it("is grouped for transcription", () => {
    const code = secretToRecoveryCode(SECRET);
    // 62 hex chars -> 15 groups of 4 plus a trailing group of 2.
    expect(code).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{2,4})+$/);
    expect(code.split("-").every((g) => g.length >= 2 && g.length <= 4)).toBe(
      true,
    );
  });

  it("tolerates user-entered whitespace and lowercase", () => {
    const code = secretToRecoveryCode(SECRET);
    const messy = code.toLowerCase().replace(/-/g, " ");
    expect(recoveryCodeToSecret(messy)).toBe(SECRET);
  });

  it("rejects garbage", () => {
    expect(recoveryCodeToSecret("")).toBeNull();
    expect(recoveryCodeToSecret("zzzz")).toBeNull();
  });
});
