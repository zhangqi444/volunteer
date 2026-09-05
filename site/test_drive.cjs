/* Drive session behaviour with Google stubbed: the gate, sign in once, survive a reload
 * without a new prompt, push edits, merge a remote copy after a silent reconnect
 * (tombstones win), sign out clears the device, sign in brings the file back. */
const { serve, launch, check, failed, fakeGoogle, pick, errorsOf, signIn } = require('./test_helpers.cjs');

(async () => {
  const { srv, base } = await serve(8151);
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const drive = await fakeGoogle(ctx);
  const pg = await ctx.newPage(); const errs = errorsOf(pg);
  const body = () => JSON.parse(drive.body);
  const gis = () => pg.evaluate(() => window.__gisCalls);

  await pg.goto(base, { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=signin-button]:not([disabled])');
  check('fresh visit: gate shown, no popup on load', (await pg.$('[data-slot=sidebar-trigger]')) === null && (await gis()).length === 0);

  await signIn(pg);
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Saved to Drive")', { timeout: 8000 });
  check('first sign-in asks for consent once', JSON.stringify(await gis()) === '["consent"]');
  check('file created in Drive with an empty dataset', drive.file === 'file1' && Array.isArray(body().entries) && body().entries.length === 0);
  check('payload is schema 3 with plans and interests', body().schema === 3 && Array.isArray(body().plans) && typeof body().interests === 'object' && !('theme' in body()) && !('owner' in body()));
  check('name shown in the sidebar footer', /Test Volunteer/.test(await pg.textContent('[data-testid=nav-user]')));

  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Saved to Drive")', { timeout: 8000 });
  check('reload: straight into the app, NO new Google prompt', (await gis()).length === 1 && (await pg.$('[data-testid=signin]')) === null);

  // edits are pushed within the debounce window
  await pg.goto(base + '#/orgs', { waitUntil: 'networkidle' });
  await pg.click('[data-testid=add-org]'); await pg.waitForSelector('[data-testid=org-dialog]');
  await pg.fill('[data-testid=org-name]', 'Local Org'); await pg.click('[data-testid=org-save]');
  await pg.waitForSelector('[data-testid=org-dialog]', { state: 'detached' });
  await pg.click('[data-testid=log-hours]'); await pg.waitForSelector('[data-testid=entry-dialog]');
  await pg.fill('[data-testid=entry-hours]', '3'); await pick(pg, '[data-testid=entry-org]', 'Local Org');
  await pg.fill('[data-testid=entry-activity]', 'Pushed entry'); await pg.click('[data-testid=entry-save]');
  await pg.waitForSelector('[data-testid=entry-dialog]', { state: 'detached' });
  await pg.waitForFunction(() => document.querySelector('[data-testid=drive-button]').textContent.includes('Saved to Drive'), null, { timeout: 8000 });
  await pg.waitForTimeout(1500);
  check('edits pushed to Drive (PATCH)', drive.calls.some((c) => /PATCH/.test(c)) && body().entries.some((e) => e.activity === 'Pushed entry') && body().organizations.some((o) => o.name === 'Local Org'));

  // another device added an entry and deleted ours; our token has meanwhile expired
  const remote = body();
  const ours = remote.entries.find((e) => e.activity === 'Pushed entry');
  const later = new Date(Date.now() + 60000).toISOString();
  remote.entries = [{ id: 'remote1', date: '2026-01-15', orgId: remote.organizations[0].id, workItemId: '', activity: 'From the other device', category: '', hours: 1.5, supervisor: '', notes: '', createdAt: later, at: later }];
  remote.deleted = { [ours.id]: later };
  drive.body = JSON.stringify(remote);
  await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('volunteer.drive')); s.token.expires_at = Date.now() - 1000; localStorage.setItem('volunteer.drive', JSON.stringify(s)); });
  const calls = (await gis()).length;
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Reconnect Drive")', { timeout: 8000 });
  check('expired token: app still opens (no gate), Reconnect offered, no prompt', (await gis()).length === calls && (await pg.$('[data-testid=signin]')) === null);
  check('local data readable while expired', /Local Org/.test(await pg.textContent('body')));
  await pg.click('[data-testid=drive-button]');
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Saved to Drive")', { timeout: 8000 });
  const g = await gis();
  check('reconnect used a silent prompt (no consent)', g[g.length - 1] === '', JSON.stringify(g));
  await pg.goto(base + '#/log', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=log-summary]');
  const log = await pg.textContent('[data-testid=log-table]').catch(() => '');
  check('remote-only entry arrived after merge', /From the other device/.test(log));
  check('entry deleted elsewhere is gone here (tombstone wins)', !/Pushed entry/.test(log));
  check('merged result written back to Drive', body().entries.length === 1 && body().entries[0].id === 'remote1' && body().deleted[ours.id] === later);

  // sign out: token revoked, this device cleared, back to the gate; the file keeps everything
  await pg.click('[data-testid=drive-button]');
  await pg.waitForSelector('[data-testid=signin]');
  check('sign out returns to the gate', true);
  check('sign out revoked the token and cleared the session', await pg.evaluate(() => !!window.__revoked && localStorage.getItem('volunteer.drive') === null));
  check('sign out cleared the local dataset', await pg.evaluate(() => JSON.parse(localStorage.getItem('volunteer.v2')).entries.length === 0));
  check('the Drive file still has the data', body().entries.length === 1);

  await signIn(pg);
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Saved to Drive")', { timeout: 8000 });
  await pg.goto(base + '#/log', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=log-summary]');
  check('signing in again restores the data from Drive', /From the other device/.test(await pg.textContent('body')));

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); srv.close();
  console.log(failed() ? `\n${failed()} check(s) failed` : '\nall drive checks passed');
  process.exit(failed() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
