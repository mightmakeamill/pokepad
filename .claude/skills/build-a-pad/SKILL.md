---
name: build-a-pad
description: Build a new themed pump.fun launchpad on the PokéPad launch engine with a brand-new UI. Use when the user says "BUILD A PAD" (any casing), asks for a new launchpad, or wants to reskin PokéPad. Also covers leverage / perps trading pads (paper vs real on-chain, never fake deposits). Asks for the pad details, then reuses the proven launch engine unchanged and designs a new layout, never PokéPad's reskinned.
---

# BUILD A PAD

PokéPad (this repo) is the reference implementation. Every new pad reuses its **launch engine**
unchanged and gets a **brand-new UI**. Never rebuild the engine from scratch: each piece
below exists because the simpler version broke on Vercel, pump.fun or Phantom.

**The UI is never PokéPad's layout with new colors.** PokéPad's two-halves handheld (viewer +
d-pad on the left, tab keys + LCD panel on the right, a modal battle box) belongs to PokéPad
only. Each pad gets its own page structure, navigation, launch moment and screens, designed
from its world. Only the launch tech stays the same.

## Step 1: Ask for the pad details, nothing else

When the user says "build a pad" (any casing) with no details, reply with one short line asking
for the pad details, e.g. "What's the pad? Give me the theme and what users will launch." No form,
no checklist, no questions about infra.

The user then describes it freely, like the original PokéPad brief:

> Build a launchpad in the theme of pokemon, the goal is for the users to deploy all the first
> generation pokemon, use your skill designs to do something unique, use pokemons real items like
> the pokedex, be creative.

From that brief, decide everything yourself and don't ask follow-ups: the name, the fixed numbered
set of tokens, tickers, the main object the UI is shaped like, the launch action, dev-buy tiers,
unlock rules from the theme's lore, achievements, extra screens, the page layout, design and art. Use the theme's real
items and lore the way PokéPad used the Pokédex, Poké Balls, gym badges, Bill's PC and the Town Map.
If the brief already includes details, use them.

The one thing you need from the user is where to push: once the build works, ask for an empty private
GitHub repo (added to the Claude GitHub App) to push to.

