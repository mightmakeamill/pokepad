/* PokéPad client. Runs "live" when served by server.js (real pump.fun mints
   through the trainer's wallet) and falls back to a demo when no server answers. */
(() => {
  const { POKEMON, byId, ticker, BALLS, SPECIAL, lockReason, BADGES, badgesFor } = window.KANTO;
  const $ = (s, el = document) => el.querySelector(s);
  const pad = (n) => String(n).padStart(3, '0');
  const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sprite = (id) => (window.SPRITES && window.SPRITES[id]) || `sprites/${id}.png`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pokepad:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('pokepad:' + k, JSON.stringify(v)); } catch {} },
  };

  const state = {
    mode: 'demo',
    caught: {},
    pending: {},
    names: {},
    sel: 25,
    tab: 'dex',
    filter: 'all',
    type: '',
    q: '',
    wallet: null,
    provider: null,
    ball: store.get('ball', 'poke'),
    muted: store.get('muted', false),
    busy: false,
  };

  /* ---------------- Sound: a tiny square-wave chip ---------------- */
  let actx;
  function tone(seq, type = 'square') {
    if (state.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      let t = actx.currentTime;
      for (const [f, d, f2] of seq) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d);
        t += d;
      }
    } catch {}
  }
  const sfx = {
    blip: () => tone([[1046, 0.035]]),
    open: () => tone([[523, 0.05], [784, 0.07]]),
    throw: () => tone([[300, 0.35, 1400]], 'triangle'),
    wobble: () => tone([[180, 0.06], [140, 0.06]]),
    caught: () => tone([[523, 0.11], [659, 0.11], [784, 0.11], [1046, 0.11], [784, 0.11], [1046, 0.32]]),
    fail: () => tone([[330, 0.12], [247, 0.12], [196, 0.3]]),
    badge: () => tone([[784, 0.09], [988, 0.09], [1175, 0.09], [1568, 0.3]]),
  };

  /* ---------------- Status helpers ---------------- */
  const caughtCount = () => Object.keys(state.caught).length;
  function status(id) {
    if (state.caught[id]) return 'caught';
    if (state.pending[id] && state.pending[id].trainer !== state.wallet) return 'pending';
    return lockReason(id, state.caught) ? 'locked' : 'wild';
  }
  const trainerName = (addr) => (addr === state.wallet ? store.get('name', 'RED') : state.names[addr]) || short(addr);
  const pumpUrl = (mint) => `https://pump.fun/coin/${mint}`;
  const txUrl = (sig) => `https://solscan.io/tx/${sig}`;
  const myCatches = () =>
    Object.entries(state.caught).filter(([, c]) => c.trainer === state.wallet).map(([id, c]) => ({ id: +id, ...c })).sort((a, b) => a.id - b.id);
  const masterUsed = () => myCatches().some((c) => c.ball === 'master');

  function chain(id) {
    let root = byId(id);
    while (root.from) root = byId(root.from);
    const out = [[root]];
    let layer = [root];
    while (layer.length) {
      const next = POKEMON.filter((p) => layer.some((l) => l.id === p.from));
      if (next.length) out.push(next);
      layer = next;
    }
    return out;
  }

  /* ---------------- Rendering ---------------- */
  function renderTop() {
    const n = caughtCount();
    $('#caughtNum').textContent = n;
    const prog = $('#progress');
    if (!prog.children.length) prog.innerHTML = '<i></i>'.repeat(151);
    [...prog.children].forEach((el, i) => el.classList.toggle('on', !!state.caught[i + 1]));
    const chip = $('#modeChip');
    chip.textContent = state.mode === 'live' ? 'MAINNET' : 'DEMO';
    chip.classList.toggle('live', state.mode === 'live');
    chip.title = state.mode === 'live' ? 'Catches mint real tokens on pump.fun' : 'Demo: catches are simulated and no SOL is spent';
    $('#walletBtn').textContent = state.wallet ? `${trainerName(state.wallet)} · ${short(state.wallet)}` : 'Connect wallet';
    $('#muteBtn').setAttribute('aria-pressed', String(state.muted));
  }

  function typeChips(p) {
    return `<div class="types">${p.types.map((t) => `<span class="type t-${t}">${t}</span>`).join('')}</div>`;
  }

  function renderViewer() {
    const p = byId(state.sel);
    const st = status(p.id);
    const c = state.caught[p.id];
    const label = { caught: 'CAUGHT', wild: 'WILD', locked: 'LOCKED', pending: 'BALL IN AIR' }[st];
    const imgClass = st === 'caught' ? '' : st === 'locked' ? 'locked' : 'sil';
    const why = lockReason(p.id, state.caught);
    const evo = chain(p.id)
      .map((layer) =>
        layer
          .map((e) => `<button type="button" data-go="${e.id}" aria-current="${e.id === p.id}" title="${esc(e.name)}">
            <img src="${sprite(e.id)}" alt="" class="${state.caught[e.id] ? '' : 'sil'}"><span>${pad(e.id)}</span></button>`)
          .join('')
      )
      .join('<span class="arrow">▶</span>');

    let info;
    if (c) {
      info = `<dl>
        <dt>TRAINER</dt><dd>${esc(trainerName(c.trainer))} <span class="mono">${short(c.trainer)}</span></dd>
        <dt>MINT</dt><dd class="mono">${state.mode === 'live' ? `<a class="lcd-link" href="${pumpUrl(c.mint)}" target="_blank" rel="noopener">${short(c.mint)} on pump.fun</a>` : short(c.mint)}</dd>
        <dt>BALL</dt><dd>${BALLS.find((b) => b.key === c.ball)?.name || c.ball}</dd>
        <dt>CAUGHT</dt><dd>${new Date(c.ts).toLocaleString()}</dd></dl>`;
    } else if (st === 'pending') {
      info = `<p class="lock-note">A trainer is throwing a ball at ${esc(p.name)} right now. If it breaks free, it's back in the grass.</p>`;
    } else if (why) {
      info = `<p class="lock-note">${esc(why)}</p>`;
    } else {
      info = `<dl><dt>TICKER</dt><dd class="mono">$${ticker(p)}</dd><dt>LAUNCH</dt><dd>pump.fun bonding curve, first buy set by your Poké Ball</dd></dl>`;
    }

    $('#viewer').innerHTML = `
      <div class="v-head"><span class="v-num">No.${pad(p.id)}</span><span class="v-status st-${st}">${label}</span></div>
      <div class="v-stage"><img src="${sprite(p.id)}" alt="${esc(p.name)}" class="${imgClass}"></div>
      <div><h2 class="v-name">${esc(p.name.toUpperCase())}</h2><p class="v-species">${esc(p.species)} Pokémon</p></div>
      ${typeChips(p)}
      <div class="v-info">${info}</div>
      <div class="evo" aria-label="Evolution line">${evo}</div>
      <button class="throw" type="button" id="throwBtn" ${st === 'wild' ? '' : 'disabled'}>
        ${st === 'wild' ? `THROW A BALL · $${ticker(p)}` : st === 'caught' ? 'ALREADY ON-CHAIN' : st === 'pending' ? 'SOMEONE IS THROWING' : 'NOT YET CATCHABLE'}
      </button>`;
  }

  function renderDex() {
    const types = [...new Set(POKEMON.flatMap((p) => p.types))].sort();
    const q = state.q.trim().toLowerCase();
    const list = POKEMON.filter((p) => {
      const st = status(p.id);
      if (state.filter !== 'all' && st !== state.filter) return false;
      if (state.type && !p.types.includes(state.type)) return false;
      if (q && !(p.name.toLowerCase().includes(q) || pad(p.id).includes(q) || ticker(p).toLowerCase().includes(q))) return false;
      return true;
    });
    const counts = { caught: 0, wild: 0, locked: 0, pending: 0 };
    POKEMON.forEach((p) => counts[status(p.id)]++);
    const chip = (k, txt) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${state.filter === k}">${txt}</button>`;
    return `
      <div class="p-head"><h2>KANTO POKéDEX</h2><span class="p-sub">${counts.caught} caught · ${counts.wild} wild · ${counts.locked + counts.pending} locked</span></div>
      <div class="filters">
        ${chip('all', 'ALL')}${chip('wild', 'WILD')}${chip('caught', 'CAUGHT')}${chip('locked', 'LOCKED')}
        <select id="typeSel" aria-label="Type"><option value="">Any type</option>${types.map((t) => `<option ${t === state.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <input id="search" type="search" placeholder="Name, No. or $TICKER" value="${esc(state.q)}" aria-label="Search">
      </div>
      <div class="grid">${
        list.length
          ? list.map((p) => `<button type="button" class="tile ${status(p.id)}" data-go="${p.id}" aria-current="${p.id === state.sel}" title="${esc(p.name)}">
              <img src="${sprite(p.id)}" alt="${esc(p.name)}" loading="lazy"><span class="n">${pad(p.id)}</span></button>`).join('')
          : '<p class="empty">No Pokémon match. Clear the search or pick another filter.</p>'
      }</div>`;
  }

  function renderBag() {
    const used = masterUsed();
    const items = [
      { name: 'Poké Flute', got: !!state.caught[94], how: 'Wakes Snorlax on Route 12. Comes from freeing Lavender Tower (Gengar caught).' },
      { name: 'Helix Fossil', got: caughtCount() >= 30, how: 'Cinnabar Lab revives it into Omanyte at 30 on-chain.' },
      { name: 'Dome Fossil', got: caughtCount() >= 30, how: 'Cinnabar Lab revives it into Kabuto at 30 on-chain.' },
      { name: 'Old Amber', got: caughtCount() >= 30, how: 'Cinnabar Lab revives it into Aerodactyl at 30 on-chain.' },
      { name: 'Secret Key', got: caughtCount() >= 50, how: 'Opens the roads to the legendary birds at 50 on-chain.' },
    ];
    return `
      <div class="p-head"><h2>BAG</h2><span class="p-sub">Your Poké Ball sets the first buy when a token launches</span></div>
      <div class="stack">
        <h3>POKé BALLS</h3>
        <div class="bag-list">${BALLS.map((b) => {
          const off = b.oncePerTrainer && used;
          return `<button type="button" class="bag-item" data-ball="${b.key}" aria-pressed="${state.ball === b.key}" ${off ? 'disabled' : ''}>
            <span class="icon-item"><span class="pball ${b.key}"></span></span>
            <span><span class="nm">${b.name.toUpperCase()}</span>${esc(off ? 'Used. Every trainer gets one Master Ball.' : b.blurb)}</span>
            <span class="sol">${b.sol} SOL</span></button>`;
        }).join('')}</div>
        <h3>KEY ITEMS</h3>
        <div class="bag-list">${items.map((i) => `<div class="bag-item key-item">
            <span class="icon-item">${keyIcon(i.name)}</span>
            <span><span class="nm">${i.name.toUpperCase()}</span>${esc(i.how)}</span>
            <span class="state">${i.got ? 'OBTAINED' : '—'}</span></div>`).join('')}</div>
        <p class="p-sub">Fees: pump.fun charges its create fee and the network takes a small priority fee on top of the ball's first buy.</p>
      </div>`;
  }

  function keyIcon(name) {
    const fill = { 'Poké Flute': '#d9a800', 'Helix Fossil': '#a08a32', 'Dome Fossil': '#8a7a52', 'Old Amber': '#e0872c', 'Secret Key': '#4f6b38' }[name];
    if (name === 'Poké Flute') return `<svg viewBox="0 0 32 32" width="30" height="30"><rect x="3" y="13" width="26" height="6" rx="3" fill="${fill}" stroke="#1f3a1f" stroke-width="2"/><circle cx="12" cy="16" r="1.5" fill="#1f3a1f"/><circle cx="17" cy="16" r="1.5" fill="#1f3a1f"/><circle cx="22" cy="16" r="1.5" fill="#1f3a1f"/></svg>`;
    if (name === 'Secret Key') return `<svg viewBox="0 0 32 32" width="30" height="30"><circle cx="10" cy="16" r="6" fill="none" stroke="${fill}" stroke-width="4"/><path d="M16 16h13M24 16v5M28 16v4" stroke="${fill}" stroke-width="4"/></svg>`;
    if (name === 'Helix Fossil') return `<svg viewBox="0 0 32 32" width="30" height="30"><circle cx="16" cy="16" r="12" fill="${fill}" stroke="#1f3a1f" stroke-width="2"/><path d="M16 16m-2 0a2 2 0 1 1 4 0a5 5 0 1 1 -9 -1a8 8 0 1 1 15 3" fill="none" stroke="#1f3a1f" stroke-width="2"/></svg>`;
    if (name === 'Dome Fossil') return `<svg viewBox="0 0 32 32" width="30" height="30"><path d="M4 24a12 12 0 0 1 24 0z" fill="${fill}" stroke="#1f3a1f" stroke-width="2"/><path d="M10 24v-6M16 24v-9M22 24v-6" stroke="#1f3a1f" stroke-width="2"/></svg>`;
    return `<svg viewBox="0 0 32 32" width="30" height="30"><path d="M16 3l11 8-4 15H9L5 11z" fill="${fill}" stroke="#1f3a1f" stroke-width="2"/><circle cx="14" cy="14" r="2" fill="#5a3b00"/></svg>`;
  }

  function renderPC() {
    if (!state.wallet)
      return `<div class="p-head"><h2>BILL'S PC</h2></div><p class="empty">Connect a wallet to open your box. Every Pokémon you catch is stored here with its pump.fun mint.</p>`;
    const mine = myCatches();
    return `
      <div class="p-head"><h2>BILL'S PC · BOX 1</h2><span class="p-sub">${mine.length} Pokémon stored</span></div>
      ${mine.length ? `<div class="rows">${mine.map((c) => {
        const p = byId(c.id);
        return `<div class="row"><img src="${sprite(c.id)}" alt="">
          <div><button type="button" class="t1 lcd-link" data-go="${c.id}" style="background:none;border:0;padding:0">${pad(c.id)} ${esc(p.name.toUpperCase())}</button>
          <span class="t2 mono">$${ticker(p)} · ${short(c.mint)}</span></div>
          <div class="r">${state.mode === 'live' ? `<a class="lcd-link" href="${pumpUrl(c.mint)}" target="_blank" rel="noopener">pump.fun</a>` : BALLS.find((b) => b.key === c.ball).name}</div></div>`;
      }).join('')}</div>` : `<p class="empty">Your box is empty. Pick a wild Pokémon in the Pokédex and press A to throw a ball.</p>`}`;
  }

  const BADGE_SVG = {
    Boulder: '<path d="M10 3h12l7 7v12l-7 7H10l-7-7V10z" fill="#9a9a9a" stroke="#333" stroke-width="2"/>',
    Cascade: '<path d="M16 2C10 12 6 17 6 21a10 10 0 0 0 20 0c0-4-4-9-10-19z" fill="#4f9be8" stroke="#1d4b80" stroke-width="2"/>',
    Thunder: '<path d="M16 2l4 10 10 1-8 6 3 11-9-6-9 6 3-11-8-6 10-1z" fill="#f2a530" stroke="#8a5a00" stroke-width="2"/>',
    Rainbow: '<g stroke="#333" stroke-width="1.5"><circle cx="16" cy="8" r="6" fill="#e8457a"/><circle cx="24" cy="16" r="6" fill="#f2c230"/><circle cx="16" cy="24" r="6" fill="#5ea83a"/><circle cx="8" cy="16" r="6" fill="#4f7ee8"/><circle cx="16" cy="16" r="4" fill="#fff"/></g>',
    Soul: '<path d="M16 28S3 20 3 11a6.5 6.5 0 0 1 13-2 6.5 6.5 0 0 1 13 2c0 9-13 17-13 17z" fill="#e85a9a" stroke="#7a1a4a" stroke-width="2"/>',
    Marsh: '<circle cx="16" cy="16" r="12" fill="#f2c230" stroke="#8a6a00" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="none" stroke="#8a6a00" stroke-width="2"/>',
    Volcano: '<path d="M16 2c3 7 10 10 10 18a10 10 0 0 1-20 0c0-5 3-7 5-10 1 3 3 4 3 4 0-5 1-8 2-12z" fill="#e0472c" stroke="#7a1a10" stroke-width="2"/>',
    Earth: '<path d="M16 3c8 4 12 10 12 15-4 7-8 10-12 11-4-1-8-4-12-11 0-5 4-11 12-15z" fill="#5ea83a" stroke="#2f5a1a" stroke-width="2"/><path d="M16 6v21" stroke="#2f5a1a" stroke-width="2"/>',
  };

  function renderTrainer() {
    if (!state.wallet)
      return `<div class="p-head"><h2>TRAINER CARD</h2></div><p class="empty">Connect a wallet to get your Trainer Card. Badges come from the types you catch.</p>`;
    const mine = myCatches();
    const spent = mine.reduce((s, c) => s + (BALLS.find((b) => b.key === c.ball)?.sol || 0), 0);
    const badges = badgesFor(state.wallet, state.caught);
    const idNo = String(parseInt(state.wallet.replace(/[^0-9]/g, '').slice(-5) || '0', 10) % 65536).padStart(5, '0');
    const first = mine[0];
    return `
      <div class="p-head"><h2>TRAINER CARD</h2><span class="p-sub">${badges.filter((b) => b.earned).length}/8 badges</span></div>
      <div class="tcard">
        <div class="tcard-top">
          <dl>
            <dt>NAME</dt><dd><input id="tname" maxlength="10" value="${esc(store.get('name', 'RED'))}" aria-label="Trainer name"></dd>
            <dt>IDNo</dt><dd>${idNo}</dd>
            <dt>WALLET</dt><dd class="mono">${esc(state.wallet)}</dd>
            <dt>POKéDEX</dt><dd>${mine.length} caught</dd>
            <dt>FIRST BUYS</dt><dd>${spent.toFixed(2)} SOL</dd>
            <dt>MASTER BALL</dt><dd>${masterUsed() ? 'Used' : 'Unused'}</dd>
          </dl>
          <div class="avatar">${first ? `<img src="${sprite(first.id)}" alt="" width="80" height="80" style="image-rendering:pixelated">` : ''}</div>
        </div>
        <div class="badges">${badges.map((b) => `<div class="badge ${b.earned ? '' : 'off'}" title="${b.leader}, ${b.city}">
          <svg viewBox="0 0 32 32" aria-hidden="true">${BADGE_SVG[b.name]}</svg>
          <span class="bn">${b.name.toUpperCase()}</span><span class="bp">${Math.min(b.have, b.count)}/${b.count} ${b.type}</span></div>`).join('')}</div>
      </div>
      <p class="p-sub" style="margin-top:12px">Each badge is won by launching enough Pokémon of its gym's type. Brock wants ${BADGES[0].count} Rock types; Misty wants ${BADGES[1].count} Water types.</p>`;
  }

  function renderFame() {
    const tally = {};
    for (const c of Object.values(state.caught)) tally[c.trainer] = (tally[c.trainer] || 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const recent = Object.entries(state.caught).map(([id, c]) => ({ id: +id, ...c })).sort((a, b) => b.ts - a.ts).slice(0, 8);
    return `
      <div class="p-head"><h2>HALL OF FAME</h2><span class="p-sub">${Object.keys(tally).length} trainers</span></div>
      <div class="stack">
        <h3>TOP TRAINERS</h3>
        ${top.length ? `<div class="rows">${top.map(([addr, n], i) => {
          const b = badgesFor(addr, state.caught).filter((x) => x.earned).length;
          return `<div class="row"><span class="rank">${i + 1}</span>
            <div><span class="t1">${esc(trainerName(addr).toUpperCase())}${addr === state.wallet ? ' (YOU)' : ''}</span><span class="t2 mono">${short(addr)}</span></div>
            <div class="r">${n} caught<br>${b} badge${b === 1 ? '' : 's'}</div></div>`;
        }).join('')}</div>` : '<p class="empty">No catches yet. The first trainer to launch a Pokémon takes the top spot.</p>'}
        <h3>RECENT CATCHES</h3>
        <div class="rows">${recent.map((c) => `<div class="row"><img src="${sprite(c.id)}" alt="">
          <div><span class="t1">${pad(c.id)} ${esc(byId(c.id).name.toUpperCase())}</span><span class="t2">by ${esc(trainerName(c.trainer))}</span></div>
          <div class="r">${ago(c.ts)}</div></div>`).join('')}</div>
      </div>`;
  }

  function ago(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  // Town Map: Kanto drawn as routes and towns, with the story-locked spots lit once open.
  const TOWNS = {
    Pallet: [40, 122], Viridian: [40, 88], Pewter: [40, 36], Cerulean: [124, 28], Saffron: [124, 70],
    Celadon: [82, 70], Lavender: [172, 70], Vermilion: [124, 108], Fuchsia: [96, 140], Cinnabar: [40, 152], Indigo: [12, 22],
  };
  const ROUTES = [
    ['Pallet', 'Viridian'], ['Viridian', 'Pewter'], ['Pewter', 'Cerulean'], ['Cerulean', 'Saffron'], ['Saffron', 'Vermilion'],
    ['Saffron', 'Celadon'], ['Saffron', 'Lavender'], ['Cerulean', 'Lavender'], ['Celadon', 'Fuchsia'], ['Viridian', 'Indigo'],
  ];
  const SPOTS = [
    { name: 'Route 12', at: [172, 118], ids: [143] },
    { name: 'Cinnabar Lab', at: [52, 152], ids: [138, 140, 142] },
    { name: 'Seafoam Islands', at: [70, 152], ids: [144] },
    { name: 'Power Plant', at: [176, 32], ids: [145] },
    { name: 'Victory Road', at: [20, 52], ids: [146] },
    { name: 'Cerulean Cave', at: [112, 14], ids: [150] },
    { name: 'Faraway Island', at: [184, 150], ids: [151] },
  ];
  function renderMap() {
    const n = caughtCount();
    const open = (s) => s.ids.some((id) => state.caught[id] || !lockReason(id, state.caught));
    const svg = `<svg class="kanto" viewBox="0 0 200 165" role="img" aria-label="Town Map of Kanto">
      <style>.sea{fill:#7f9a6a}.rt{stroke:#4f6b38;stroke-width:5;stroke-linecap:round;fill:none}.wt{stroke:#4f6b38;stroke-width:2;stroke-dasharray:3 3;fill:none}
      .tw{fill:#1f3a1f}.lb{font:5px 'Press Start 2P',monospace;fill:#1f3a1f}.sp{fill:#dbe6b4;stroke:#1f3a1f;stroke-width:1.5}.sp.on{fill:#f2c230}.sl{font:4px 'Press Start 2P',monospace;fill:#1f3a1f}</style>
      <path class="sea" d="M0 134 Q60 128 76 158 L200 158 L200 165 L0 165z"/>
      <path class="rt" d="M172 70 L172 118 L96 140"/>
      <path class="wt" d="M40 122 L40 152 L96 140"/>
      ${ROUTES.map(([a, b]) => `<line class="rt" x1="${TOWNS[a][0]}" y1="${TOWNS[a][1]}" x2="${TOWNS[b][0]}" y2="${TOWNS[b][1]}"/>`).join('')}
      ${Object.entries(TOWNS).map(([k, [x, y]]) => `<rect class="tw" x="${x - 5}" y="${y - 5}" width="10" height="10"/><text class="lb" x="${k === 'Lavender' ? x + 5 : x + 7}" y="${y - 7}" text-anchor="${k === 'Lavender' ? 'end' : 'start'}">${k.toUpperCase()}</text>`).join('')}
      ${SPOTS.map((s) => `<circle class="sp ${open(s) ? 'on' : ''}" cx="${s.at[0]}" cy="${s.at[1]}" r="4"/>`).join('')}
    </svg>`;
    const rows = SPOTS.map((s) => {
      const r = SPECIAL[s.ids[0]];
      const pct = r.need ? Math.min(100, Math.round((n / r.need) * 100)) : r.needIds.every((x) => state.caught[x]) ? 100 : 0;
      const names = s.ids.map((id) => byId(id).name).join(', ');
      return `<div class="row loc"><img src="${sprite(s.ids[0])}" alt="" style="${open(s) ? '' : 'filter:brightness(0) opacity(.35)'}">
        <div><span class="t1">${s.name.toUpperCase()}</span><span class="t2">${esc(names)}. ${esc(r.why)}</span><div class="bar"><b style="width:${open(s) ? 100 : pct}%"></b></div></div>
        <div class="r">${s.ids.every((id) => state.caught[id]) ? 'CAUGHT' : open(s) ? 'OPEN' : r.need ? `${n}/${r.need}` : 'LOCKED'}</div></div>`;
    }).join('');
    return `<div class="p-head"><h2>TOWN MAP</h2><span class="p-sub">Lit spots are open to catch</span></div>
      <div class="stack"><div class="map-wrap">${svg}</div><div class="rows">${rows}</div></div>`;
  }

  function renderPanel() {
    const html = { dex: renderDex, bag: renderBag, pc: renderPC, trainer: renderTrainer, fame: renderFame, map: renderMap }[state.tab]();
    const panel = $('#panel');
    const hadFocus = document.activeElement?.id === 'search';
    const caret = hadFocus ? document.activeElement.selectionStart : 0;
    panel.innerHTML = html;
    if (hadFocus) { const s = $('#search'); s.focus(); s.setSelectionRange(caret, caret); }
    document.querySelectorAll('#tabs .key').forEach((k) => k.setAttribute('aria-current', String(k.dataset.tab === state.tab)));
  }

  function render() { renderTop(); renderViewer(); renderPanel(); }

  function select(id, scroll) {
    state.sel = Math.min(151, Math.max(1, id));
    try { history.replaceState(null, '', `#${state.sel}`); } catch {}
    renderViewer();
    document.querySelectorAll('.tile').forEach((t) => t.setAttribute('aria-current', String(+t.dataset.go === state.sel)));
    if (scroll) $(`.tile[data-go="${state.sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3600);
  }

  /* ---------------- Wallet ---------------- */
  async function connect() {
    if (state.mode === 'demo') {
      state.wallet = DEMO_ME;
      render();
      toast('Demo wallet connected. Catches here are simulated.');
      return true;
    }
    const provider = window.phantom?.solana || window.solflare || window.backpack?.solana || window.solana;
    if (!provider) { toast('No Solana wallet found. Install Phantom, Solflare or Backpack and reload.'); return false; }
    try {
      const r = await provider.connect();
      state.provider = provider;
      state.wallet = (r?.publicKey || provider.publicKey).toString();
      render();
      return true;
    } catch { toast('Wallet connection was cancelled.'); return false; }
  }

  let web3Promise;
  const loadWeb3 = () =>
    (web3Promise ||= new Promise((ok, no) => {
      if (window.solanaWeb3) return ok(window.solanaWeb3);
      const s = document.createElement('script');
      s.src = 'vendor/index.iife.min.js';
      s.onload = () => ok(window.solanaWeb3);
      s.onerror = () => no(new Error('Could not load the Solana library.'));
      document.head.appendChild(s);
    }));
  const b64ToBytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  const bytesToB64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

  async function api(path, body) {
    const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Server error ${r.status}`);
    return j;
  }

  // Live catch: server builds the pump.fun create tx; wallet signs, then the mint keypair co-signs.
  async function catchLive(id, ball, step) {
    const w3 = await loadWeb3();
    const mint = w3.Keypair.generate();
    step('Writing the Pokédex entry to IPFS…');
    const prep = await api('/api/catch/prepare', { dex: id, trainer: state.wallet, mint: mint.publicKey.toBase58(), ball });
    step('Approve the throw in your wallet…');
    const tx = w3.VersionedTransaction.deserialize(b64ToBytes(prep.tx));
    let signed;
    try { signed = await state.provider.signTransaction(tx); }
    catch (e) { api('/api/catch/cancel', { dex: id, trainer: state.wallet }).catch(() => {}); throw new Error('You put the ball away. The wallet request was declined.'); }
    signed.sign([mint]);
    step('The ball is wobbling… waiting for Solana to confirm.');
    const res = await api('/api/catch/submit', { dex: id, tx: bytesToB64(signed.serialize()) });
    return { mint: res.mint, signature: res.signature };
  }

  async function catchDemo(id, ball, step) {
    if (state.pending[id]) throw new Error(`Another trainer is throwing a ball at ${byId(id).name}. Try again in a minute.`);
    step('Writing the Pokédex entry to IPFS…'); await sleep(900);
    step('Approve the throw in your wallet… (demo: auto-approved)'); await sleep(900);
    step('The ball is wobbling… waiting for Solana to confirm.'); await sleep(2600);
    return { mint: fakeKey(Math.random) + 'pump', signature: fakeKey(Math.random) + fakeKey(Math.random) };
  }

  /* ---------------- Battle screen ---------------- */
  const battle = $('#battle');
  let typing;
  function say(text, menu = []) {
    return sayIn(battle.hidden ? $('#oakText') : $('#battleText'), battle.hidden ? $('#oakMenu') : $('#battleMenu'), text, menu);
  }
  async function sayIn(pEl, menuEl, text, menu) {
    clearInterval(typing);
    menuEl.innerHTML = '';
    if (reduced) pEl.textContent = text;
    else {
      pEl.textContent = '';
      let i = 0;
      await new Promise((done) => {
        typing = setInterval(() => {
          pEl.textContent = text.slice(0, ++i);
          if (i >= text.length) { clearInterval(typing); done(); }
        }, 18);
      });
    }
    for (const m of menu) {
      const el = document.createElement(m.href ? 'a' : 'button');
      if (m.href) { el.href = m.href; el.target = '_blank'; el.rel = 'noopener'; }
      else el.type = 'button';
      el.className = m.ball ? 'inline-ball' : '';
      el.innerHTML = (m.ball ? `<span class="pball ${m.ball}"></span>` : '') + `<span>${esc(m.label)}${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</span>`;
      if (m.disabled) el.disabled = true;
      if (m.on) el.addEventListener('click', () => { sfx.blip(); m.on(); });
      menuEl.appendChild(el);
    }
    menuEl.querySelector('button:not(:disabled), a')?.focus();
  }

  function openBattle(id) {
    const p = byId(id);
    const st = status(id);
    if (st !== 'wild') { toast(lockReason(id, state.caught) || `${p.name} is not catchable right now.`); return; }
    battle.hidden = false;
    document.body.style.overflow = 'hidden';
    sfx.open();
    const foe = $('#foeImg');
    foe.src = sprite(id); foe.alt = p.name;
    foe.className = 'foe';
    void foe.offsetWidth; foe.classList.add('appear');
    $('#ballFly').className = 'ball-fly'; $('#ballFly').innerHTML = '';
    $('#sparkles').className = 'sparkles';
    $('#foeHp').style.width = '100%';
    $('#foeName').textContent = p.name.toUpperCase();
    $('#foeSub').textContent = `No.${pad(id)} · $${ticker(p)}\n${p.types.join('/').toUpperCase()}`;
    $('#meName').textContent = trainerName(state.wallet).toUpperCase();
    $('#meSub').textContent = `${myCatches().length} caught · ${short(state.wallet)}`;
    say(`Wild ${p.name.toUpperCase()} appeared!`).then(() => ballMenu(id));
  }

  function ballMenu(id) {
    const p = byId(id);
    const used = masterUsed();
    say(`Which ball will you throw at ${p.name.toUpperCase()}?`, [
      ...BALLS.map((b) => ({
        label: b.name.toUpperCase(), sub: b.oncePerTrainer && used ? 'Already used' : `${b.sol} SOL first buy`, ball: b.key,
        disabled: b.oncePerTrainer && used, on: () => confirmThrow(id, b),
      })),
      { label: 'RUN', sub: 'Back to the Pokédex', on: closeBattle },
    ]);
  }

  function confirmThrow(id, b) {
    const p = byId(id);
    say(
      `Throw a ${b.name.toUpperCase()}?\nThis launches $${ticker(p)} on pump.fun with your ${b.sol} SOL first buy, plus pump.fun and network fees.` +
        (state.mode === 'demo' ? '\n(Demo: nothing is sent.)' : ''),
      [
        { label: 'THROW', sub: `${b.sol} SOL`, ball: b.key, on: () => doThrow(id, b) },
        { label: 'BACK', sub: 'Pick another ball', on: () => ballMenu(id) },
      ]
    );
  }

  async function doThrow(id, b) {
    const p = byId(id);
    state.busy = true;
    state.ball = b.key; store.set('ball', b.key);
    const fly = $('#ballFly'), foe = $('#foeImg');
    fly.innerHTML = `<span class="pball ${b.key}"></span>`;
    fly.className = 'ball-fly throw';
    sfx.throw();
    await say(`${trainerName(state.wallet).toUpperCase()} threw a ${b.name.toUpperCase()}!`);
    await sleep(reduced ? 0 : 400);
    foe.classList.add('absorbed');
    fly.className = 'ball-fly wobble';
    const wob = setInterval(sfx.wobble, 1400);
    const step = (t) => { $('#battleText').textContent = t; };
    const badgesBefore = badgesFor(state.wallet, state.caught).filter((x) => x.earned).map((x) => x.name);
    try {
      const res = await (state.mode === 'live' ? catchLive : catchDemo)(id, b.key, step);
      clearInterval(wob);
      state.caught[id] = { mint: res.mint, trainer: state.wallet, ball: b.key, signature: res.signature, ts: Date.now() };
      if (state.mode === 'demo') store.set('demoCatches', { ...store.get('demoCatches', {}), [id]: state.caught[id] });
      fly.className = 'ball-fly done';
      $('#sparkles').className = 'sparkles on';
      sfx.caught();
      render();
      const newBadges = badgesFor(state.wallet, state.caught).filter((x) => x.earned && !badgesBefore.includes(x.name));
      const links = state.mode === 'live'
        ? [{ label: 'PUMP.FUN', sub: 'Open the coin page', href: pumpUrl(res.mint) }, { label: 'SOLSCAN', sub: 'See the transaction', href: txUrl(res.signature) }]
        : [];
      await say(`All right! ${p.name.toUpperCase()} was caught!\n$${ticker(p)} mint: ${short(res.mint)}`);
      for (const nb of newBadges) { sfx.badge(); await say(`${nb.leader}: "You earned the ${nb.name.toUpperCase()} BADGE!"`); await sleep(500); }
      const unlocked = POKEMON.filter((x) => x.from === id && !state.caught[x.id]);
      await say(
        `New POKéDEX data was added for ${p.name.toUpperCase()}!` + (unlocked.length ? `\n${unlocked.map((x) => x.name.toUpperCase()).join(', ')} can now be found in the wild.` : ''),
        [...links, { label: 'CLOSE', sub: 'Back to the Pokédex', on: closeBattle }]
      );
    } catch (e) {
      clearInterval(wob);
      fly.className = 'ball-fly';
      foe.classList.remove('absorbed');
      sfx.fail();
      await say(`Oh no! The POKéMON broke free!\n${e.message}`, [
        { label: 'TRY AGAIN', sub: 'Pick a ball', on: () => { foe.className = 'foe'; ballMenu(id); } },
        { label: 'RUN', sub: 'Back to the Pokédex', on: closeBattle },
      ]);
      refresh();
    } finally {
      state.busy = false;
    }
  }

  function closeBattle() {
    if (state.busy) return;
    clearInterval(typing);
    battle.hidden = true;
    document.body.style.overflow = '';
    render();
    $('#throwBtn')?.focus();
  }

  async function startCatch(id) {
    if (status(id) !== 'wild') { toast(lockReason(id, state.caught) || 'Not catchable right now.'); return; }
    if (!state.wallet && !(await connect())) return;
    openBattle(id);
  }

  /* ---------------- Professor Oak ---------------- */
  async function oakIntro() {
    const oak = $('#oak');
    oak.hidden = false;
    const lines = [
      'Hello there! Welcome to the world of POKéMON on Solana!',
      'This POKéDEX holds all 151 Pokémon of Kanto. Each one can be launched on pump.fun exactly once, by the first trainer to catch it.',
      'Evolutions need their earlier form on-chain first, and the legendaries hide until the region fills up. Mew comes last of all.',
      'Your Poké Ball sets your first buy. Now, which POKéMON will you start with?',
    ];
    for (let i = 0; i < lines.length - 1; i++) {
      await new Promise((next) => sayIn($('#oakText'), $('#oakMenu'), lines[i], [{ label: 'NEXT', on: next }]));
    }
    const starters = [1, 4, 7].map((id) => ({
      label: byId(id).name.toUpperCase(), sub: status(id) === 'wild' ? 'Still wild' : status(id) === 'caught' ? 'Already caught' : 'Taken',
      on: () => { oak.hidden = true; store.set('metOak', true); select(id, true); },
    }));
    sayIn($('#oakText'), $('#oakMenu'), lines[lines.length - 1], [
      ...starters,
      { label: 'LOOK AROUND', sub: 'Browse the Pokédex', on: () => { oak.hidden = true; store.set('metOak', true); } },
    ]);
  }

  /* ---------------- Demo data ---------------- */
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function fakeKey(r) { let s = ''; for (let i = 0; i < 40; i++) s += B58[Math.floor(r() * 58)]; return s; }
  const r0 = rng(151);
  const DEMO_ME = fakeKey(r0) + 'Ash1';
  const DEMO_TRAINERS = { BLUE: fakeKey(r0), MISTY: fakeKey(r0), BROCK: fakeKey(r0), ERIKA: fakeKey(r0), SURGE: fakeKey(r0) };
  function seedDemo() {
    const r = rng(25);
    const t = Object.values(DEMO_TRAINERS);
    const plan = {
      [DEMO_ME]: [[25, 'great'], [81, 'poke'], [100, 'poke'], [7, 'ultra'], [8, 'poke'], [54, 'poke'], [60, 'poke']],
      [t[0]]: [[1, 'ultra'], [2, 'great'], [16, 'poke'], [17, 'poke'], [19, 'poke'], [21, 'poke'], [133, 'master'], [147, 'great']],
      [t[1]]: [[120, 'great'], [129, 'poke'], [35, 'poke'], [39, 'poke']],
      [t[2]]: [[74, 'poke'], [41, 'poke'], [66, 'great'], [52, 'poke']],
      [t[3]]: [[4, 'ultra'], [10, 'poke'], [11, 'poke'], [12, 'poke'], [63, 'great']],
      [t[4]]: [[92, 'poke'], [93, 'poke'], [94, 'ultra'], [143, 'great']],
    };
    const now = Date.now();
    let k = 0;
    for (const [trainer, list] of Object.entries(plan))
      for (const [id, ball] of list)
        state.caught[id] = { trainer, ball, mint: fakeKey(r) + 'pump', signature: fakeKey(r), ts: now - (k++ * 47 + Math.floor(r() * 40)) * 60000 };
    Object.assign(state.caught, store.get('demoCatches', {}));
    state.pending[5] = { trainer: t[3], expires: now + 60000 };
    state.names = Object.fromEntries(Object.entries(DEMO_TRAINERS).map(([n, a]) => [a, n]));
    state.wallet = DEMO_ME;
  }

  async function refresh() {
    if (state.mode !== 'live') return;
    try {
      const reg = await api('/api/registry');
      state.caught = reg.caught; state.pending = reg.pending;
      if (!state.busy && battle.hidden) render(); else renderTop();
    } catch (e) {
      if (!refresh.warned) { refresh.warned = true; toast(e.message); }
    }
  }

  /* ---------------- Events ---------------- */
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { sfx.blip(); select(+go.dataset.go); if (go.closest('#panel') && innerWidth <= 920) $('#viewer').scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { sfx.blip(); state.tab = tab.dataset.tab; renderPanel(); return; }
    const f = e.target.closest('[data-filter]');
    if (f) { sfx.blip(); state.filter = f.dataset.filter; renderPanel(); return; }
    const b = e.target.closest('[data-ball]');
    if (b) { sfx.blip(); state.ball = b.dataset.ball; store.set('ball', state.ball); renderPanel(); toast(`${BALLS.find((x) => x.key === state.ball).name} ready.`); return; }
    const d = e.target.closest('[data-d]');
    if (d) { sfx.blip(); select(state.sel + +d.dataset.d, true); return; }
    if (e.target.closest('#throwBtn') || e.target.closest('#aBtn')) { startCatch(state.sel); return; }
    if (e.target.closest('#grassBtn')) {
      const wild = POKEMON.filter((p) => status(p.id) === 'wild');
      if (!wild.length) { toast('The grass is quiet. Every catchable Pokémon is already on-chain.'); return; }
      sfx.open();
      const p = wild[Math.floor(Math.random() * wild.length)];
      select(p.id, true);
      toast(`Something rustles in the grass… it's ${p.name}!`);
      return;
    }
    if (e.target.closest('#walletBtn')) {
      if (state.wallet) { state.tab = 'trainer'; renderPanel(); } else connect();
      return;
    }
    if (e.target.closest('#muteBtn')) { state.muted = !state.muted; store.set('muted', state.muted); renderTop(); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'search') { state.q = e.target.value; renderPanel(); }
    if (e.target.id === 'tname') { store.set('name', e.target.value.toUpperCase().slice(0, 10) || 'RED'); renderTop(); }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'typeSel') { state.type = e.target.value; renderPanel(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !battle.hidden) closeBattle();
    if (!battle.hidden || !$('#oak').hidden || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -10, ArrowDown: 10 };
    if (moves[e.key] && document.activeElement?.closest('.dpad, body') && !document.activeElement?.closest('#panel')) {
      e.preventDefault(); select(state.sel + moves[e.key], true);
    }
    if (e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey) startCatch(state.sel);
  });

  /* ---------------- Boot ---------------- */
  async function boot() {
    // Only the single-file build (sprites inlined) runs the demo. A hosted site
    // stays live even if the API is down, so nobody "catches" a fake token.
    let apiDown = null;
    if (!window.SPRITES) {
      state.mode = 'live';
      try { await api('/api/config'); } catch (e) { apiDown = e; }
    }
    if (state.mode === 'live') {
      await refresh();
      setInterval(refresh, 12000);
      const p = window.phantom?.solana || window.solana;
      if (p?.isConnected && p.publicKey) { state.provider = p; state.wallet = p.publicKey.toString(); }
    } else seedDemo();
    const h = parseInt(location.hash.slice(1), 10);
    if (h >= 1 && h <= 151) state.sel = h;
    render();
    if (apiDown) toast(`Can't reach the PokéPad server, so catching is off. Reload in a minute.`);
    if (!store.get('metOak', false)) oakIntro();
  }
  boot();
})();
