import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, createServer } from './subscribe.mjs';

test('accepts ordinary addresses and lower-cases the domain', () => {
  assert.equal(validateEmail('jane.doe@example.com'), 'jane.doe@example.com');
  assert.equal(validateEmail('  Jane+news@Mail.Example.CO.UK '), 'Jane+news@mail.example.co.uk');
  assert.equal(validateEmail("o'neil_99@sub-domain.example.io"), "o'neil_99@sub-domain.example.io");
});

test('rejects anything that is not a single plain email address', () => {
  const bad = [
    '', 'plainstring', 'no-at.example.com', '@example.com', 'user@', 'user@localhost', 'user@example',
    'a@b@example.com', 'user name@example.com', 'user@exa mple.com', 'user@example.c', 'user@example.123',
    '.user@example.com', 'user.@example.com', 'us..er@example.com', 'user@-example.com', 'user@example-.com',
    'user@example..com', 'user@example.com\r\nBcc: victim@example.org', 'user@example.com\nX: y',
    '"quoted"@example.com', 'user@[127.0.0.1]', 'Jane <jane@example.com>', 'jane@example.com, bob@example.com',
    'jane@example.com;bob@example.com', 'jané@example.com', 'user@exämple.com', '<script>@example.com',
    'x'.repeat(65) + '@example.com', 'u@' + 'a'.repeat(250) + '.com',
    null, undefined, 42, {}, ['a@example.com'],
  ];
  for (const v of bad) assert.equal(validateEmail(v), null, `should reject ${JSON.stringify(v)}`);
});

async function withServer(mailer, fn) {
  const server = createServer(mailer).listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/api/subscribe`;
  try { await fn(url); } finally { server.close(); }
}
const post = (url, body, headers = { 'Content-Type': 'application/json', 'X-Real-IP': String(Math.random()) }) =>
  fetch(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('sends one notification to the owner for a valid address', async () => {
  const mails = [];
  await withServer({ sendMail: async (m) => mails.push(m) }, async (url) => {
    let r = await post(url, { email: 'reader@example.com', website: '' });
    assert.equal(r.status, 201);
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, 'sajin@sajinshivdas.com');
    assert.equal(mails[0].replyTo, 'reader@example.com');
    assert.match(mails[0].text, /reader@example\.com/);
    r = await post(url, { email: 'READER@example.com' });
    assert.equal(r.status, 200, 'duplicate is acknowledged');
    assert.equal(mails.length, 1, 'duplicate does not send again');
  });
});

test('rejects invalid input without sending', async () => {
  const mails = [];
  await withServer({ sendMail: async (m) => mails.push(m) }, async (url) => {
    assert.equal((await post(url, { email: 'not-an-email' })).status, 400);
    assert.equal((await post(url, { email: 'a@example.com\r\nBcc: x@example.org' })).status, 400);
    assert.equal((await post(url, '{bad json')).status, 400);
    assert.equal((await post(url, ['a@example.com'])).status, 400);
    assert.equal((await post(url, { email: 'a@example.com' }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post(url, { email: 'a@example.com', pad: 'x'.repeat(2000) })).status, 413);
    assert.equal((await fetch(url)).status, 405);
    const hp = await post(url, { email: 'bot@example.com', website: 'spam' });
    assert.equal(hp.status, 200, 'honeypot looks like success to bots');
    assert.equal(mails.length, 0);
  });
});

test('rate-limits repeated attempts from one IP', async () => {
  await withServer({ sendMail: async () => {} }, async (url) => {
    const h = { 'Content-Type': 'application/json', 'X-Real-IP': '203.0.113.9' };
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await post(url, { email: `r${i}@example.com` }, h)).status);
    assert.deepEqual(codes.slice(0, 5), [201, 201, 201, 201, 201]);
    assert.equal(codes[5], 429);
  });
});

test('answers 503 when SMTP is not configured, and 502 when sending fails', async () => {
  await withServer(null, async (url) => assert.equal((await post(url, { email: 'a@example.com' })).status, 503));
  await withServer({ sendMail: async () => { throw new Error('smtp down'); } }, async (url) =>
    assert.equal((await post(url, { email: 'b@example.com' })).status, 502));
});
