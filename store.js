// Catch registry + reservation holds. Uses Upstash Redis when its env vars are
// set (required on Vercel, where memory and disk don't survive between
// requests) and falls back to a local JSON file + in-memory map otherwise.
const fs = require('fs');
const path = require('path');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

function redisStore() {
  const { Redis } = require('@upstash/redis');
  const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  const CAUGHT = 'pokepad:caught';
  const hold = (id) => `pokepad:hold:${id}`;
  return {
    kind: 'redis',
    async caughtAll() {
      return (await redis.hgetall(CAUGHT)) || {};
    },
    // HSETNX keeps the first catch if two submits ever race.
    async addCaught(id, rec) {
      return (await redis.hsetnx(CAUGHT, String(id), rec)) === 1;
    },
    // Returns the blocking hold if another trainer has this Pokémon, else null.
    async reserve(id, r, ms) {
      if (await redis.set(hold(id), r, { nx: true, px: ms })) return null;
      const cur = await redis.get(hold(id));
      if (cur && cur.trainer !== r.trainer) return cur;
      await redis.set(hold(id), r, { px: ms });
      return null;
    },
    async getReservation(id) {
      return redis.get(hold(id));
    },
    async release(id) {
      await redis.del(hold(id));
    },
    async pendingAll() {
      const ids = Array.from({ length: 151 }, (_, i) => i + 1);
      const vals = await redis.mget(...ids.map(hold));
      const out = {};
      vals.forEach((v, i) => v && (out[ids[i]] = { trainer: v.trainer, expires: v.expires }));
      return out;
    },
  };
}

function fileStore() {
  const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const file = path.join(dir, 'registry.json');
  fs.mkdirSync(dir, { recursive: true });
  let registry = { caught: {} };
  try {
    registry = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  const save = () => {
    fs.writeFileSync(file + '.tmp', JSON.stringify(registry, null, 2));
    fs.renameSync(file + '.tmp', file);
  };
  const holds = new Map();
  const live = (id) => {
    const r = holds.get(id);
    if (r && r.expires < Date.now()) holds.delete(id);
    return holds.get(id) || null;
  };
  return {
    kind: 'file',
    async caughtAll() {
      return registry.caught;
    },
    async addCaught(id, rec) {
      if (registry.caught[id]) return false;
      registry.caught[id] = rec;
      save();
      return true;
    },
    async reserve(id, r) {
      const cur = live(id);
      if (cur && cur.trainer !== r.trainer) return cur;
      holds.set(id, r);
      return null;
    },
    async getReservation(id) {
      return live(id);
    },
    async release(id) {
      holds.delete(id);
    },
    async pendingAll() {
      const out = {};
      for (const id of [...holds.keys()]) {
        const r = live(id);
        if (r) out[id] = { trainer: r.trainer, expires: r.expires };
      }
      return out;
    },
  };
}

module.exports = REDIS_URL && REDIS_TOKEN ? redisStore() : fileStore();
