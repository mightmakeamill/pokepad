// PokéPad API + static server: serves the Pokédex, keeps the Kanto registry, and builds
// pump.fun create transactions through PumpPortal's local-transaction API.
// The server never holds keys: the browser signs with the trainer's wallet
// and a fresh mint keypair, then hands the signed tx back for relay.
const path = require('path');
const express = require('express');
const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
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

const connection = new Connection(RPC, 'confirmed');
const store = require('./store');

const isKey = (s) => {
  try {
    return new PublicKey(s).toBase58() === s;
  } catch {
    return false;
  }
};

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

async function uploadMetadata(p) {
  let image;
  try {
    const r = await fetch(ARTWORK(p.id));
    if (!r.ok) throw new Error();
    image = await r.blob();
  } catch {
    // Official artwork missing: fall back to the small sprite.
    const r = await fetch(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`);
    if (!r.ok) throw new Error(`Could not fetch artwork for ${p.name}.`);
    image = await r.blob();
  }
  const form = new FormData();
  form.append('file', image, `${p.id}.png`);
  form.append('name', p.name);
  form.append('symbol', KANTO.ticker(p));
  form.append(
    'description',
    `#${String(p.id).padStart(3, '0')} ${p.name}, the ${p.species} Pokémon. ` +
      `Type: ${p.types.join('/')}. Caught on PokéPad, the Kanto Pokédex launchpad: 151 Pokémon, one mint each.`
  );
  form.append('twitter', TWITTER);
  form.append('telegram', TELEGRAM);
  form.append('website', SITE_URL ? `${SITE_URL}/#${p.id}` : '');
  form.append('showName', 'true');
  const r = await fetch(PUMP_IPFS, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`pump.fun metadata upload failed (${r.status})`);
  const json = await r.json();
  if (!json.metadataUri) throw new Error('pump.fun metadata upload returned no URI');
  return json.metadataUri;
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
    const uri = await uploadMetadata(p);
    const r = await fetch(PUMPPORTAL, {
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
    fail(res, 502, e.message);
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

  let vtx;
  try {
    vtx = VersionedTransaction.deserialize(Buffer.from(tx, 'base64'));
  } catch {
    return fail(res, 400, 'That transaction could not be read.');
  }
  const keys = vtx.message.staticAccountKeys.map((k) => k.toBase58());
  const signers = keys.slice(0, vtx.message.header.numRequiredSignatures);
  if (!signers.includes(r.trainer) || !signers.includes(r.mint))
    return fail(res, 400, 'The transaction must be signed by your wallet and the reserved mint.');
  if (!keys.includes(PUMP_PROGRAM)) return fail(res, 400, 'The transaction does not call pump.fun.');

  try {
    const signature = await connection.sendRawTransaction(vtx.serialize(), { maxRetries: 3 });
    const deadline = Date.now() + 50_000;
    let status;
    while (Date.now() < deadline) {
      status = (await connection.getSignatureStatuses([signature])).value[0];
      if (status?.err) throw new Error('The transaction failed on-chain.');
      if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus)) break;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    if (!status || status.err) throw new Error('The transaction did not confirm in time. Check your wallet history.');
    if (!(await connection.getAccountInfo(new PublicKey(r.mint)))) throw new Error('The mint account was not created.');

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
