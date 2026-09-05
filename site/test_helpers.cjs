/* Shared by the three suites: a static server for dist/ under a GitHub Pages-style
 * subpath (/volunteer/), a Chromium launcher, and Google stubbed out — the sandbox
 * cannot reach accounts.google.com, and the OAuth popup cannot be automated anyway. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.join(__dirname, 'dist');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function serve(port) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (!p.startsWith('/volunteer')) { res.writeHead(404); return res.end(); }
    p = p.slice('/volunteer'.length) || '/'; if (p === '/') p = '/index.html';
    const f = path.join(DIST, p);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(port, () => r({ srv, base: `http://localhost:${port}/volunteer/` })));
}
const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
const launch = () => chromium.launch({ executablePath: exe });

let failures = 0;
function check(name, ok, extra) { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) failures++; }
const failed = () => failures;

/* Fake Google Identity Services: every requestAccessToken succeeds after 30 ms and records its prompt. */
const FAKE_GIS = `
  window.__gisCalls = JSON.parse(sessionStorage.getItem('gisCalls') || '[]');
  window.google = { accounts: { oauth2: {
    initTokenClient: (cfg) => ({ requestAccessToken: (o) => {
      window.__gisCalls.push(o.prompt); sessionStorage.setItem('gisCalls', JSON.stringify(window.__gisCalls));
      setTimeout(() => cfg.callback({ access_token: 'tok-' + Date.now(), expires_in: 3599, scope: 'https://www.googleapis.com/auth/drive.file openid email profile' }), 30);
    } }),
    hasGrantedAllScopes: (resp, scope) => resp.scope.includes(scope),
    revoke: (t, cb) => { window.__revoked = t; cb && cb(); }
  } } };`;

/* Fake Drive: one file found by appProperties, media download, multipart create, PATCH update. */
async function fakeGoogle(ctx) {
  const drive = { file: null, body: null, calls: [] };
  await ctx.route(/accounts\.google\.com|fonts\.g/, (r) => r.abort());
  await ctx.route(/googleapis\.com/, (r) => {
    const req = r.request(), u = req.url(), m = req.method();
    drive.calls.push(m + ' ' + u.replace(/\?.*/, ''));
    const auth = req.headers()['authorization'] || '';
    if (!auth.startsWith('Bearer tok-')) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"unauthorized"}}' });
    const json = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (/userinfo/.test(u)) return json({ name: 'Test Volunteer', email: 'qi@example.com', picture: '' });
    if (/drive\/v3\/files\?/.test(u) && m === 'GET') return json({ files: drive.file ? [{ id: drive.file, name: 'volunteer-tracker-data.json', modifiedTime: new Date().toISOString(), webViewLink: 'https://drive.google.com/file/d/' + drive.file + '/view' }] : [] });
    if (/drive\/v3\/files\/file1\?alt=media/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: drive.body });
    if (/upload\/drive\/v3\/files\?/.test(u) && m === 'POST') {
      drive.file = 'file1'; const parts = req.postData().split(/--vt_[a-z0-9]+/); drive.body = parts[2].split('\r\n\r\n')[1].trim();
      return json({ id: 'file1', webViewLink: 'https://drive.google.com/file/d/file1/view', modifiedTime: new Date().toISOString() });
    }
    if (/upload\/drive\/v3\/files\/file1/.test(u) && m === 'PATCH') { drive.body = req.postData(); return json({ id: 'file1', webViewLink: 'https://drive.google.com/file/d/file1/view', modifiedTime: new Date().toISOString() }); }
    return r.fulfill({ status: 404, body: '{}' });
  });
  await ctx.addInitScript(FAKE_GIS);
  return drive;
}

/* Radix Select: click the trigger, then the option by visible text. */
async function pick(pg, trigger, optionText) {
  await pg.click(trigger);
  await pg.waitForSelector('[role=option]');
  await pg.click(`[role=option]:has-text("${optionText}")`);
  await pg.waitForSelector('[role=option]', { state: 'detached' });
}
/* The gate: click Sign in with Google (stubbed) and wait for the app shell. */
async function signIn(pg) {
  await pg.waitForSelector('[data-testid=signin-button]:not([disabled])');
  await pg.click('[data-testid=signin-button]');
  await pg.waitForSelector('[data-slot=sidebar-trigger]', { timeout: 8000 });
}
const errorsOf = (pg) => { const errs = []; pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/gsi|accounts\.google|fonts\.g|favicon|net::ERR_FAILED|sw\.js/.test(m.text())) errs.push('CONSOLE ' + m.text()); }); return errs; };

module.exports = { serve, launch, check, failed, fakeGoogle, pick, errorsOf, signIn };
