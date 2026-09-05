/* Drive session behaviour with Google stubbed: sign in once, survive a reload without a
 * new prompt, push edits, merge a remote copy (tombstones win), reconnect after expiry. */
const { serve, launch, check, failed, fakeGoogle, pick, errorsOf } = require('./test_helpers.cjs');

(async () => {
  const { srv, base } = await serve(8151);
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const drive = await fakeGoogle(ctx);
  const pg = await ctx.newPage(); const errs = errorsOf(pg);
  const body = () => JSON.parse(drive.body);

  await pg.goto(base, { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=today]');
  check('fresh visit: Save to Drive offered, no popup on load', (await pg.textContent('[data-testid=drive-button]')).includes('Save to Drive') && (await pg.evaluate(() => window.__gisCalls.length)) === 0);

  // local data first, then connect
  await pg.goto(base + '#/orgs', { waitUntil: 'networkidle' });
  await pg.click('[data-testid=add-org]'); await pg.waitForSelector('[data-testid=org-dialog]');
  await pg.fill('[data-testid=org-name]', 'Local Org'); await pg.click('[data-testid=org-save]');
  await pg.waitForSelector('[data-testid=org-dialog]', { state: 'detached' });

  await pg.click('[data-testid=drive-button]');
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Saved to Drive")', { timeout: 8000 });
  check('first sign-in asks for consent once', JSON.stringify(await pg.evaluate(() => window.__gisCalls)) === '["consent"]');
  check('file created with the local organization', drive.file === 'file1' && body().organizations.some((o) => o.name === 'Local Org'));
  check('name shown in the sidebar footer', /Test Volunteer/.test(await pg.textContent('[data-testid=nav-user]')));

  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Saved to Drive")', { timeout: 8000 });
  check('reload: still connected with NO new Google prompt', (await pg.evaluate(() => window.__gisCalls.length)) === 1);

  // an edit is pushed within the debounce window
  const before = drive.calls.filter((c) => /PATCH/.test(c)).length;
  await pg.click('[data-testid=log-hours]'); await pg.waitForSelector('[data-testid=entry-dialog]');
  await pg.fill('[data-testid=entry-hours]', '3'); await pick(pg, '[data-testid=entry-org]', 'Local Org');
  await pg.fill('[data-testid=entry-activity]', 'Pushed entry'); await pg.click('[data-testid=entry-save]');
  await pg.waitForSelector('[data-testid=entry-dialog]', { state: 'detached' });
  await pg.waitForTimeout(2500);
  check('edit pushed to Drive (PATCH)', drive.calls.filter((c) => /PATCH/.test(c)).length > before && body().entries.some((e) => e.activity === 'Pushed entry'));
  check('header back to Saved to Drive', (await pg.textContent('[data-testid=drive-button]')).includes('Saved to Drive'));

  // merge: another device added an entry and deleted ours (tombstone newer than the record)
  const remote = body();
  const ours = remote.entries.find((e) => e.activity === 'Pushed entry');
  const later = new Date(Date.now() + 60000).toISOString();
  remote.entries = [{ id: 'remote1', date: '2026-01-15', orgId: remote.organizations[0].id, workItemId: '', activity: 'From the other device', category: '', hours: 1.5, supervisor: '', notes: '', createdAt: later, at: later }];
  remote.deleted = { [ours.id]: later };
  drive.body = JSON.stringify(remote);
  await pg.click('[data-testid=drive-button]');                // disconnect
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Save to Drive")');
  await pg.click('[data-testid=drive-button]');                // reconnect → pull + merge
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Saved to Drive")', { timeout: 8000 });
  await pg.goto(base + '#/log', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=log-summary]');
  const log = await pg.textContent('[data-testid=log-table]').catch(() => '');
  check('remote-only entry arrived after merge', /From the other device/.test(log));
  check('entry deleted elsewhere is gone here (tombstone wins)', !/Pushed entry/.test(log));
  check('merged result written back to Drive', body().entries.length === 1 && body().entries[0].id === 'remote1' && body().deleted[ours.id] === later);

  // expiry: token past its hour → "Reconnect", no prompt on load, one silent prompt on click
  await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('volunteer.drive')); s.token.expires_at = Date.now() - 1000; localStorage.setItem('volunteer.drive', JSON.stringify(s)); });
  const calls = await pg.evaluate(() => window.__gisCalls.length);
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Reconnect Drive")', { timeout: 8000 });
  check('expired session shows Reconnect without prompting', (await pg.evaluate(() => window.__gisCalls.length)) === calls);
  await pg.click('[data-testid=drive-button]');
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Saved to Drive")', { timeout: 8000 });
  const gis = await pg.evaluate(() => window.__gisCalls);
  check('reconnect used a silent prompt (no consent)', gis[gis.length - 1] === '', JSON.stringify(gis));

  // disconnect revokes and clears
  await pg.click('[data-testid=drive-button]');
  await pg.waitForSelector('[data-testid=drive-button]:has-text("Save to Drive")');
  check('disconnect revoked the token and cleared the session', (await pg.evaluate(() => !!window.__revoked && localStorage.getItem('volunteer.drive') === null)));
  check('local data survives a disconnect', /From the other device/.test(await pg.textContent('body')));

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); srv.close();
  console.log(failed() ? `\n${failed()} check(s) failed` : '\nall drive checks passed');
  process.exit(failed() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
