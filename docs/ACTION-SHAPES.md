# ACTION-SHAPES.md

## STRK20 Wallet API Action Shapes for Lantern

Based on the Privacy Wallet API spec v0.10.3, starknet.js 10.4.0, and the
`privacy_invoke` pattern from `strk20-by-example.org`.

### Pool address (mainnet)

```
0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
```

### Lantern `privacy_invoke` calldata layout

```
[token, amount, operation, campaign_id, commitment_hash, note_id, secret]
```

Where:
- `token`: ERC-20 contract address (e.g. USDC)
- `amount`: token amount in smallest unit (u128) — for donate; 0 for claims
- `operation`: 0 = Donate, 1 = ClaimRefund, 2 = ClaimPayout
- `campaign_id`: u32 campaign identifier
- `commitment_hash`: poseidon(TAG, campaign_id, secret) — for donate; 0 for claims
- `note_id`: open note id placeholder — for claims; 0 for donate
- `secret`: commitment preimage — for claims; 0 for donate

---

## Donate (park funds, no note credited back)

The pool must first **withdraw** the donation to the Lantern contract, then
`invoke` it. The escrow reference confirms this ordering: *"Tokens already
transferred by the pool via Withdraw. Return empty span."*

```typescript
import type { STRK20_ACTION } from "@starknet-io/types-js"

const donateActions: STRK20_ACTION[] = [
  // 1. Pool withdraws the donation from the user's shielded balance
  //    to the Lantern contract.
  {
    type: "withdraw",
    token: tokenAddress,
    amount: donationAmount,
    recipient: LANTERN_ADDRESS,
  },
  // 2. Pool calls privacy_invoke. Contract measures the delta, bumps the
  //    tally, stores the commitment, returns an EMPTY span (funds park).
  {
    type: "invoke",
    contract: LANTERN_ADDRESS,
    calldata: [
      tokenAddress,       // token
      donationAmount,     // amount (contract still measures independently)
      "0x0",              // operation = Donate
      campaignIdHex,      // campaign_id
      commitmentHash,     // poseidon(LANTERN_DONATE:V1, campaign_id, secret)
      "0x0",              // note_id (unused)
      "0x0",              // secret (unused)
    ],
  },
]

const { transaction_hash } = await account.strk20InvokeTransaction(donateActions)
```

> **OPEN QUESTION — verify by dry-run before relying on it.**
> The swap example in the docs shows only `transfer(OPEN)` + `invoke` with no
> explicit `withdraw`, yet states "the pool withdraws `amountIn` to your helper".
> That implies the pool may infer the input leg from calldata position instead.
> The two candidate shapes are:
>
> - **A (used above):** explicit `withdraw` → `invoke`
> - **B:** `invoke` only, pool infers token+amount from leading calldata
>
> `buildDonateActions()` in `app/src/lib/actions.ts` is the single place this is
> decided, so flipping it is a one-line change. Resolve with
> `strk20PrepareInvoke(actions, true)` as soon as a shielded USDC balance exists.


---

## Claim Refund (goal not met, past deadline)

```typescript
const claimRefundActions: STRK20_ACTION[] = [
  // 1. Open a note to receive the refunded tokens
  {
    type: "transfer",
    token: tokenAddress,
    amount: "OPEN",
    recipient: userAddress,
  },
  // 2. Invoke the claim — contract approves pool, returns OpenNoteDeposit
  {
    type: "invoke",
    contract: LANTERN_ADDRESS,
    calldata: [
      tokenAddress,          // token (for pool routing)
      "0x0",                 // amount = 0 (no withdrawal needed; contract holds funds)
      "0x1",                 // operation = ClaimRefund (enum index 1)
      campaignIdHex,         // campaign_id
      "0x0",                 // commitment_hash (unused — recomputed from secret)
      "${openNoteIds[0]}",   // note_id placeholder (wallet resolves)
      secret,                // the preimage of the donation commitment
    ],
  },
]

const { transaction_hash } = await account.strk20InvokeTransaction(claimRefundActions)
```

---

## Claim Payout (goal met, past deadline, organizer only)

```typescript
const claimPayoutActions: STRK20_ACTION[] = [
  // 1. Open a note to receive the raised funds
  {
    type: "transfer",
    token: tokenAddress,
    amount: "OPEN",
    recipient: organizerAddress,
  },
  // 2. Invoke the claim
  {
    type: "invoke",
    contract: LANTERN_ADDRESS,
    calldata: [
      tokenAddress,          // token
      "0x0",                 // amount = 0 (no withdrawal; contract approves pool)
      "0x2",                 // operation = ClaimPayout (enum index 2)
      campaignIdHex,         // campaign_id
      "0x0",                 // commitment_hash (unused)
      "${openNoteIds[0]}",   // note_id placeholder
      payoutSecret,          // organizer's payout secret preimage
    ],
  },
]

const { transaction_hash } = await account.strk20InvokeTransaction(claimPayoutActions)
```

---

## Pre-flight (dry run)

Use `wallet_strk20PrepareInvoke` with `simulate: true` to validate the action
shape without generating a proof:

```typescript
const prepared = await account.strk20PrepareInvoke(donateActions, true)
// If this doesn't throw, the shape is valid.
// prepared.call contains the assembled call; prepared.proof is empty.
```

---

## Commitment derivation (TypeScript)

```typescript
import { hash } from "starknet"

const LANTERN_DONATE_TAG = "0x" + Buffer.from("LANTERN_DONATE:V1").toString("hex")
const LANTERN_PAYOUT_TAG = "0x" + Buffer.from("LANTERN_PAYOUT:V1").toString("hex")

function computeDonationCommitment(campaignId: number, secret: string): string {
  return hash.computePoseidonHashOnElements([
    LANTERN_DONATE_TAG,
    campaignId.toString(),
    secret,
  ])
}

function computePayoutCommitment(campaignId: number, secret: string): string {
  return hash.computePoseidonHashOnElements([
    LANTERN_PAYOUT_TAG,
    campaignId.toString(),
    secret,
  ])
}
```

---

## Notes

1. **Donate returns empty span.** No note is credited. Funds park in the contract.
   This means no `"OPEN"` transfer is needed for the donate action.

2. **Claims return one `OpenNoteDeposit`.** The preceding `"OPEN"` transfer creates
   the note slot that the returned deposit credits. The `${openNoteIds[0]}`
   placeholder resolves to this slot's ID.

3. **Token and amount as leading params** follow the pattern established by the
   official swap helper. The pool/wallet uses these to determine the withdrawal.
   For claims, `amount = 0` signals no withdrawal (the contract already holds funds
   and approves the pool to pull them).

4. **Measured-delta accounting** in the contract independently verifies what arrived,
   ignoring the caller-supplied `amount`. This prevents tally inflation if the pool
   somehow delivered a different amount than declared.
