# PokéPad

Themed pump.fun launchpad (Gen 1 Pokémon) on Vercel. It is also the reference engine for every new pad.

When the user says **"BUILD A PAD"**, use the `build-a-pad` skill in `.claude/skills/build-a-pad/SKILL.md`:
ask for the pad details (nothing else), then build from the user's brief, reusing this repo's
engine and swapping only the theme.

Hard rules learned here:
- Never `require('@solana/web3.js')` on the server (ERR_REQUIRE_ESM on Vercel). Use `lib/solana.js`.
- Keep `vercel.json` (`framework: null`, static `public/`, `/api/*` -> `api/index.js`).
- Storage on Vercel is Upstash Redis; the disk is read-only.
- Launches go through Phantom's `signAndSendTransaction`, then `/api/catch/confirm`.
- The hosted site never falls back to demo mode.
