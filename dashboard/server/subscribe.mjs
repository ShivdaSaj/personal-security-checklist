// Defense Console newsletter sign-up API.
// Accepts POST /api/subscribe {"email": "..."} from the site footer, validates the address and
// emails a notification to MAIL_TO over SMTP. Nothing is stored. Configuration (env):
//   SMTP_USER, SMTP_PASS   mailbox used to send (required; without them the API answers 503)
//   SMTP_HOST, SMTP_PORT   default smtp.hostinger.com:465 (implicit TLS)
//   SMTP_FROM              default SMTP_USER
//   MAIL_TO                default sajin@sajinshivdas.com
//   PORT                   default 3000
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import nodemailer from 'nodemailer';

const env = process.env;
const PORT = Number(env.PORT) || 3000;
const MAIL_TO = env.MAIL_TO || 'sajin@sajinshivdas.com';
const SMTP_HOST = env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT = Number(env.SMTP_PORT) || 465;
const SMTP_USER = env.SMTP_USER || '';
const SMTP_PASS = env.SMTP_PASS || '';
const SMTP_FROM = env.SMTP_FROM || SMTP_USER;
const configured = Boolean(SMTP_USER && SMTP_PASS);

const MAX_BODY = 1024;               // bytes
const IP_LIMIT = 5;                  // sign-ups per IP per window
const IP_WINDOW = 15 * 60 * 1000;
const GLOBAL_LIMIT = 60;             // notification emails per hour, all clients
const DEDUPE_MS = 24 * 60 * 60 * 1000;

const transport = configured
  ? nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
      requireTLS: SMTP_PORT !== 465, auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    })
  : null;

// ---------- validation ----------
const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/;

/** Returns the normalised address, or null if `value` is not a single plain email address. */
export function validateEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (email.length < 6 || email.length > 254) return null;
  if (/[^\x21-\x7e]/.test(email)) return null; // printable ASCII only: no spaces, control or non-ASCII chars
  const at = email.lastIndexOf('@');
  if (at < 1 || email.indexOf('@') !== at) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (local.length > 64 || !LOCAL_RE.test(local)) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || domain.length > 253) return null;
  if (!labels.every((l) => LABEL_RE.test(l))) return null;
  if (!TLD_RE.test(labels[labels.length - 1])) return null;
  return `${local}@${domain}`;
}

// ---------- rate limiting ----------
const hits = new Map();   // ip -> [timestamps]
const recent = new Map(); // email -> timestamp
let sent = [];
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < IP_WINDOW);
  list.push(now);
  hits.set(ip, list);
  return list.length > IP_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < IP_WINDOW)) hits.delete(ip);
  for (const [e, t] of recent) if (now - t > DEDUPE_MS) recent.delete(e);
  sent = sent.filter((t) => now - t < 3_600_000);
}, 60_000).unref();

// Traefik sets X-Real-IP to the connecting client and appends it to X-Forwarded-For, so prefer
// X-Real-IP and otherwise take the last X-Forwarded-For hop (earlier entries are client-supplied).
const clientIp = (req) => String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop() || req.socket.remoteAddress || '').trim();

// ---------- http ----------
const SEC_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
};
const send = (res, status, body, extra = {}) => { res.writeHead(status, { ...SEC_HEADERS, ...extra }); res.end(JSON.stringify(body)); };
const fail = (res, status, error, extra) => send(res, status, { ok: false, error }, extra);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.removeAllListeners('data'); req.resume(); reject(Object.assign(new Error('too large'), { status: 413 })); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res, transport) {
  const path = (req.url || '').split('?')[0];
  if (path === '/healthz') return send(res, 200, { ok: true, configured: Boolean(transport) });
  if (path !== '/api/subscribe') return fail(res, 404, 'Not found');
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed', { Allow: 'POST' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return fail(res, 415, 'Expected JSON.');
  if (limited(clientIp(req))) return fail(res, 429, 'Too many attempts. Please try again later.', { 'Retry-After': '900' });

  let data;
  try { data = JSON.parse(await readBody(req)); } catch (e) {
    return e.status === 413 ? fail(res, 413, 'Request too large.', { Connection: 'close' }) : fail(res, 400, 'Invalid request.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(res, 400, 'Invalid request.');
  if (data.website) return send(res, 200, { ok: true, message: 'Thanks for subscribing!' }); // honeypot: bots fill hidden field

  const email = validateEmail(data.email);
  if (!email) return fail(res, 400, 'Please enter a valid email address.');
  if (!transport) return fail(res, 503, 'Subscriptions are temporarily unavailable. Please try again later.');

  const key = email.toLowerCase();
  if (recent.has(key)) return send(res, 200, { ok: true, message: 'You are already subscribed. Thank you!' });
  if (sent.length >= GLOBAL_LIMIT) return fail(res, 503, 'Subscriptions are busy right now. Please try again later.');

  try {
    await transport.sendMail({
      from: { name: 'Defense Console', address: SMTP_FROM },
      to: MAIL_TO,
      replyTo: email,
      subject: 'New newsletter subscriber',
      text: `A visitor subscribed to cybersecurity insights from the Defense Console footer.\n\nEmail: ${email}\nTime: ${new Date().toISOString()}\nSite: personal-checklist.sajinshivdas.online\n`,
    });
  } catch (err) {
    console.error('[subscribe] send failed:', err.code || err.message);
    return fail(res, 502, 'Subscription failed. Please try again later.');
  }
  sent.push(Date.now());
  recent.set(key, Date.now());
  console.log('[subscribe] notification sent');
  return send(res, 201, { ok: true, message: 'Thanks for subscribing! You will receive cybersecurity insights by email.' });
}

/** Builds the HTTP server. `mailer` defaults to the SMTP transport from the environment. */
export function createServer(mailer = transport) {
  return http.createServer((req, res) => handle(req, res, mailer).catch((err) => {
    console.error('[subscribe] error:', err.message);
    if (!res.headersSent) fail(res, 500, 'Something went wrong.');
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(PORT, () => console.log(`[subscribe] listening on :${PORT}, smtp ${configured ? 'configured' : 'NOT configured'}`));
}
