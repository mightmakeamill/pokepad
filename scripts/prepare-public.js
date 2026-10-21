// Copies the shared rules and the Solana browser library into public/.
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');
fs.mkdirSync(path.join(pub, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'lib', 'kanto.js'), path.join(pub, 'kanto.js'));
fs.copyFileSync(
  path.join(path.dirname(require.resolve('@solana/web3.js/package.json')), 'lib', 'index.iife.min.js'),
  path.join(pub, 'vendor', 'index.iife.min.js')
);
