// PumpRoute London relay for the government Fuel Finder API.
// Fuel Finder only answers UK addresses; this function runs in London (vercel.json: lhr1)
// and forwards requests from the GitHub price job. It only works with the shared PROXY_KEY.
export const config = { maxDuration: 30 };

const BASE = 'https://www.fuel-finder.service.gov.uk';

export default async function handler(req, res) {
  res.setHeader('x-relay-region', process.env.VERCEL_REGION || 'unknown');
  if (!process.env.PROXY_KEY) return res.status(500).send('PROXY_KEY is not set in Vercel environment variables');
  if (req.headers['x-proxy-key'] !== process.env.PROXY_KEY) return res.status(401).send('Missing or wrong x-proxy-key');
  const path = String(req.query.path || '');
  if (!/^\/api\/v1\/[a-z0-9_\/-]+$/i.test(path)) return res.status(400).send('Bad path');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) if (k !== 'path') qs.set(k, String(v));
  const headers = { accept: 'application/json', 'user-agent': 'PumpRoute/1.0 (London relay)' };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  const init = { method: req.method === 'POST' ? 'POST' : 'GET', headers };
  if (init.method === 'POST') {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(Buffer.byteLength(body));
    init.body = body;
  }
  try {
    const r = await fetch(BASE + path + (qs.toString() ? '?' + qs : ''), init);
    res.status(r.status);
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    res.send(await r.text());
  } catch (e) {
    res.status(502).send('Relay could not reach Fuel Finder: ' + e.message);
  }
}
