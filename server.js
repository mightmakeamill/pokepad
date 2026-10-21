// Local entry: `npm start`. On Vercel, api/index.js serves the same app.
const app = require('./lib/app');
const PORT = +process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PokéPad on http://localhost:${PORT}`));
