# PokéPad: a Kanto launchpad on pump.fun

A Solana launchpad shaped like a Gen I Pokédex. The goal is to get all 151 original Pokémon on-chain. Each one can be launched on pump.fun **once**, by the first trainer to catch it.

## How it plays

| Pokémon item | What it does on the launchpad |
|---|---|
| **Pokédex** | The 151-slot registry. Uncaught Pokémon show as silhouettes. Caught ones show in color with their trainer and mint. |
| **Poké Balls** (Bag) | Your dev first buy on the bonding curve: Poké 0.1 · Great 0.5 · Ultra 1.5 · Master 5 SOL. You get one Master Ball per wallet. |
| **Battle screen** | "Wild PIKACHU appeared!" You pick a ball and throw it. The ball wobbles while the tx confirms, then you see "Gotcha!" or "broke free". |
| **Evolution locks** | Ivysaur can't launch until Bulbasaur is on-chain. Each catch releases the next form. |
| **Key items + Town Map** | Story locks from Red & Blue. Snorlax needs the Poké Flute (Gengar caught). The fossils unlock at Cinnabar Lab (30 caught). The birds need 50. Mewtwo needs 100 plus all three birds. Mew comes last, at 150. |
| **Trainer Card** | Wallet, ID No., SOL spent, and 8 gym badges earned by type (for example, Misty's Cascade Badge takes 5 Water types). |
| **Bill's PC** | Your caught tokens with pump.fun links. |
| **Hall of Fame** | Trainer leaderboard and recent catches. |
| **Tall grass / D-pad / A** | Random wild encounter, keyboard/d-pad navigation, and A to throw. |

## How a catch works

1. The browser generates a fresh mint keypair.
2. `POST /api/catch/prepare` checks the locks and holds that Pokémon for 2 minutes. It then uploads the artwork and metadata (name, `$TICKER`, Pokédex description) to pump.fun IPFS and gets a `create` transaction from PumpPortal's [local transaction API](https://pumpportal.fun/creation).
3. The wallet signs, then the mint keypair co-signs.
4. `POST /api/catch/submit` checks the signers and the pump.fun program, relays the tx, waits for confirmation, checks that the mint exists, and records the catch.

The server never holds a private key.

## Run it

```bash
npm install
cp .env.example .env   # put your Helius key in SOLANA_RPC
npm start              # http://localhost:3000
```

Optional env: `PORT`, `TWITTER_URL`, `TELEGRAM_URL`, `PRIORITY_FEE` (default 0.002), `SLIPPAGE` (default 10), `DATA_DIR`.

`npm run build:demo` writes `dist/pokepad-demo.html`, a self-contained page that runs in simulated demo mode.

## Deploy to Vercel

1. Push this folder to a GitHub repo and import it in Vercel (no build settings needed).
2. In the project, open **Storage → Marketplace → Upstash Redis** and connect a free database. This sets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. In **Settings → Environment Variables**, add `SOLANA_RPC` (your Helius URL with key), plus optional `PRIORITY_FEE`, `SITE_URL`, `TWITTER_URL`, `TELEGRAM_URL`.
4. Redeploy.

Without Redis env vars the server uses `data/registry.json`, which only works on a normal long-running host.

## Before going public

- **RPC.** Use a free Helius key at low volume (raise `PRIORITY_FEE` if launches fail to land). Move to the Developer plan if launches start failing to confirm.
- **Watch for outside launches.** Someone can still launch a "Pikachu" directly on pump.fun. Only catches made through PokéPad count in the Pokédex.
- **IP risk.** Pokémon names and artwork belong to Nintendo / Game Freak / The Pokémon Company. Expect takedown risk, and consider original art before launching publicly.
