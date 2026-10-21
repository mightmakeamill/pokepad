---
name: build-a-pad
description: Build a new themed pump.fun launchpad by reskinning the PokéPad engine onto a new narrative. Use when the user says "BUILD A PAD" (any casing), asks for a new launchpad, or wants to reskin PokéPad. Starts with the checklist, then reuses the proven engine and swaps only the theme.
---

# BUILD A PAD

PokéPad (this repo) is the reference implementation. Every new pad reuses its **engine**
unchanged and replaces only its **theme**. Never rebuild the engine from scratch: each piece
below exists because the simpler version broke on Vercel, pump.fun or Phantom.

## Step 1: Send the intake form first

When the user says "BUILD A PAD", reply with this form before writing any code: it is what you
need to know to build the pad. The user fills it in. If they leave something blank, use the
default shown and say which defaults you used. Only items marked * must be answered.

```
BUILD A PAD: fill in what you can, blanks get the default

THE PROJECT
1.* Pad name:                     (e.g. PokéPad)
2.* Theme / narrative:            (e.g. Gen 1 Pokémon)
3.* What gets launched:           the full list of tokens, or where it comes from
                                  (e.g. "all 151 Gen 1 Pokémon"). Must be a fixed, numbered set.
4.  One-line pitch:               shown on the site and in every token description
5.  Ticker style:                 default: the item's name in caps, max 10 letters ($PIKACHU)

THE GAME
6.  Main object the site looks like:  default: I pick one from the theme (Pokédex, grimoire, arcade cabinet...)
7.  Launch action:                 default: I pick one (throw a ball, cast a spell, pull a card...)
8.  Dev-buy tiers + names:         default: 4 tiers at 0.1 / 0.5 / 1.5 / 5 SOL, top tier once per wallet
9.  Unlock rules:                  default: I write rules from the theme's lore (evolutions, rare ones unlock later, the last one at 100%)
10. Badges / achievements:         default: 8, earned by launching enough of one category
11. Extra screens:                 default: collection box, leaderboard, map/progress, intro character

THE LOOK
12. Colors / vibe:                 default: I design it from the theme
13. Art source:                    link to images, or "find them". Note any IP/trademark risk.

THE LINKS
14. X (Twitter) link:              optional, added to every token
15. Telegram link:                 optional, added to every token
16. Domain (if you have one):      default: none yet (Phantom flags *.vercel.app; get one before going public)

SETUP
17.* New GitHub repo name:          create it empty + private and add it to the Claude GitHub App
```

After the build, give the user their own setup steps (Claude can't log in to these):
Vercel import, Upstash Redis (Free, US East, no read regions), the `SOLANA_RPC` Helius key,
`SITE_URL` and the custom domain, an email to review@phantom.com, and the launch checks
(`/api/registry` returns `{"caught":{},"pending":{}}`, a test launch with the smallest tier,
LIVE mode on the hosted site).

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
