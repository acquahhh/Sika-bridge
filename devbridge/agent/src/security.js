// Request checks applied to every HTTP and WebSocket request:
//  1. Host header must be the loopback address the agent listens on
//     (stops DNS-rebinding pages from talking to the agent).
//  2. Origin, when present, must be on the allow-list in config.json.
//  3. A bearer token (printed by the agent at start-up) is required.
import crypto from 'node:crypto';

export function hostAllowed(host, port) {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(String(host || '').toLowerCase());
}

export function originAllowed(origin, cfg) {
  return !origin || cfg.allowedOrigins.includes(origin);
}

export function tokenMatches(given, expected) {
  if (typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function securityMiddleware(cfg) {
  return (req, res, next) => {
    if (!hostAllowed(req.headers.host, cfg.port)) {
      return res.status(421).json({ error: { code: 'bad_host', message: 'Requests must be addressed to 127.0.0.1 or localhost' } });
    }
    const origin = req.headers.origin;
    if (!originAllowed(origin, cfg)) {
      return res.status(403).json({
        error: { code: 'origin_not_allowed', message: `Origin ${origin} is not allowed. Add it to allowedOrigins in ${cfg.file} or start the agent with --allow-origin.` },
      });
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Unauthenticated: just enough to tell the UI an agent is listening.
    if (req.path === '/api/health') return next();

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!tokenMatches(token, cfg.token)) {
      return res.status(401).json({ error: { code: 'unauthorized', message: 'Missing or wrong agent token. Copy the token printed by the agent into Settings.' } });
    }
    next();
  };
}