After pushing, give the user their own setup steps (Claude can't log in to these): Vercel import,
Upstash Redis (Free, US East, no read regions), the `SOLANA_RPC` Helius key, `SITE_URL` and a custom
domain (Phantom flags *.vercel.app), an email to review@phantom.com, and the launch checks
(`/api/registry` returns `{"caught":{},"pending":{}}`, a test launch with the smallest tier, LIVE
mode on the hosted site).

## Step 2: Copy the engine verbatim

Clone `mightmakeamill/pokepad` into a new folder for the new repo, then keep these files as they are
(rename only identifiers and copy text):

| File | Why it must stay this way |
|---|---|
| `vercel.json` | `framework: null`, static `public/`, `/api/*` rewritten to one function, `maxDuration: 60`. Express auto-detection crashed with FUNCTION_INVOCATION_FAILED. |
| `api/index.js` | Wraps the app and returns startup errors as JSON so they are visible in the browser. |
| `lib/solana.js` | Base58, tx parsing and JSON-RPC by hand. **Never `require('@solana/web3.js')` on the server**: its `rpc-websockets` dep throws ERR_REQUIRE_ESM on Vercel. web3.js is browser-only (`public/vendor/index.iife.min.js`). |
| `lib/store.js` | Upstash Redis on Vercel (HSETNX for catches, SET NX PX for the 2-minute hold). File store only for local runs. Vercel's disk is read-only. |
| `lib/app.js` routes | `/api/config`, `/api/registry`, `/api/catch/prepare`, `/api/catch/confirm`, `/api/catch/submit`, `/api/catch/cancel`, `/api/meta/:id`. |
| Metadata | Try `pump.fun/api/ipfs` first; on failure fall back to self-hosted `/api/meta/:id` (it 500s from Vercel). |
| Wallet flow (`public/app.js` `catchLive`) | Mint keypair signs first, then `provider.signAndSendTransaction`, then `/api/catch/confirm` verifies signers + pump program on-chain. Fall back to signTransaction + `/submit` only for wallets without it. |
| Demo mode | Only in the single-file build (`window.SPRITES` present). The hosted site never falls back to demo; it shows "can't reach the server". |
| `scripts/prepare-public.js`, `scripts/build-demo.js` | Copy shared rules + web3 into `public/`; build the single-file demo. |
| `package.json` | `engines.node: 24.x`, build + postinstall run prepare-public. |

## Step 3: Design a new UI on top of the engine

| PokéPad file | Becomes |
|---|---|
| `lib/kanto.js` | `lib/<world>.js`: the numbered set (`id, name, ...`), `ticker()`, `BALLS` (dev-buy tiers), `SPECIAL` locks, `lockReason()`, achievements. Keep the same exported function names so `lib/app.js` works untouched. |
| `public/index.html` + `styles.css` | Written from scratch. New layout and information architecture, not the two-halves device: e.g. a full-width scene with the launch playing inline, the set grouped the way the world groups it (streets, houses, teams, decks), a different navigation object (remote, map, binder tabs). Load the artifact-design skill first. |
| `public/app.js` | Write new render, navigation and launch-animation code for that layout. Copy only the plumbing verbatim: `connect`, `loadWeb3`, `api`, `catchLive`, `catchDemo`, `refresh`, the demo seed and the `boot` live/demo split. |
| Copy | Intro character, battle/encounter text, success and failure lines. |
| `ARTWORK()` in `lib/app.js` + `public/sprites/` | The new art source. Download images into `public/sprites/` so the page doesn't hotlink. |
| Metadata `describe()` | New description template. |

Before shipping, compare a screenshot with PokéPad's. If the two pages share their layout, redo the UI.

### Front-end patterns worth reaching for

Ideas, not a layout to copy. Pick the ones that fit the world and write them fresh each time.

| Pattern | How |
|---|---|
| Seeded canvas hero | A plain 2D `<canvas>` with a slow field of shapes from the theme. Seed the RNG (e.g. Park–Miller `seed = seed * 16807 % 2147483647`) so every visit draws the same scene; keep shapes out of the band where the headline and CTA sit; scale by `min(2, devicePixelRatio)`, refit with a `ResizeObserver`, pause off-screen with an `IntersectionObserver`, and draw a still frame under `prefers-reduced-motion`. |
| Live prices in the browser | Fetch `https://api.dexscreener.com/tokens/v1/solana/<mint,mint,...>` from the page (no server route, no key). Show price + 24h change on cards; format `$1,234` above 1000, two decimals above 1, `toPrecision(4)` below. Leave the field blank on failure instead of showing `$0`. |
| Contract-address pill | One constant for the pad's own token CA (empty = no pill). Mono font, middle-truncate on phones, click copies to the clipboard and flips the pill to the accent color for ~1.5s. Same pattern for the X link: one constant, empty = hidden. |
| Two-role type | A sans for words, a mono for every number, ticker, address and label. Self-host the `.woff2` files and `preload` them. |
| Spec ticker | The pad's real numbers (tiers, fees, set size, unlock rules) as short "value / label" cells, looped in a marquee strip. Duplicate the row once for a seamless loop and stop it under reduced motion. |
| Tight palette | One background, one ink, one accent, one soft tint of the accent, one line color, all as `:root` tokens. |
| Polite scroll behavior | Anything that scrolls itself into view (accordions, step lists) does so only right after a click or key press, never during the user's own scrolling. |

## Step 4: Verify, ship, hand off

1. Run it locally: `npm start`, then load the page and `/api/config`, `/api/registry` and `/api/meta/1`.
2. Load the API with web3.js blocked (the Module._resolveFilename trick) to prove the function loads on Vercel.
3. Build `pokepad.html`-style single-file demo and publish it as an Artifact so the user can see it.
4. Commit and push to the user's new repo.
5. Give the user the infra checklist items they still own, with exact Vercel clicks.

## Leverage / perps pads

The launch engine above launches tokens; it does not trade them. A pad that offers longs, shorts or
leverage is a different product, and the first decision is which kind it is. Ask the user only this.

**Lesson from a live perps site (2026-10):** it showed a full 25x trading desk and a "vault" you
"deposit" SOL into, but every deposit, withdrawal, order and close was Phantom `signMessage` on plain
text. No SOL moved and nothing touched the chain. Positions, PnL and liquidations were rows in the
site's own database, priced from DexScreener in the browser. The only real money path was buying the
site's pump.fun token. Users read it as real leverage trading. Never build that.

Pick one and label it everywhere (page, buttons, Phantom message text, FAQ):

| Kind | What it is | Rules |
|---|---|---|
| **Paper trading** | Simulated positions with play balance | Say "paper" / "simulated" on the desk, the balance and every signed message. Never use the words deposit, withdraw, vault yield or payout for play money. Never sell the pad's token as earning from it. Wallet connect is optional (identity only, via `signMessage`). |
| **Real on-chain perps** | Collateral held by an on-chain program | Integrate an established audited perps protocol's SDK (Drift, Jupiter Perps, etc.) through `signAndSendTransaction`. Never write a custom vault or margin program, never custody user SOL in a server wallet, never settle PnL on our server. Prices from an oracle, not DexScreener. Tell the user about legal/licensing exposure for derivatives in their jurisdiction. |

Reusable from that site's design either way: browser-side market lists (DexScreener for
trending/new/majors, GeckoTerminal OHLCV for candles by pool address), paste-a-CA to add a market,
a liquidation-price readout on the ticket (`entry * (1 ∓ 1/leverage ± maintenance)`), and showing the
exact text Phantom will sign before the user clicks.

When reviewing someone else's perps site for the user: read its page JS for `signMessage` vs
`signAndSendTransaction`/`SystemProgram.transfer`, and for where positions live (`/api/...` = their
server). Tell the user plainly whether money actually moves, and to reject any unexpected transaction.

## Honest limits to tell the user every time

- Claude can't log into Vercel, Upstash, Helius or Phantom. Those steps are the user's.
- The real launch path can only be tested on the user's deployed site with a small buy.
- Uploads to pump.fun IPFS and PumpPortal may change. If a launch fails, read the battle-box message.
- Trademarked narratives (Pokémon, Disney, sports leagues...) carry takedown risk.
