# Security & Privacy

## What Lantern reveals

| On-chain artifact | Visible to everyone |
|---|---|
| Campaign creation | Organizer address, token, goal, deadline |
| Donation amount | **Yes** — the ERC-20 transfer from pool to contract is public |
| Donation identity | **No** — the pool initiates the transfer; the donor's address never appears |
| Total raised | Yes — contract view |
| Backer count | Yes — contract view |
| Individual commitment hash | Yes — stored on-chain, but unlinkable without the secret |
| Refund/payout claim | Amount visible (open note); claimer hidden |

## What stays private

- Which wallet donated to which campaign
- The link between a deposit into the pool and a specific donation
- Whether a specific person is a backer of a specific campaign

## Known privacy limitations

1. **Timing correlation.** If a user shields tokens and immediately donates, the timing between the public deposit and the pool→contract transfer may be correlated by an observer. **Mitigation:** the UI warns users with freshly shielded balances and recommends waiting.

2. **Amount fingerprinting.** Distinctive donation amounts (e.g., exactly $1,337.00) reduce the anonymity set. **Mitigation:** documented in the give flow; no technical fix beyond user awareness.

3. **Deposit/withdrawal legs are public.** FPI deposit screening applies. The act of shielding is visible; what happens inside the pool is not.

4. **Channel-open linkability.** Opening a channel to a new recipient in the same transaction as a deposit can link sender to recipient. Lantern does not require channel setup between donor and contract — the pool interacts with the contract directly.

## Contract security

- **Pool-only access:** `privacy_invoke` asserts `get_caller_address() == pool`. Nobody can drive the contract directly.
- **Measured-delta accounting:** The contract computes donation amounts as `balance_of(this) - accounted_balance`, preventing tally inflation attacks.
- **Single-use claims:** A `claimed` flag prevents double-claim of refunds.
- **Domain-separated commitments:** `poseidon(LANTERN_DONATE_TAG, campaign_id, secret)` — campaign-scoped, so commitments cannot be replayed across campaigns.
- **Mutually exclusive end states:** Refund requires `raised < goal`; payout requires `raised >= goal`. Both require `timestamp > deadline`.
- **Safe casts:** `u256 → u128` overflow is explicitly guarded.

## Known residual risks

1. **Claim front-running.** The secret preimage appears in calldata when claiming. Starknet does not expose a general public pending mempool, so exploitability is low — but non-zero. A future version should bind the claim to a specific caller or use a commit-reveal scheme.

2. **No campaign moderation.** MVP ships with no content moderation. FPI deposit screening covers the money's provenance but not campaign legitimacy. An off-chain flagging mechanism is planned.

3. **Single-token campaigns only.** Multi-token would complicate the measured-delta accounting and is excluded from MVP.

## Threat model

| Attacker | Goal | Mitigated by |
|---|---|---|
| Observer | Link a donor to a campaign | Pool anonymity set; no donor address on-chain |
| Malicious donor | Inflate the tally without sending tokens | Measured-delta accounting |
| Malicious organizer | Claim funds before deadline / when goal not met | Contract state machine |
| Griefing donor | Double-claim refund | `claimed` flag |
| Front-runner | Steal a claim by replaying the secret | Low mempool exposure (Starknet); future: caller-bound claims |

## Audit status

This contract is **unaudited**. It is a hackathon submission. Do not use it for significant funds without a professional security review.
