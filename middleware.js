// PIN gate for the whole site (Yousef 2026-11-03). Vercel runs this before every request, so the page, the videos and
// the PDFs are all behind it. The right PIN sets a 30-day cookie; anything else gets the PIN page.
export const config = { matcher: '/:path*' };

const SALT = 'yousefkamel.site/pin/v1';
// SHA-256 of SALT + ':' + PIN; the PIN itself is not in this file.
const PIN_HASH = '7ba59d7b1812b4bf52ea75957bf65a269578d9755a94e9a712a87cf3ca47d6bc';
const COOKIE = 'yk_pin';
const MAX_AGE = 60 * 60 * 24 * 30;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The cookie holds a hash of the PIN hash, so it can't be built from the PIN hash alone.
const token = () => sha256(PIN_HASH + ':cookie');
const pass = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

export default async function middleware(request) {
  const url = new URL(request.url);
  const cookies = Object.fromEntries((request.headers.get('cookie') || '').split(/;\s*/).filter(Boolean).map((c) => {
    const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)];
  }));

  if (url.pathname === '/__pin' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const pin = String((form && form.get('pin')) || '').trim();
    let back = String((form && form.get('back')) || '/');
    if (!back.startsWith('/') || back.startsWith('//')) back = '/';
    if (/^\d{4,8}$/.test(pin) && (await sha256(SALT + ':' + pin)) === PIN_HASH) {
      return new Response(null, { status: 303, headers: {
        Location: back,
        'Set-Cookie': `${COOKIE}=${await token()}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        'Cache-Control': 'no-store',
      } });
    }
    // A wrong PIN waits a second, which slows guessing.
    await new Promise((r) => setTimeout(r, 1000));
    return gate(back, true);
  }

  if (cookies[COOKIE] && cookies[COOKIE] === (await token())) return pass();
  return gate(url.pathname + url.search, false);
}

function gate(back, wrong) {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Yousef Kamel</title><meta name="theme-color" content="#0d1117">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100vh; display: grid; place-items: center; padding: 16px; background: #0d1117; color: #e6edf3; font-family: Inter, system-ui, sans-serif; }
  .term { width: 100%; max-width: 420px; border: 1px solid #30363d; border-radius: 10px; background: #161b22; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
  .bar { display: flex; align-items: center; gap: 7px; padding: 10px 14px; border-bottom: 1px solid #30363d; font: 12px 'JetBrains Mono', monospace; color: #8b949e; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #30363d; display: block; }
  .bar span { margin-left: 8px; }
  form { padding: 26px 24px 24px; }
  p { font: 13.5px/1.6 'JetBrains Mono', monospace; color: #8b949e; }
  p b { color: #7ee787; font-weight: 600; }
  label { display: block; margin-top: 18px; font: 600 13px 'JetBrains Mono', monospace; color: #e6edf3; }
  input { margin-top: 8px; width: 100%; padding: 12px 14px; font: 600 22px 'JetBrains Mono', monospace; letter-spacing: 10px; text-align: center;
    color: #e6edf3; background: #0d1117; border: 1px solid ${wrong ? '#f85149' : '#30363d'}; border-radius: 8px; outline: none; }
  input:focus { border-color: #58a6ff; box-shadow: 0 0 0 3px rgba(88,166,255,.2); }
  button { margin-top: 14px; width: 100%; padding: 11px; font: 600 14px 'JetBrains Mono', monospace; color: #0d1117; background: #58a6ff; border: 0; border-radius: 8px; cursor: pointer; }
  button:hover { background: #79b8ff; }
  .err { margin-top: 10px; font: 12.5px 'JetBrains Mono', monospace; color: #f85149; }
</style></head><body>
<main class="term"><div class="bar"><i></i><i></i><i></i><span>yousef@kamel:~/portfolio</span></div>
<form method="post" action="/__pin">
  <p><b>~</b> ./portfolio<br>This site is private. Enter the PIN to continue.</p>
  <label for="pin">PIN</label>
  <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" autofocus required>
  <input type="hidden" name="back" value="${esc(back)}">
  ${wrong ? '<p class="err">Wrong PIN. Try again.</p>' : ''}
  <button type="submit">unlock</button>
</form></main></body></html>`;
  return new Response(html, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
