---
name: build-a-pad
description: Build a new themed pump.fun launchpad by reskinning the PokéPad engine onto a new narrative. Use when the user says "BUILD A PAD" (any casing), asks for a new launchpad, or wants to reskin PokéPad. Starts with the checklist, then reuses the proven engine and swaps only the theme.
---

# BUILD A PAD

PokéPad (this repo) is the reference implementation. Every new pad reuses its **engine**
unchanged and replaces only its **theme**. Never rebuild the engine from scratch: each piece
below exists because the simpler version broke on Vercel, pump.fun or Phantom.

## Step 1: Reply with the checklist first

When the user says "BUILD A PAD", reply with this checklist before writing any code. Fill in
what they already told you and ask only for the missing **required** items in one message.

```
PAD CHECKLIST
Narrative
[ ] Theme / world (required)          e.g. "Gen 1 Pokémon"
[ ] The set to launch (required)      e.g. 151 Pokémon; needs a finite, numbered list
[ ] Pad name + ticker style           e.g. PokéPad, $PIKACHU
[ ] Hero item (the "Pokédex")         the device/object the whole UI is shaped like
[ ] Item mapped to the dev buy        Poké Ball tiers -> 0.1 / 0.5 / 1.5 / 5 SOL
[ ] Unlock rules                      evolutions, story locks, last-one-standing (Mew)
[ ] Achievements                      gym badges by type
[ ] Extra screens                     PC box, Hall of Fame, Town Map, intro character
[ ] Artwork source + IP risk          where images come from; trademark exposure
Infra (the user does these, Claude can't)
[ ] New empty PRIVATE GitHub repo     tell Claude the name; it must be added to the Claude GitHub App
[ ] Vercel project imported from it   framework "Other"; vercel.json handles the rest
[ ] Upstash Redis connected           Storage -> Upstash -> Free -> primary US East, no read regions
[ ] SOLANA_RPC env var                Helius URL (free plan is fine for under ~10 launches)
[ ] Custom domain + SITE_URL          *.vercel.app gets flagged by Phantom
[ ] Email review@phantom.com          after the domain is live
Launch checks
[ ] /api/registry returns {"caught":{},"pending":{}}
[ ] Test launch with the smallest buy; token shows on pump.fun
[ ] Hosted site shows LIVE mode, never demo
```

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

## Step 3: Replace the theme

| PokéPad file | Becomes |
|---|---|
| `lib/kanto.js` | `lib/<world>.js`: the numbered set (`id, name, ...`), `ticker()`, `BALLS` (dev-buy tiers), `SPECIAL` locks, `lockReason()`, achievements. Keep the same exported function names so `lib/app.js` works untouched. |
| `public/index.html` + `styles.css` | A new hero object. Don't reuse the red Pokédex: pick the world's own device (grimoire, arcade cabinet, trading binder...). Load the artifact-design skill first. |
| `public/app.js` render functions | Rename screens to the world's vocabulary; keep the catch/confirm/demo plumbing. |
| Copy | Intro character, battle/encounter text, success and failure lines. |
| `ARTWORK()` in `lib/app.js` + `public/sprites/` | The new art source. Download images into `public/sprites/` so the page doesn't hotlink. |
| Metadata `describe()` | New description template. |

## Step 4: Verify, ship, hand off

1. Run it locally: `npm start`, then load the page and `/api/config`, `/api/registry` and `/api/meta/1`.
2. Load the API with web3.js blocked (the Module._resolveFilename trick) to prove the function loads on Vercel.
3. Build `pokepad.html`-style single-file demo and publish it as an Artifact so the user can see it.
4. Commit and push to the user's new repo.
5. Give the user the infra checklist items they still own, with exact Vercel clicks.

## Honest limits to tell the user every time

- Claude can't log into Vercel, Upstash, Helius or Phantom. Those steps are the user's.
- The real launch path can only be tested on the user's deployed site with a small buy.
- Uploads to pump.fun IPFS and PumpPortal may change. If a launch fails, read the battle-box message.
- Trademarked narratives (Pokémon, Disney, sports leagues...) carry takedown risk.
