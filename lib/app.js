// PokéPad API + static server: serves the Pokédex, keeps the Kanto registry, and builds
// pump.fun create transactions through PumpPortal's local-transaction API.
// The server never holds keys: the browser signs with the trainer's wallet
// and a fresh mint keypair, then hands the signed tx back for relay.
const path = require('path');
const express = require('express');
const { isPublicKey, parseTransaction, rpcClient } = require('./solana');
const KANTO = require('./kanto.js');

const PORT = +process.env.PORT || 3000;
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const SITE_URL = process.env.SITE_URL || '';
const TWITTER = process.env.TWITTER_URL || '';
const TELEGRAM = process.env.TELEGRAM_URL || '';
const PRIORITY_FEE = +(process.env.PRIORITY_FEE || 0.002);
const SLIPPAGE = +(process.env.SLIPPAGE || 10);
const RESERVE_MS = 120_000;

const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_IPFS = 'https://pump.fun/api/ipfs';
const PUMPPORTAL = 'https://pumpportal.fun/api/trade-local';
const ARTWORK = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const rpc = rpcClient(RPC);
const store = require('./store');

const isKey = isPublicKey;

const fail = (res, code, message) => res.status(code).json({ error: message });

const app = express();
app.use(express.json({ limit: '256kb' }));
// Local runs serve the page too; on Vercel, public/ is served by its CDN.
app.get('/kanto.js', (req, res) => res.type('js').sendFile(path.join(__dirname, 'kanto.js')));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/config', (req, res) => {
  res.json({ mode: 'live', network: RPC.includes('devnet') ? 'devnet' : 'mainnet-beta', balls: KANTO.BALLS });
});

app.get('/api/registry', async (req, res) => {
  try {
    const [caught, pending] = await Promise.all([store.caughtAll(), store.pendingAll()]);
    res.set('Cache-Control', 'no-store').json({ caught, pending });
  } catch (e) {
    fail(res, 503, e.message);
  }
});

const describe = (p) =>
  `#${String(p.id).padStart(3, '0')} ${p.name}, the ${p.species} Pokémon. ` +
  `Type: ${p.types.join('/')}. Caught on PokéPad, the Kanto Pokédex launchpad: 151 Pokémon, one mint each.`;

// The site's own address, so self-hosted metadata links back here.
const siteUrl = (req) => SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;

// Token metadata in the format pump.fun reads. Served from /api/meta/:id when
// pump.fun's own IPFS upload is down or refuses the request.
function metadataJson(p, site) {
  return {
    name: p.name,
    symbol: KANTO.ticker(p),
    description: describe(p),
    image: ARTWORK(p.id),
    showName: true,
    createdOn: site,
    twitter: TWITTER,
    telegram: TELEGRAM,
    website: `${site}/#${p.id}`,
  };
}

app.get('/api/meta/:id', (req, res) => {
  const p = KANTO.byId(+req.params.id);
  if (!p) return fail(res, 404, 'No such Pokémon.');
  res.set('Cache-Control', 'public, max-age=31536000, immutable').json(metadataJson(p, siteUrl(req)));
});

