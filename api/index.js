// Vercel function: every /api/* request is routed here (see vercel.json).
// If the app fails to load, answer with the reason instead of Vercel's
// generic 500 page, so the cause shows up right in the browser.
let app;
let loadError;
try {
  app = require('../lib/app');
} catch (e) {
  loadError = e;
  console.error('PokéPad failed to start:', e);
}

process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e));

module.exports = (req, res) => {
  if (loadError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'PokéPad failed to start', detail: String(loadError.stack || loadError) }));
  }
  try {
    return app(req, res);
  } catch (e) {
    console.error('Request crashed:', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Request crashed', detail: String(e.stack || e) }));
  }
};
