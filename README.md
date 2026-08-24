# Lantern

> Everyone sees the goal. No one sees the givers.

Private crowdfunding on Starknet. Public goals, public progress, cryptographically private donors.

**[Live on mainnet →](https://app-wine-seven-35.vercel.app)** · **[3-minute demo →](https://youtu.be/RE3QUI-8XWY)** · Contract [`0x06fed63d…d93022c`](https://voyager.online/contract/0x06fed63d5a8a4af0d3edf59c01776883e29ee6730158a645a2c7204a0d93022c)

## What it does

Lantern is a sealed fundraiser protocol built on [STRK20](https://strk20.starknet.io). A campaign shows:

- ✅ The funding goal
- ✅ Total raised (verified on-chain)
- ✅ Number of backers
- ✅ Time remaining

It never reveals:

- 🔒 Who gave
- 🔒 How much each person gave
- 🔒 Any link between a donor's wallet and the campaign

If the goal is met, the organizer privately claims the funds. If not, each donor privately claims a refund — no doxxing either way.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│  Next.js    │────▶│  Ready       │────▶│  STRK20 Pool       │
│  Frontend   │     │  Wallet      │     │  (mainnet)         │
└─────────────┘     └──────────────┘     └─────────┬──────────┘
                                                    │
                                          privacy_invoke
                                                    │
                                         ┌──────────▼──────────┐
                                         │  Lantern Contract    │
                                         │  (anonymizer)        │
                                         └─────────────────────┘
```

- **Lantern contract** — a stateful `privacy_invoke` anonymizer that holds campaign state, tallies, and refund commitments.
- **Frontend** — public campaign pages (no wallet needed to view), plus create / give / claim flows via the Starknet Wallet API.
- **No backend** — every number on screen comes from an on-chain view call. No database, no server state, no trust assumption beyond the contract itself.

## Stack

- **Contract:** Cairo 2.13 · Scarb 2.13.1 · Starknet Foundry 0.63
- **Frontend:** TypeScript · Next.js 15 · Tailwind CSS · starknet.js 10.4.0 · get-starknet 6.0.2
- **Deploy:** Vercel (frontend) · Starknet mainnet (contract)

## Development

```bash
# Install dependencies
pnpm install

# Run contract tests
pnpm test:contracts

# Run frontend
pnpm dev
```

## How it works

### Donate (private)

The pool withdraws tokens to the Lantern contract. The contract measures the actual balance delta (not a caller-supplied amount), increments the public tally, and stores a Poseidon commitment for later refund. Funds park in the contract. The pool receives an empty `Span<OpenNoteDeposit>` — nothing is credited back yet.

### Claim Refund (private)

After the deadline, if the goal was not met, a donor proves knowledge of their secret (the commitment preimage). The contract marks the commitment claimed, approves the pool to pull the tokens, and returns an `OpenNoteDeposit` crediting the donor's open note.

### Claim Payout (private)

After the deadline, if the goal was met, the organizer proves knowledge of their payout secret. The contract sends all raised funds back to the pool as a single `OpenNoteDeposit` for the organizer.

## What's built

| Flow | Route | Status |
|---|---|---|
| Browse campaigns | `/` | live |
| Public campaign page | `/c/[id]` | live |
| Create a campaign | `/new` | live |
| Give privately | `/c/[id]` (active) | live, verified on mainnet |
| Claim refund | `/c/[id]` (goal missed) | live |
| Claim payout | `/c/[id]` (goal met) | live |

Nothing is behind a login and nothing needs a wallet until you act.

## Verified on mainnet

The complete lifecycle has run on Starknet mainnet — create, donate, reach the
goal, collect. Not a testnet demo.

| Step | Transaction |
|---|---|
| Shield into the pool | [`0x06a7a343…625b9`](https://voyager.online/tx/0x06a7a343054626a37f9eb81d5f71516cfe807a37c8a83724070555b2037625b9) |
| Private donation | [`0x0449e60d…620689`](https://voyager.online/tx/0x0449e60d08650a7bd6a187aacf74112a3c53020017851cd3c0a1d31745620689) |
| Private donation | [`0x038d24f9…f7af3`](https://voyager.online/tx/0x038d24f980d612b54629e6fb29f5fcde879914869dd8c345c4d75b089bcf7af3) |
| Private donation | [`0x05692306…c22c7`](https://voyager.online/tx/0x056923063c7b8d9cc26cdc716dd7e8ff9adf797e098b46d3554c1a28631c22c7) |
| Private payout claim | [`0x01afe646…2cf2`](https://voyager.online/tx/0x01afe646e2cfed5c77249bd0ccd34424171d1ff65cee20bb9f020825fbef2cf2) |
| Private payout claim | [`0x05f86d9c…c059`](https://voyager.online/tx/0x05f86d9c66573264a80b2373ef905aaab2ba8a0029ea7b44eb2e40f665eec059) |

The first donation moved campaign #2 from `0` to `0.300000` with
`backer_count: 1`, and left the contract holding exactly `0.3 USDC` — the
measured delta, not a number the caller supplied. Campaign #7 later reported
`payout_claimed: true`, closing the loop.

## Three things worth stealing

Findings from building this that apply to any STRK20 integration.

**1. Don't trust the caller's amount.** The reference escrow helper stores the
`amount` passed in calldata. For anything whose public total *is* the product,
that is fatal — an inflatable tally destroys the only reason to trust the
number. Lantern derives every donation from its own measured balance delta, so
the tally cannot be inflated by a caller.

**2. Cross-language Poseidon parity fails silently.** The commitment hash is
computed in Cairo *and* in TypeScript. If those disagree, nothing errors —
refunds simply become permanently unclaimable. The same reference vectors are
asserted on both sides ([Cairo](contracts/tests/test_commitments.cairo),
[TypeScript](app/src/lib/commitments.test.ts)) so a mismatch cannot ship. This
is also how we found that secrets must stay under 2^251 to fit `felt252` — 256-bit
secrets would intermittently produce unclaimable refunds.

**3. Two wallet approvals per private action is unavoidable.** `invoke`-only is
rejected by the Wallet API with `INVALID_REQUEST_PAYLOAD`, so a private action
needs at least two STRK20 actions and the wallet raises an approval for each —
both at once, looking near-identical. `strk20InvokeTransaction` is a single
JSON-RPC call, so this is wallet-side, not something a dapp can collapse. Full
write-up in [docs/ACTION-SHAPES.md](docs/ACTION-SHAPES.md).

## Security

See [SECURITY.md](./SECURITY.md) for privacy limits, known risks, and the threat model.

## License

MIT
