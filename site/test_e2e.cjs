/* Desktop + phone shells, navigation, first entry, persistence across a reload, theme.
 * Run:  npm run build && node test_e2e.cjs */
const { serve, launch, check, failed, fakeGoogle, pick, errorsOf, signIn } = require('./test_helpers.cjs');

(async () => {
  const { srv, base } = await serve(8150);
  const b = await launch();
  for (const [label, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
    console.log('\n== ' + label + ' ==');
    const phone = label === 'phone';
    const ctx = await b.newContext({ viewport, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    await fakeGoogle(ctx);
    const pg = await ctx.newPage(); const errs = errorsOf(pg);
    await pg.goto(base, { waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=signin]');
    check('sign-in gate shown first, nothing of the app behind it', (await pg.$('[data-slot=sidebar-trigger]')) === null);
    check('no Google prompt on load', (await pg.evaluate(() => window.__gisCalls.length)) === 0);
    await signIn(pg);
    await pg.waitForSelector('[data-testid=today]');
    check('dashboard renders empty state after sign-in', /Ready to log your first hours/.test(await pg.textContent('[data-testid=today]')));
    if (!phone) check('header shows Saved to Drive', (await pg.textContent('[data-testid=drive-button]')).includes('Saved to Drive'));

    // navigation: sidebar is a drawer on phones and must close after navigating
    if (phone) {
      check('sidebar hidden on phone until opened', (await pg.$('[data-slot=sidebar][data-mobile=true]')) === null);
      await pg.click('[data-slot=sidebar-trigger]');
      await pg.waitForSelector('[data-slot=sidebar][data-mobile=true]');
      await pg.click('[data-slot=sidebar-menu-button]:has-text("Organizations")');
      await pg.waitForSelector('[data-slot=sidebar][data-mobile=true]', { state: 'detached' });
      check('drawer closes after navigation', true);
    } else {
      check('sidebar visible on desktop', (await pg.$('[data-slot=sidebar-container]')) !== null);
      await pg.click('[data-slot=sidebar-menu-button]:has-text("Organizations")');
    }
    await pg.waitForFunction(() => location.hash === '#/orgs');
    check('organizations route', true);

    // add an organization
    await pg.click('[data-testid=add-org]');
    await pg.waitForSelector('[data-testid=org-dialog]');
    await pg.fill('[data-testid=org-name]', 'Riverside Food Bank');
    await pg.fill('[data-testid=org-contact]', 'Maria Lopez');
    await pg.click('[data-testid=org-save]');
    await pg.waitForSelector('[data-testid=org-dialog]', { state: 'detached' });
    await pg.waitForSelector('[data-testid=org-card]');
    check('organization card rendered', (await pg.textContent('[data-testid=org-card]')).includes('Riverside Food Bank'));

    // log hours from the sidebar's primary button
    if (phone) { await pg.click('[data-slot=sidebar-trigger]'); await pg.waitForSelector('[data-slot=sidebar][data-mobile=true]'); }
    await pg.click('[data-testid=log-hours]');
    await pg.waitForSelector('[data-testid=entry-dialog]');
    check('date defaults to today', (await pg.inputValue('[data-testid=entry-date]')) === new Date().toISOString().slice(0, 10));
    check(phone ? 'touch device gets the native organization picker' : 'desktop gets the Radix organization picker', (await pg.$eval('[data-testid=entry-org]', (el) => el.tagName)) === (phone ? 'SELECT' : 'BUTTON'));
    await pg.fill('[data-testid=entry-hours]', '2.5');
    await pick(pg, '[data-testid=entry-org]', 'Riverside Food Bank');
    await pg.fill('[data-testid=entry-activity]', 'Sorted donations');
    await pg.click('[data-testid=entry-save]');
    await pg.waitForSelector('[data-testid=entry-dialog]', { state: 'detached' });
    check('toast confirms the entry', /Logged 2\.5 hours/.test(await pg.textContent('[data-testid=toast]')));

    // validation: zero hours is refused
    if (phone) { await pg.click('[data-slot=sidebar-trigger]'); await pg.waitForSelector('[data-slot=sidebar][data-mobile=true]'); }
    await pg.click('[data-testid=log-hours]');
    await pg.waitForSelector('[data-testid=entry-dialog]');
    await pg.fill('[data-testid=entry-hours]', '0');
    await pg.click('[data-testid=entry-save]');
    check('zero hours rejected with a message', /greater than zero/.test(await pg.textContent('[data-testid=form-error]')));
    await pg.keyboard.press('Escape');
    await pg.waitForSelector('[data-testid=entry-dialog]', { state: 'detached' });

    // dashboard totals + persistence across a reload (localStorage first)
    await pg.goto(base + '#/', { waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=stat-total]');
    check('total hours 2.5 on dashboard', /2\.5/.test(await pg.textContent('[data-testid=stat-total]')));
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.waitForSelector('[data-testid=stat-total]');
    check('reload opens the app directly, data intact', /2\.5/.test(await pg.textContent('[data-testid=stat-total]')) && (await pg.$('[data-testid=signin]')) === null);
    check('recent activity lists the entry', /Sorted donations/.test(await pg.textContent('[data-testid=recent]')));

    // breadcrumb: always a way out
    await pg.goto(base + '#/log', { waitUntil: 'networkidle' });
    const crumbs = await pg.$$eval('[data-slot=breadcrumb-item]', (n) => n.map((x) => x.textContent.trim()).filter(Boolean));
    check('breadcrumb Dashboard > Hours log', crumbs[0] === 'Dashboard' && crumbs.includes('Hours log'), crumbs.join(' > '));
    await pg.click('[data-slot=breadcrumb-link]:has-text("Dashboard")');
    await pg.waitForFunction(() => location.hash === '#/' || location.hash === '');
    check('breadcrumb navigates home', true);

    // theme
    await pg.click('[data-testid=theme-toggle]');
    check('dark theme applied', await pg.evaluate(() => document.documentElement.classList.contains('dark')));
    await pg.screenshot({ path: `shot-${label}-dark.png`, fullPage: phone });
    await pg.click('[data-testid=theme-toggle]');
    check('light theme restored', !(await pg.evaluate(() => document.documentElement.classList.contains('dark'))));
    await pg.screenshot({ path: `shot-${label}.png`, fullPage: phone });

    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(failed() ? `\n${failed()} check(s) failed` : '\nall e2e checks passed');
  process.exit(failed() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