async function uploadToPump(p, site) {
  const art = await fetch(ARTWORK(p.id));
  if (!art.ok) throw new Error(`Could not fetch artwork for ${p.name}.`);
  const form = new FormData();
  form.append('file', await art.blob(), `${p.id}.png`);
  form.append('name', p.name);
  form.append('symbol', KANTO.ticker(p));
  form.append('description', describe(p));
  form.append('twitter', TWITTER);
  form.append('telegram', TELEGRAM);
  form.append('website', `${site}/#${p.id}`);
  form.append('showName', 'true');
  const r = await fetch(PUMP_IPFS, { method: 'POST', body: form, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`pump.fun IPFS ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const json = await r.json();
  if (!json.metadataUri) throw new Error('pump.fun IPFS returned no URI');
  return json.metadataUri;
}

// Prefer pump.fun's IPFS; fall back to this site's own metadata URL.
async function uploadMetadata(p, site) {
  try {
    return await uploadToPump(p, site);
  } catch (e) {
    console.warn(`Using self-hosted metadata for #${p.id}:`, e.message);
    return `${site}/api/meta/${p.id}`;
  }
}

app.post('/api/catch/prepare', async (req, res) => {
  const { dex, trainer, mint, ball } = req.body || {};
  const id = +dex;
  const p = KANTO.byId(id);
  const b = KANTO.BALLS.find((x) => x.key === ball);
  if (!p) return fail(res, 400, 'Pick a Pokémon from #001 to #151.');
  if (!isKey(trainer) || !isKey(mint)) return fail(res, 400, 'Trainer and mint must be Solana addresses.');
  if (!b) return fail(res, 400, 'Choose a Poké Ball from the Bag.');

  let caught;
  try {
    caught = await store.caughtAll();
  } catch (e) {
    return fail(res, 503, e.message);
  }
  const locked = KANTO.lockReason(id, caught);
  if (locked) return fail(res, 409, locked);
  if (b.oncePerTrainer && Object.values(caught).some((c) => c.trainer === trainer && c.ball === b.key))
    return fail(res, 409, 'You already used your Master Ball. Pick another ball.');

  const expires = Date.now() + RESERVE_MS;
  const held = await store.reserve(id, { trainer, mint, ball: b.key, expires }, RESERVE_MS);
  if (held) return fail(res, 409, `Another trainer is throwing a ball at ${p.name}. Try again in a minute.`);
  try {
    const uri = await uploadMetadata(p, siteUrl(req));
    const r = await fetch(PUMPPORTAL, {
      signal: AbortSignal.timeout(20_000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: trainer,
        action: 'create',
        tokenMetadata: { name: p.name, symbol: KANTO.ticker(p), uri },
        mint,
        denominatedInSol: 'true',
        amount: b.sol,
        slippage: SLIPPAGE,
        priorityFee: PRIORITY_FEE,
        pool: 'pump',
      }),
    });
    if (!r.ok) throw new Error(`PumpPortal refused the create (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const tx = Buffer.from(await r.arrayBuffer()).toString('base64');
    res.json({ tx, metadataUri: uri, expires });
  } catch (e) {
    await store.release(id);
    fail(res, 502, e.message === 'fetch failed' ? 'Could not reach PumpPortal to build the launch. Try again.' : e.message);
  }
});

app.post('/api/catch/cancel', async (req, res) => {
  const { dex, trainer } = req.body || {};
  const r = await store.getReservation(+dex);
  if (r && r.trainer === trainer) await store.release(+dex);
  res.json({ ok: true });
});

app.post('/api/catch/submit', async (req, res) => {
  const { dex, tx } = req.body || {};
  const id = +dex;
  const r = await store.getReservation(id);
  if (!r) return fail(res, 409, 'The ball missed: your hold on this Pokémon expired. Throw again.');

  let keys, signers;
  try {
    ({ keys, signers } = parseTransaction(Buffer.from(String(tx), 'base64')));
  } catch {
    return fail(res, 400, 'That transaction could not be read.');
  }
  if (!signers.includes(r.trainer) || !signers.includes(r.mint))
    return fail(res, 400, 'The transaction must be signed by your wallet and the reserved mint.');
  if (!keys.includes(PUMP_PROGRAM)) return fail(res, 400, 'The transaction does not call pump.fun.');

  try {
    const signature = await rpc.sendTransaction(String(tx));
    const deadline = Date.now() + 50_000;
    let status;
    while (Date.now() < deadline) {
      status = await rpc.signatureStatus(signature);
      if (status?.err) throw new Error('The transaction failed on-chain.');
      if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus)) break;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    if (!status || status.err) throw new Error('The transaction did not confirm in time. Check your wallet history.');
    if (!(await rpc.accountExists(r.mint))) throw new Error('The mint account was not created.');

    await store.addCaught(id, { mint: r.mint, trainer: r.trainer, ball: r.ball, signature, ts: Date.now() });
    await store.release(id);
    res.json({ signature, mint: r.mint });
  } catch (e) {
    await store.release(id);
    fail(res, 502, e.message);
  }
});

// Last-resort handler so an unexpected error answers with its message.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error', detail: String(err.stack || err) });
});

module.exports = app;
