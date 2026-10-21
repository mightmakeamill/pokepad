// Inlines the client, styles and all 151 sprites into one self-contained demo page
// (dist/pokepad-demo.html). Without server.js behind it the page runs in demo mode.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const head = html.match(/<title>[\s\S]*?(?=<link rel="stylesheet" href="styles.css">)/)[0];
const app = html.match(/<!--APP-->([\s\S]*?)<!--\/APP-->/)[1];
const sprites = {};
for (let i = 1; i <= 151; i++)
  sprites[i] = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'sprites', `${i}.png`)).toString('base64');

const out = `${head}<style>
${read('styles.css')}
</style>
${app}
<script>window.SPRITES=${JSON.stringify(sprites)};</script>
<script>
${read('kanto.js')}
</script>
<script>
${read('app.js')}
</script>
`;
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'pokepad-demo.html'), out);
console.log(`dist/pokepad-demo.html ${(out.length / 1024).toFixed(0)} KB`);
