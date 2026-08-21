# Mainnet Deployment

## Contracts

| Name | Address | Class Hash |
|---|---|---|
| Lantern | [`0x06fed63d5a8a4af0d3edf59c01776883e29ee6730158a645a2c7204a0d93022c`](https://voyager.online/contract/0x06fed63d5a8a4af0d3edf59c01776883e29ee6730158a645a2c7204a0d93022c) | `0x3d94572c398084161b6e34793b3c8d5bc8ffa49a423079f942554c7fa50caef` |

Constructor arg: STRK20 pool = `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`

## External addresses (Starknet mainnet)

| Name | Address |
|---|---|
| STRK20 Privacy Pool | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` |
| USDC | `0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8` |
| STRK | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |

## Transaction log

| Purpose | Hash | Touches pool |
|---|---|---|
| Declare Lantern | [`0x07b3a27f0c1faee93f8696c13c406853e216330ff57c490d898da3449bd5856e`](https://voyager.online/tx/0x07b3a27f0c1faee93f8696c13c406853e216330ff57c490d898da3449bd5856e) | no |
| Deploy Lantern | [`0x06fbe8637e64e1ffd59087ade35a01b74a1df3f4c85e58985cc6f28f7ff93354`](https://voyager.online/tx/0x06fbe8637e64e1ffd59087ade35a01b74a1df3f4c85e58985cc6f28f7ff93354) | no |
| Create campaign #1 | [`0x074ca584c991c7255941bd5228a27c8554729ab0eee034cf397134c111368381`](https://voyager.online/tx/0x074ca584c991c7255941bd5228a27c8554729ab0eee034cf397134c111368381) | no |

> **Note:** The three hashes required by `strk20.json` must each *touch the STRK20 pool*.
> The transactions above exercise the Lantern contract but do not route through the pool.
> Pool-touching transactions (shield, donate via `privacy_invoke`, claim) come from the
> give/claim flows once the frontend is wired and USDC is available.

## Campaign #1 (live)

```
organizer:      0x7f39a0e50dd2f38aa755e5aa38ff56ba5e37c1eca3bb19ec04550be1314487b
token:          USDC
goal:           5000000 (5 USDC)
raised:         0
backer_count:   0
deadline:       1789945957
payout_claimed: false
```

Payout secret (dev only — **not** for production use):
```
secret:     0x1a2b3c4d5e6f7788990011223344556677889900aabbccddeeff0011223344
commitment: 0x31a85510f4f85ab2ff017d6aca3947ab38498decae952444b3fb804363a320a
```

## Reproducing

```bash
cd contracts
scarb build
sncast --profile mainnet declare --contract-name Lantern
sncast --profile mainnet deploy \
  --class-hash <CLASS_HASH> \
  --arguments '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a'
```
