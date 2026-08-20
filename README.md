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
- **Frontend** — a public campaign page (no wallet needed to view) plus give/claim flows via the Starknet Wallet API.
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

## Security

See [SECURITY.md](./SECURITY.md) for privacy limits, known risks, and the threat model.

## License

MIT
