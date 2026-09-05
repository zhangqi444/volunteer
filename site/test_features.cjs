/* Work items and memos, the hours log filters, reports, settings, sample data, dashboard charts. */
const { serve, launch, check, failed, fakeGoogle, pick, errorsOf, signIn } = require('./test_helpers.cjs');

(async () => {
  const { srv, base } = await serve(8152);
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await fakeGoogle(ctx);
  const pg = await ctx.newPage(); const errs = errorsOf(pg);

  await pg.goto(base, { waitUntil: 'networkidle' });
  await signIn(pg);
  // sample data from settings
  await pg.goto(base + '#/settings', { waitUntil: 'networkidle' });
  await pg.click('[data-testid=data-sample]');
  await pg.waitForSelector('[data-testid=toast]:has-text("Sample data loaded")');
  await pg.goto(base + '#/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=stat-total]');
  check('sample totals on dashboard', /46\.5/.test(await pg.textContent('[data-testid=stat-total]')));
  check('month chart drawn', (await pg.$$('[data-testid=month-chart] .recharts-bar-rectangle')).length > 0);
  check('org bars: 3 organizations', (await pg.$$('[data-testid=org-bars] li')).length === 3);
  check('active work items listed', (await pg.$$('[data-testid=dash-workitems] li')).length === 3);
  await pg.screenshot({ path: 'shot-dashboard-sample.png', fullPage: true });

  // work items list + filters
  await pg.click('[data-slot=sidebar-menu-button]:has-text("Work items")');
  await pg.waitForSelector('[data-testid=wi-grid]');
  check('active filter shows 3 cards', (await pg.$$('[data-testid=wi-card]')).length === 3);
  await pick(pg, '[data-testid=wi-filter-status]', 'All statuses');
  check('all statuses shows 4 cards', (await pg.$$('[data-testid=wi-card]')).length === 4);
  await pg.fill('[data-testid=wi-search]', 'reading');
  check('search narrows to 1 card', (await pg.$$('[data-testid=wi-card]')).length === 1);
  await pg.fill('[data-testid=wi-search]', '');

  // create a work item from the list, land on its detail
  await pg.click('[data-testid=add-workitem]');
  await pg.waitForSelector('[data-testid=wi-dialog]');
  await pg.fill('[data-testid=wi-title]', 'Weekend tutoring');
  await pick(pg, '[data-testid=wi-org]', 'Public Library Literacy Program');
  await pg.fill('[data-testid=wi-target]', '10');
  await pg.click('[data-testid=wi-save]');
  await pg.waitForSelector('[data-testid=wi-detail]');
  check('new item opens its detail page', /Weekend tutoring/.test(await pg.textContent('[data-testid=wi-detail]')));
  const id = (await pg.evaluate(() => location.hash)).split('/')[2];
  check('route is #/work/<id>', /^#\/work\/[a-z0-9]+$/.test(await pg.evaluate(() => location.hash)));
  const crumbs = await pg.$$eval('[data-slot=breadcrumb-item]', (n) => n.map((x) => x.textContent.trim()).filter(Boolean));
  check('breadcrumb ends with the item title', crumbs.includes('Work items') && crumbs[crumbs.length - 1] === 'Weekend tutoring', crumbs.join(' > '));

  // log hours from the item: org and item preselected
  await pg.click('[data-testid=wi-log]');
  await pg.waitForSelector('[data-testid=entry-dialog]');
  check('entry org preselected', /Public Library/.test(await pg.textContent('[data-testid=entry-org]')));
  check('entry work item preselected', /Weekend tutoring/.test(await pg.textContent('[data-testid=entry-workitem]')));
  await pg.fill('[data-testid=entry-hours]', '4');
  await pg.fill('[data-testid=entry-activity]', 'Fractions practice');
  await pg.click('[data-testid=entry-save]');
  await pg.waitForSelector('[data-testid=entry-dialog]', { state: 'detached' });
  await pg.waitForSelector('[data-testid=wi-tracker]');
  check('tracker lists the entry and 40% of target', /Fractions practice/.test(await pg.textContent('[data-testid=wi-tracker]')) && /40% of 10 h/.test(await pg.textContent('[data-testid=wi-hours]')));

  // memos: add, Ctrl+Enter, edit
  await pg.fill('[data-testid=memo-input]', 'Room 204, ask for Dev.');
  await pg.click('[data-testid=memo-add]');
  await pg.waitForSelector('[data-testid=memo]');
  check('memo added and compose cleared', /Room 204/.test(await pg.textContent('[data-testid=memo-text]')) && (await pg.inputValue('[data-testid=memo-input]')) === '');
  await pg.fill('[data-testid=memo-input]', 'Second memo via shortcut');
  await pg.press('[data-testid=memo-input]', 'Control+Enter');
  await pg.waitForFunction(() => document.querySelectorAll('[data-testid=memo]').length === 2);
  check('Ctrl+Enter saves a memo', true);
  await pg.click('[data-testid=memo] [data-testid=memo-edit]');
  await pg.waitForSelector('[data-testid=memo-dialog]');
  await pg.fill('[data-testid=memo-edit-text]', 'Edited memo');
  await pg.click('[data-testid=memo-save]');
  await pg.waitForSelector('[data-testid=memo-dialog]', { state: 'detached' });
  await pg.waitForFunction(() => /Edited memo/.test(document.querySelector('[data-testid=memo-text]').textContent));
  check('memo edited in place', true);

  // status change from the detail page
  await pick(pg, '[data-testid=wi-status-pick]', 'Paused');
  await pg.waitForSelector('[data-testid=wi-detail] [data-testid=status]:has-text("paused")');
  check('status changed to paused', true);
  await pg.screenshot({ path: 'shot-workitem.png', fullPage: true });

  // hours log: tag, work item filter, search, clear, CSV enabled
  await pg.click('[data-slot=sidebar-menu-button]:has-text("Hours log")');
  await pg.waitForSelector('[data-testid=log-table]');
  check('log shows the work item tag', (await pg.$$eval('[data-testid=log-wi-tag]', (n) => n.map((x) => x.textContent))).includes('Weekend tutoring'));
  const all = (await pg.$$('[data-testid=log-row]')).length;
  await pick(pg, '[data-testid=filter-workitem]', 'Weekend tutoring');
  check('work item filter narrows to 1 row', (await pg.$$('[data-testid=log-row]')).length === 1);
  await pg.click('[data-testid=filter-clear]');
  await pg.fill('[data-testid=filter-search]', 'pantry');
  check('search matches the 2 mobile pantry rows', (await pg.$$('[data-testid=log-row]')).length === 2, String((await pg.$$('[data-testid=log-row]')).length));
  await pg.click('[data-testid=filter-clear]');
  check('clear restores all rows', (await pg.$$('[data-testid=log-row]')).length === all && all === 16, String(all));
  check('CSV export enabled', !(await pg.isDisabled('[data-testid=log-csv]')));
  await pg.click('[data-sort=hours]');
  const first = await pg.$eval('[data-testid=log-row] td:nth-child(5)', (x) => x.textContent.trim());
  check('sort by hours ascending puts 1.5 first', first === '1.5', first);

  // reports
  await pg.click('[data-slot=sidebar-menu-button]:has-text("Reports")');
  await pg.waitForSelector('[data-testid=report]');
  await pick(pg, '[data-testid=report-preset]', 'All time');
  const rep = await pg.textContent('[data-testid=report]');
  check('report has the three sections', /Hours by organization/.test(rep) && /Hours by work item/.test(rep) && /Detailed log/.test(rep));
  check('report total is 50.5 h', /50\.5/.test(rep));
  await pick(pg, '[data-testid=report-org]', 'Friends of Cedar Park');
  check('org filter narrows the report', /11\.5/.test(await pg.textContent('[data-testid=report]')) && !/Riverside/.test(await pg.textContent('[data-testid=report] table')));
  await pg.screenshot({ path: 'shot-report.png', fullPage: true });

  // catalog: fit badges against Sheila's age (9, from the sample profile), filters, interest, plan it
  await pg.goto(base + '#/catalog', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=catalog-grid]');
  check('catalog header names the volunteer and age', /Sheila's age \(9\)/.test(await pg.textContent('h1 + p')));
  check('7 opportunities fit now (incl. with an adult / age not stated)', (await pg.$$('[data-testid=catalog-item]')).length === 7, String((await pg.$$('[data-testid=catalog-item]')).length));
  check('no age-gated item shown under Fits now', (await pg.$$('[data-testid=catalog-item] [data-fit=later]')).length === 0);
  await pick(pg, '[data-testid=catalog-fit]', 'Later (age-gated)');
  check('nothing is listed under Later: the catalog holds only what fits now', (await pg.$$('[data-testid=catalog-item]')).length === 0 && /Nothing matches/.test(await pg.textContent('body')));
  await pick(pg, '[data-testid=catalog-fit]', 'Everything');
  check('7 items in the whole catalog', (await pg.$$('[data-testid=catalog-item]')).length === 7);
  await pg.fill('[data-testid=catalog-search]', 'blanket');
  check('search finds the cat blankets project', (await pg.$$('[data-testid=catalog-item]')).length >= 1 && /No-sew cat blankets/.test(await pg.textContent('[data-testid=catalog-grid]')));
  await pg.click('[data-id=sh-cat-blankets] [data-testid=catalog-more]');
  check('details show the source and check date', /seattlehumane\.org/.test(await pg.textContent('[data-id=sh-cat-blankets]')) && /checked 2026-09-05/.test(await pg.textContent('[data-id=sh-cat-blankets]')));
  await pick(pg, '[data-id=sh-cat-blankets] [data-testid=catalog-interest]', 'Interested');
  await pg.waitForSelector('[data-testid=toast]:has-text("Marked interested")');
  check('interest saved to the dataset', await pg.evaluate(() => JSON.parse(localStorage.getItem('volunteer.v2')).interests['sh-cat-blankets'].status === 'interested'));
  await pg.fill('[data-testid=catalog-search]', '');
  await pick(pg, '[data-testid=catalog-fit]', 'Marked by me');
  check('Marked by me filter shows the one marked item', (await pg.$$('[data-testid=catalog-item]')).length === 1);
  await pg.click('[data-id=sh-cat-blankets] [data-testid=catalog-plan]');
  await pg.waitForSelector('[data-testid=plan-dialog]');
  check('Plan it prefills the title', (await pg.inputValue('[data-testid=plan-title]')) === 'No-sew cat blankets');
  const today = new Date(), iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  await pg.fill('[data-testid=plan-date]', iso(today));
  await pg.fill('[data-testid=plan-hours]', '2');
  await pg.click('[data-testid=plan-save]');
  await pg.waitForSelector('[data-testid=plan-dialog]', { state: 'detached' });

  // calendar: today's plan on the grid, log hours from it, overdue handling, up-next on the dashboard
  await pg.goto(base + '#/calendar', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=cal-grid]');
  check('plan appears on today in the grid', /No-sew cat blankets/.test(await pg.textContent(`[data-date="${iso(today)}"]`)));
  check('selected day lists the plan', (await pg.$$('[data-testid=day-plans] [data-testid=plan-row]')).length === 1);
  await pg.click('[data-testid=add-plan]'); await pg.waitForSelector('[data-testid=plan-dialog]');
  const past = new Date(today.getTime() - 3 * 86400000);
  await pg.fill('[data-testid=plan-title]', 'Missed shift'); await pg.fill('[data-testid=plan-date]', iso(past)); await pg.click('[data-testid=plan-save]');
  await pg.waitForSelector('[data-testid=plan-dialog]', { state: 'detached' });
  await pg.waitForSelector('[data-testid=overdue-plans]');
  check('a past unlogged plan shows under Past plans to log', /Missed shift/.test(await pg.textContent('[data-testid=overdue-plans]')));
  await pg.click('[data-testid=overdue-plans] [data-testid=plan-skip]');
  await pg.waitForSelector('[data-testid=overdue-plans]', { state: 'detached' });
  check('marking skipped clears it from the overdue list', true);
  await pg.click('[data-testid=day-plans] [data-testid=plan-log]');
  await pg.waitForSelector('[data-testid=entry-dialog]');
  check('Log hours prefills activity and hours from the plan', (await pg.inputValue('[data-testid=entry-activity]')) === 'No-sew cat blankets' && (await pg.inputValue('[data-testid=entry-hours]')) === '2');
  await pick(pg, '[data-testid=entry-org]', 'Riverside Food Bank');
  await pg.click('[data-testid=entry-save]');
  await pg.waitForSelector('[data-testid=entry-dialog]', { state: 'detached' });
  await pg.waitForSelector('[data-testid=day-plans] [data-testid=plan-row][data-status=done]');
  check('plan marked done after logging', true);
  check('the logged entry links back to the plan', await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('volunteer.v2')); const p = s.plans.find((x) => x.title === 'No-sew cat blankets'); return !!p.entryId && s.entries.some((e) => e.id === p.entryId && e.hours === 2); }));
  await pg.click('[data-testid=add-plan]'); await pg.waitForSelector('[data-testid=plan-dialog]');
  const future = new Date(today.getTime() + 5 * 86400000);
  await pg.fill('[data-testid=plan-title]', 'Trail work party'); await pg.fill('[data-testid=plan-date]', iso(future)); await pg.fill('[data-testid=plan-hours]', '4'); await pg.click('[data-testid=plan-save]');
  await pg.waitForSelector('[data-testid=plan-dialog]', { state: 'detached' });
  await pg.screenshot({ path: 'shot-calendar.png', fullPage: true });
  await pg.goto(base + '#/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=up-next]');
  check('dashboard Up next lists the future plan', /Trail work party/.test(await pg.textContent('[data-testid=up-next]')));
  check('greeting uses the profile name', /Good (morning|afternoon|evening), Sheila/.test(await pg.textContent('[data-testid=today]')));

  // profile: the age drives the header and the fit badges
  await pg.goto(base + '#/settings', { waitUntil: 'networkidle' });
  await pg.fill('[data-testid=profile-age]', '13'); await pg.press('[data-testid=profile-age]', 'Tab');
  await pg.waitForSelector('[data-testid=toast]:has-text("Profile saved")');
  await pg.goto(base + '#/catalog', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=catalog-grid]');
  check('at 13 the header follows the profile and the same 7 items fit', /age \(13\)/.test(await pg.textContent('h1 + p')) && (await pg.$$('[data-testid=catalog-item]')).length === 7);
  await pg.goto(base + '#/settings', { waitUntil: 'networkidle' });
  await pg.fill('[data-testid=profile-age]', '9'); await pg.press('[data-testid=profile-age]', 'Tab');
  await pg.goto(base + '#/catalog', { waitUntil: 'networkidle' }); await pg.waitForSelector('[data-testid=catalog-grid]'); await pg.screenshot({ path: 'shot-catalog.png', fullPage: true }); await pg.goto(base + '#/settings', { waitUntil: 'networkidle' }); await pg.waitForSelector('[data-testid=setting-goal]');

  // settings: goal + categories + theme radio + delete all
  await pg.click('[data-slot=sidebar-menu-button]:has-text("Settings")');
  await pg.waitForSelector('[data-testid=setting-goal]');
  await pg.fill('[data-testid=setting-goal]', '100'); await pg.press('[data-testid=setting-goal]', 'Tab');
  await pg.waitForSelector('[data-testid=toast]:has-text("Goal updated")');
  await pg.fill('[data-testid=setting-categories]', 'Alpha\nBeta');
  await pg.click('button:has-text("Save categories")');
  await pg.click('#theme-dark');
  check('theme radio switches to dark', await pg.evaluate(() => document.documentElement.classList.contains('dark')));
  await pg.click('#theme-system');
  await pg.goto(base + '#/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=today]');
  check('goal change reflected on dashboard', /of 100 h/.test(await pg.textContent('[data-testid=today]')));
  await pg.click('[data-testid=log-hours]'); await pg.waitForSelector('[data-testid=entry-dialog]');
  await pg.click('[data-testid=entry-category]'); await pg.waitForSelector('[role=option]');
  check('custom categories offered when logging', (await pg.$$eval('[role=option]', (n) => n.map((x) => x.textContent))).join(',') === 'None,Alpha,Beta');
  await pg.keyboard.press('Escape'); await pg.waitForSelector('[role=option]', { state: 'detached' });
  await pg.click('[data-testid=entry-dialog] button:has-text("Cancel")');
  await pg.waitForSelector('[data-testid=entry-dialog]', { state: 'detached' });

  await pg.goto(base + '#/settings', { waitUntil: 'networkidle' });
  await pg.click('[data-testid=data-clear]');
  await pg.waitForSelector('[data-testid=confirm-dialog]');
  await pg.click('[data-testid=confirm-ok]');
  await pg.waitForSelector('[data-testid=toast]:has-text("All data deleted")');
  await pg.goto(base + '#/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-testid=today]');
  check('delete all returns to the empty state', /Ready to log your first hours/.test(await pg.textContent('[data-testid=today]')));

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); srv.close();
  console.log(failed() ? `\n${failed()} check(s) failed` : '\nall feature checks passed');
  process.exit(failed() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
