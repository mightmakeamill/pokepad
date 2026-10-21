// The few Solana pieces the server needs, without @solana/web3.js (its
// rpc-websockets dependency is ESM-only and crashes Vercel's CommonJS runtime).
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

function b58encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let k = zeros; k < bytes.length; k++) {
    let carry = bytes[k];
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return '1'.repeat(zeros) + digits.reverse().map((d) => ALPHABET[d]).join('');
}

function b58decode(str) {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;
  const bytes = [];
  for (let k = zeros; k < str.length; k++) {
    if (!(str[k] in MAP)) throw new Error('bad base58');
    let carry = MAP[str[k]];
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

// A public key is 32 bytes of base58.
function isPublicKey(s) {
  try {
    return typeof s === 'string' && b58decode(s).length === 32 && b58encode(b58decode(s)) === s;
  } catch {
    return false;
  }
}

function readCompactU16(buf, at) {
  let value = 0;
  let size = 0;
  for (;;) {
    const b = buf[at + size];
    value |= (b & 0x7f) << (7 * size);
    size++;
    if ((b & 0x80) === 0) return [value, size];
  }
}

// Reads the signer list and static account keys of a legacy or v0 transaction.
function parseTransaction(buf) {
  let at = 0;
  const [numSigs, s1] = readCompactU16(buf, at);
  at += s1 + numSigs * 64;
  if (buf[at] & 0x80) at++; // versioned message prefix
  const numRequiredSignatures = buf[at];
  at += 3;
  const [numKeys, s2] = readCompactU16(buf, at);
  at += s2;
  const keys = [];
  for (let i = 0; i < numKeys; i++, at += 32) {
    if (at + 32 > buf.length) throw new Error('truncated transaction');
    keys.push(b58encode(buf.subarray(at, at + 32)));
  }
  return { keys, signers: keys.slice(0, numRequiredSignatures) };
}

function rpcClient(url) {
  let id = 0;
  const call = async (method, params) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(`Solana RPC error (${r.status})`);
    if (j.error) throw new Error(j.error.message || 'Solana RPC error');
    return j.result;
  };
  return {
    sendTransaction: (b64) =>
      call('sendTransaction', [b64, { encoding: 'base64', maxRetries: 3, preflightCommitment: 'confirmed' }]),
    signatureStatus: async (sig) =>
      (await call('getSignatureStatuses', [[sig], { searchTransactionHistory: false }])).value[0],
    // Signers and static account keys of a confirmed transaction.
    transaction: async (sig) => {
      const t = await call('getTransaction', [sig, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
      if (!t) return null;
      const m = t.transaction.message;
      return { err: t.meta?.err || null, keys: m.accountKeys, signers: m.accountKeys.slice(0, m.header.numRequiredSignatures) };
    },
    accountExists: async (key) =>
      !!(await call('getAccountInfo', [key, { encoding: 'base64', commitment: 'confirmed' }])).value,
  };
}

module.exports = { b58encode, b58decode, isPublicKey, parseTransaction, rpcClient };
