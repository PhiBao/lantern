# Lantern

> Everyone sees the goal. No one sees the givers.

Private crowdfunding on Starknet. Public goals, public progress, cryptographically private donors.

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

| What | Transaction |
|---|---|
| Shield into the pool | [`0x06a7a343…625b9`](https://voyager.online/tx/0x06a7a343054626a37f9eb81d5f71516cfe807a37c8a83724070555b2037625b9) |
| Private donation | [`0x0449e60d…620689`](https://voyager.online/tx/0x0449e60d08650a7bd6a187aacf74112a3c53020017851cd3c0a1d31745620689) |

The donation moved campaign #2 from `0` to `0.300000` with `backer_count: 1`,
and left the Lantern contract holding exactly `0.3 USDC` — the measured delta,
not a number the caller supplied.

## Security

See [SECURITY.md](./SECURITY.md) for privacy limits, known risks, and the threat model.

## License

MIT
