import { describe, expect, it } from "vitest";
import { buildClaimActions, buildDonateActions, OP } from "./actions";
import { computeDonationCommitment } from "./commitments";
import { LANTERN_ADDRESS, TOKENS } from "./config";

const TOKEN = TOKENS.USDC.address;
const SECRET = "0x1a2b3c4d5e6f7788990011223344556677889900aabbccddeeff0011223344";
const USER = "0x07f39a0e50dd2f38aa755e5aa38ff56ba5e37c1eca3bb19ec04550be1314487b";

describe("buildDonateActions", () => {
  const base = { token: TOKEN, amount: 1_000_000n, campaignId: 2, secret: SECRET };

  it("emits withdraw then invoke by default", () => {
    const a = buildDonateActions(base);
    expect(a).toHaveLength(2);
    expect(a[0].type).toBe("withdraw");
    expect(a[1].type).toBe("invoke");
  });

  it("routes the withdrawal to the Lantern contract, not the user", () => {
    const [w] = buildDonateActions(base);
    if (w.type !== "withdraw") throw new Error("expected withdraw");
    expect(w.recipient).toBe(LANTERN_ADDRESS);
    expect(w.token).toBe(TOKEN);
    expect(w.amount).toBe("0xf4240"); // 1_000_000
  });

  it("supports the invoke-only fallback shape", () => {
    const a = buildDonateActions({ ...base, shape: "invoke-only" });
    expect(a).toHaveLength(1);
    expect(a[0].type).toBe("invoke");
  });

  it("puts the commitment in calldata and never the secret", () => {
    const a = buildDonateActions(base);
    const invoke = a.find((x) => x.type === "invoke");
    if (!invoke || invoke.type !== "invoke") throw new Error("no invoke");

    const expected = computeDonationCommitment(2, SECRET);
    expect(invoke.calldata[4]).toBe(expected);

    // The secret must never appear in a donate transaction — only its hash.
    expect(invoke.calldata).not.toContain(SECRET);
  });

  it("uses the Donate opcode and correct calldata arity", () => {
    const a = buildDonateActions(base);
    const invoke = a.find((x) => x.type === "invoke");
    if (!invoke || invoke.type !== "invoke") throw new Error("no invoke");
    expect(invoke.calldata[2]).toBe(OP.Donate);
    expect(invoke.calldata).toHaveLength(7);
  });

  it("scopes the commitment to the campaign", () => {
    const c2 = buildDonateActions({ ...base, campaignId: 2 });
    const c3 = buildDonateActions({ ...base, campaignId: 3 });
    const get = (x: typeof c2) => {
      const i = x.find((y) => y.type === "invoke");
      if (!i || i.type !== "invoke") throw new Error("no invoke");
      return i.calldata[4];
    };
    expect(get(c2)).not.toBe(get(c3));
  });
});

describe("buildClaimActions", () => {
  const base = {
    token: TOKEN,
    campaignId: 2,
    secret: SECRET,
    recipient: USER,
    kind: "refund" as const,
  };

  it("opens a note before invoking", () => {
    const a = buildClaimActions(base);
    expect(a).toHaveLength(2);
    expect(a[0].type).toBe("transfer");
    if (a[0].type !== "transfer") throw new Error("x");
    expect(a[0].amount).toBe("OPEN");
    expect(a[0].recipient).toBe(USER);
  });

  it("references the open note by placeholder", () => {
    const a = buildClaimActions(base);
    const i = a.find((x) => x.type === "invoke");
    if (!i || i.type !== "invoke") throw new Error("no invoke");
    expect(i.calldata[5]).toBe("${openNoteIds[0]}");
  });

  it("passes amount 0 so nothing is withdrawn from the pool", () => {
    const a = buildClaimActions(base);
    const i = a.find((x) => x.type === "invoke");
    if (!i || i.type !== "invoke") throw new Error("no invoke");
    expect(i.calldata[1]).toBe("0x0");
  });

  it("selects the right opcode per claim kind", () => {
    const refund = buildClaimActions(base);
    const payout = buildClaimActions({ ...base, kind: "payout" });
    const op = (x: typeof refund) => {
      const i = x.find((y) => y.type === "invoke");
      if (!i || i.type !== "invoke") throw new Error("x");
      return i.calldata[2];
    };
    expect(op(refund)).toBe(OP.ClaimRefund);
    expect(op(payout)).toBe(OP.ClaimPayout);
  });

  it("does include the secret — claims require the preimage", () => {
    const a = buildClaimActions(base);
    const i = a.find((x) => x.type === "invoke");
    if (!i || i.type !== "invoke") throw new Error("x");
    expect(i.calldata[6]).toBe(SECRET);
  });
});
