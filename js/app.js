/* ==========================================================================
   Volunteer Tracker — UI
   ========================================================================== */
(function () {
  "use strict";

  const { DataStore, cache, normalize, emptyData, sampleData, toCSV, downloadFile, todayISO, toISODate, isISODate, ORG_COLORS } = window.Store;
  const CLIENT_ID_KEY = "vt:clientId";
  const THEME_KEY = "vt:theme";

  const store = new DataStore();
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- formatting ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtHours = (n) => { const v = Math.round(n * 100) / 100; return Number.isInteger(v) ? String(v) : v.toFixed(v * 10 % 1 === 0 ? 1 : 2); };
  const hoursWord = (n) => `${fmtHours(n)} ${n === 1 ? "hour" : "hours"}`;
  const parseISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (iso, opts = { month: "short", day: "numeric", year: "numeric" }) => isISODate(iso) ? parseISO(iso).toLocaleDateString(undefined, opts) : iso;
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

  /* ---------- theme ---------- */
  function applyTheme(theme) {
    const t = theme || localStorage.getItem(THEME_KEY) || "system";
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    const sel = $("#setting-theme"); if (sel) sel.value = t;
  }

  /* ---------- toast / confirm ---------- */
  let toastTimer;
  function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("is-error", isError);
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), isError ? 5000 : 2600);
  }
  function confirmDialog({ title = "Are you sure?", message = "", okLabel = "Delete" } = {}) {
    const dlg = $("#confirm-dialog");
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    $("#confirm-ok").textContent = okLabel;
    dlg.returnValue = "cancel";
    dlg.showModal();
    return new Promise((resolve) => dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true }));
  }

  /* ---------- navigation ---------- */
  const VIEWS = ["dashboard", "log", "organizations", "reports", "settings"];
  function showView(name, { push = true } = {}) {
    if (!VIEWS.includes(name)) name = "dashboard";
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${name}`));
    $$(".nav-item").forEach((b) => {
      const active = b.dataset.view === name;
      b.classList.toggle("is-active", active);
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (push && location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
    if (name === "reports" && !$("#report-output").innerHTML) generateReport();
    $("#main").scrollTop = 0;
  }

  /* ---------- rendering ---------- */
  function orgChip(orgId) {
    const o = store.orgById(orgId);
    const color = o ? o.color : "#64748b";
    return `<span class="org-chip"><span class="dot" style="background:${esc(color)}"></span>${esc(store.orgName(orgId))}</span>`;
  }
  function fillOrgSelect(sel, { allLabel = null, selected = "" } = {}) {
    const opts = store.orgsSorted().map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("");
    sel.innerHTML = (allLabel !== null ? `<option value="">${esc(allLabel)}</option>` : `<option value="" disabled>Select an organization</option>`) + opts;
    sel.value = selected;
    if (sel.value !== selected) sel.value = "";
  }
  function fillCategorySelect(sel, { allLabel = null, selected = "" } = {}) {
    const cats = store.categories();
    sel.innerHTML = (allLabel !== null ? `<option value="">${esc(allLabel)}</option>` : `<option value="">None</option>`) +
      cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    sel.value = cats.includes(selected) ? selected : "";
  }

  function renderDashboard() {
    const s = store.stats();
    const now = new Date();
    const hour = now.getHours();
    const name = (window.GoogleSync.getProfile() || {}).name || "";
    const first = name.split(" ")[0];
    $("#dashboard-greeting").textContent = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${first ? `, ${first}` : ""}. ${s.count ? `You've given ${hoursWord(s.total)} so far.` : "Ready to log your first hours?"}`;

    $("#stat-total").textContent = fmtHours(s.total);
    $("#stat-total-sub").textContent = `across ${s.count} ${s.count === 1 ? "entry" : "entries"}`;
    $("#stat-month").textContent = fmtHours(s.month);
    const diff = s.month - s.prevMonth;
    $("#stat-month-sub").textContent = s.prevMonth || s.month
      ? `${diff >= 0 ? "+" : "−"}${fmtHours(Math.abs(diff))} vs last month`
      : now.toLocaleDateString(undefined, { month: "long" });
    $("#stat-year").textContent = fmtHours(s.year);
    $("#stat-year-sub").textContent = `${s.yearCount} ${s.yearCount === 1 ? "entry" : "entries"} in ${now.getFullYear()}`;
    $("#stat-orgs").textContent = String(s.orgs);
    $("#stat-orgs-sub").textContent = `${s.activeOrgs} active this year`;

    const goal = store.data.goals.yearly;
    const pct = goal > 0 ? Math.min(100, (s.year / goal) * 100) : 0;
    const bar = $("#goal-bar");
    bar.style.width = `${pct}%`;
    bar.classList.toggle("is-complete", goal > 0 && s.year >= goal);
    $("#goal-progress").setAttribute("aria-valuenow", String(Math.round(pct)));
    $("#goal-text").textContent = goal > 0
      ? (s.year >= goal ? `Goal reached! ${fmtHours(s.year)} / ${fmtHours(goal)} h` : `${fmtHours(s.year)} / ${fmtHours(goal)} h · ${fmtHours(goal - s.year)} to go`)
      : "No goal set";

    renderMonthChart();
    renderOrgBars();
    renderRecent();
  }

  function renderMonthChart() {
    const months = store.hoursByMonth(12);
    const el = $("#chart-months");
    const max = Math.max(...months.map((m) => m.hours));
    if (!max) { el.innerHTML = `<div class="chart-empty">No hours logged in the last 12 months.</div>`; return; }
    const W = 460, H = 220, padL = 6, padR = 6, padT = 26, padB = 30;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const slot = innerW / months.length, barW = Math.min(36, slot * 0.62);
    const bars = months.map((m, i) => {
      const h = m.hours ? Math.max(3, (m.hours / max) * innerH) : 0;
      const x = padL + i * slot + (slot - barW) / 2;
      const y = padT + innerH - h;
      const title = `${m.label} ${m.year}: ${hoursWord(m.hours)} in ${m.count} ${m.count === 1 ? "entry" : "entries"}`;
      return `<g><title>${esc(title)}</title>
        <rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4"></rect>
        ${m.hours ? `<text class="bar-value" x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${fmtHours(m.hours)}</text>` : ""}
        <text class="bar-label" x="${(x + barW / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle">${esc(m.label)}</text></g>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart of volunteer hours per month for the last 12 months">
      <line class="axis" x1="${padL}" x2="${W - padR}" y1="${padT + innerH}" y2="${padT + innerH}"></line>${bars}</svg>`;
  }

  function renderOrgBars() {
    const rows = store.hoursByOrg();
    const el = $("#chart-orgs");
    if (!rows.length) { el.innerHTML = `<div class="chart-empty">Log hours to see how your time is split.</div>`; return; }
    const max = rows[0].hours;
    el.innerHTML = `<div class="hbars">${rows.slice(0, 8).map((r) => `
      <div class="hbar">
        <div class="hbar-name" title="${esc(r.name)}"><span class="dot" style="background:${esc(r.org ? r.org.color : "#64748b")}"></span>${esc(r.name)}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(r.hours / max) * 100}%;background:${esc(r.org ? r.org.color : "#64748b")}"></div></div>
        <div class="hbar-value">${fmtHours(r.hours)} h</div>
      </div>`).join("")}</div>`;
  }

  function renderRecent() {
    const recent = store.entriesSorted().slice(0, 6);
    const el = $("#recent-entries");
    if (!recent.length) { el.innerHTML = `<div class="empty"><p>Nothing logged yet.</p></div>`; return; }
    el.innerHTML = `<div class="table-wrap"><table class="table"><tbody>${recent.map((e) => `
      <tr>
        <td style="white-space:nowrap">${esc(fmtDate(e.date))}</td>
        <td>${orgChip(e.orgId)}</td>
        <td>${esc(e.activity)}</td>
        <td class="num">${fmtHours(e.hours)} h</td>
        <td class="actions"><button class="btn btn-ghost btn-sm" data-edit-entry="${esc(e.id)}" type="button">Edit</button></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  /* --- log --- */
  const logState = { sort: "date", dir: "desc" };
  function currentFilters() {
    return {
      search: $("#filter-search").value,
      orgId: $("#filter-org").value,
      category: $("#filter-category").value,
      from: $("#filter-from").value,
      to: $("#filter-to").value,
    };
  }
  function renderLog() {
    fillOrgSelect($("#filter-org"), { allLabel: "All organizations", selected: $("#filter-org").value });
    fillCategorySelect($("#filter-category"), { allLabel: "All categories", selected: $("#filter-category").value });
    const entries = store.filterEntries(store.entriesSorted(logState.sort, logState.dir), currentFilters());
    const total = store.sumHours(entries);
    $("#log-summary").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"} · ${hoursWord(total)}`;
    $$("#log-table .sort").forEach((b) => b.dataset.dir = b.dataset.sort === logState.sort ? logState.dir : "");
    $("#log-empty").hidden = entries.length > 0;
    $("#log-table").hidden = entries.length === 0;
    $("#log-body").innerHTML = entries.map((e) => `
      <tr>
        <td style="white-space:nowrap">${esc(fmtDate(e.date))}</td>
        <td>${orgChip(e.orgId)}</td>
        <td>${esc(e.activity)}${e.notes || e.supervisor ? `<div class="activity-notes">${esc([e.supervisor && `with ${e.supervisor}`, e.notes].filter(Boolean).join(" · "))}</div>` : ""}</td>
        <td>${e.category ? `<span class="tag">${esc(e.category)}</span>` : ""}</td>
        <td class="num">${fmtHours(e.hours)}</td>
        <td class="actions">
          <button class="btn btn-ghost btn-sm" data-edit-entry="${esc(e.id)}" type="button">Edit</button>
          <button class="btn btn-ghost btn-sm btn-danger" data-delete-entry="${esc(e.id)}" type="button" aria-label="Delete entry">Delete</button>
        </td>
      </tr>`).join("");
  }

  /* --- organizations --- */
  function renderOrgs() {
    const orgs = store.orgsSorted();
    const byOrg = new Map(store.hoursByOrg().map((r) => [r.orgId, r]));
    $("#org-empty").hidden = orgs.length > 0;
    $("#org-grid").innerHTML = orgs.map((o) => {
      const r = byOrg.get(o.id) || { hours: 0, count: 0 };
      const last = store.entriesSorted().find((e) => e.orgId === o.id);
      return `<article class="org-card" style="border-top-color:${esc(o.color)}">
        <h3>${esc(o.name)}</h3>
        <div class="org-meta">
          ${o.contact ? `<span>Contact: ${esc(o.contact)}${o.contactInfo ? ` · ${esc(o.contactInfo)}` : ""}</span>` : (o.contactInfo ? `<span>${esc(o.contactInfo)}</span>` : "")}
          ${o.website ? `<a href="${esc(o.website)}" target="_blank" rel="noopener">${esc(o.website.replace(/^https?:\/\//, ""))}</a>` : ""}
          ${last ? `<span>Last volunteered ${esc(fmtDate(last.date))}</span>` : `<span>No hours logged yet</span>`}
        </div>
        ${o.notes ? `<p class="muted small">${esc(o.notes)}</p>` : ""}
        <div class="org-stats">
          <div class="org-stat"><b>${fmtHours(r.hours)}</b><span>hours</span></div>
          <div class="org-stat"><b>${r.count}</b><span>${r.count === 1 ? "entry" : "entries"}</span></div>
        </div>
        <div class="org-actions">
          <button class="btn btn-secondary btn-sm" data-log-org="${esc(o.id)}" type="button">+ Log hours</button>
          <button class="btn btn-ghost btn-sm" data-edit-org="${esc(o.id)}" type="button">Edit</button>
        </div>
      </article>`;
    }).join("");
  }

  /* --- settings --- */
  function renderSettings() {
    $("#setting-goal").value = store.data.goals.yearly;
    $("#setting-categories").value = store.categories().join("\n");
    const f = window.GoogleSync.getFile();
    const link = $("#drive-link");
    if (f && f.webViewLink) { link.href = f.webViewLink; link.hidden = false; } else { link.hidden = true; }
    const p = window.GoogleSync.getProfile();
    $("#settings-account").textContent = p ? `Signed in as ${p.name}${p.email ? ` (${p.email})` : ""}.` : "";
  }

  function renderAll() {
    renderDashboard();
    renderLog();
    renderOrgs();
    renderSettings();
    fillOrgSelect($("#report-org"), { allLabel: "All organizations", selected: $("#report-org").value });
    if ($("#view-reports").classList.contains("is-active")) generateReport();
  }

  /* ---------- entry dialog ---------- */
  const entryDlg = $("#entry-dialog");
  function openEntryDialog({ id = null, orgId = "" } = {}) {
    const e = id ? store.entryById(id) : null;
    $("#entry-dialog-title").textContent = e ? "Edit entry" : "Log hours";
    $("#entry-id").value = e ? e.id : "";
    $("#entry-date").value = e ? e.date : todayISO();
    $("#entry-date").max = todayISO();
    $("#entry-hours").value = e ? e.hours : "";
    fillOrgSelect($("#entry-org"), { selected: e ? e.orgId : orgId });
    $("#entry-activity").value = e ? e.activity : "";
    fillCategorySelect($("#entry-category"), { selected: e ? e.category : "" });
    $("#entry-supervisor").value = e ? e.supervisor : "";
    $("#entry-notes").value = e ? e.notes : "";
    $("#entry-delete").hidden = !e;
    $("#entry-error").hidden = true;
    entryDlg.showModal();
    ($("#entry-org").value ? $("#entry-hours") : $("#entry-org")).focus();
  }
  function readEntryForm() {
    const f = {
      date: $("#entry-date").value,
      hours: parseFloat($("#entry-hours").value),
      orgId: $("#entry-org").value,
      activity: $("#entry-activity").value.trim(),
      category: $("#entry-category").value,
      supervisor: $("#entry-supervisor").value.trim(),
      notes: $("#entry-notes").value.trim(),
    };
    if (!isISODate(f.date)) return { error: "Please enter a valid date." };
    if (f.date > todayISO()) return { error: "The date can't be in the future." };
    if (!(f.hours > 0)) return { error: "Hours must be greater than zero." };
    if (f.hours > 24) return { error: "A single entry can't exceed 24 hours. Split it across days." };
    if (!f.orgId) return { error: "Choose an organization, or create a new one." };
    if (!f.activity) return { error: "Describe what you did." };
    return { fields: f };
  }
  $("#entry-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const { error, fields } = readEntryForm();
    if (error) { const el = $("#entry-error"); el.textContent = error; el.hidden = false; return; }
    const id = $("#entry-id").value;
    if (id) { store.updateEntry(id, fields); toast("Entry updated"); }
    else { store.addEntry(fields); toast(`Logged ${hoursWord(fields.hours)}`); }
    entryDlg.close();
  });
  $("#entry-delete").addEventListener("click", async () => {
    const id = $("#entry-id").value;
    entryDlg.close();
    if (await confirmDialog({ title: "Delete this entry?", message: "This removes the logged hours permanently." })) {
      store.deleteEntry(id); toast("Entry deleted");
    }
  });
  $("#entry-new-org").addEventListener("click", () => {
    pendingEntryDraft = readEntryFormRaw();
    entryDlg.close();
    openOrgDialog({ returnToEntry: true });
  });
  let pendingEntryDraft = null;
  function readEntryFormRaw() {
    return {
      date: $("#entry-date").value, hours: $("#entry-hours").value, activity: $("#entry-activity").value,
      category: $("#entry-category").value, supervisor: $("#entry-supervisor").value, notes: $("#entry-notes").value,
      id: $("#entry-id").value,
    };
  }
  function restoreEntryDraft(orgId) {
    const d = pendingEntryDraft; pendingEntryDraft = null;
    openEntryDialog({ id: d.id || null, orgId });
    $("#entry-date").value = d.date || todayISO(); $("#entry-hours").value = d.hours; $("#entry-activity").value = d.activity;
    $("#entry-category").value = d.category; $("#entry-supervisor").value = d.supervisor; $("#entry-notes").value = d.notes;
    if (orgId) $("#entry-org").value = orgId;
  }

  /* ---------- organization dialog ---------- */
  const orgDlg = $("#org-dialog");
  let orgDlgReturnToEntry = false;
  function renderSwatches(selected) {
    $("#org-swatches").innerHTML = ORG_COLORS.map((c) => `<button class="swatch" type="button" role="radio" aria-checked="${c === selected}" aria-label="${esc(c)}" data-color="${esc(c)}" style="background:${esc(c)}"></button>`).join("");
    $("#org-color").value = selected;
  }
  $("#org-swatches").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-color]"); if (!b) return;
    renderSwatches(b.dataset.color);
  });
  function openOrgDialog({ id = null, returnToEntry = false } = {}) {
    const o = id ? store.orgById(id) : null;
    orgDlgReturnToEntry = returnToEntry;
    $("#org-dialog-title").textContent = o ? "Edit organization" : "Add organization";
    $("#org-id").value = o ? o.id : "";
    $("#org-name").value = o ? o.name : "";
    $("#org-contact").value = o ? o.contact : "";
    $("#org-contact-info").value = o ? o.contactInfo : "";
    $("#org-website").value = o ? o.website : "";
    $("#org-notes").value = o ? o.notes : "";
    renderSwatches(o ? o.color : ORG_COLORS[store.data.organizations.length % ORG_COLORS.length]);
    $("#org-delete").hidden = !o;
    $("#org-error").hidden = true;
    orgDlg.showModal();
    $("#org-name").focus();
  }
  $("#org-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fields = {
      name: $("#org-name").value.trim(),
      contact: $("#org-contact").value.trim(),
      contactInfo: $("#org-contact-info").value.trim(),
      website: $("#org-website").value.trim(),
      color: $("#org-color").value,
      notes: $("#org-notes").value.trim(),
    };
    const err = $("#org-error");
    if (!fields.name) { err.textContent = "Give the organization a name."; err.hidden = false; return; }
    if (fields.website && !/^https?:\/\//i.test(fields.website)) fields.website = `https://${fields.website}`;
    const id = $("#org-id").value;
    const dup = store.data.organizations.find((o) => o.id !== id && o.name.toLowerCase() === fields.name.toLowerCase());
    if (dup) { err.textContent = "An organization with that name already exists."; err.hidden = false; return; }
    let orgId = id;
    if (id) { store.updateOrg(id, fields); toast("Organization updated"); }
    else { orgId = store.addOrg(fields).id; toast("Organization added"); }
    const back = orgDlgReturnToEntry; orgDlgReturnToEntry = false;
    orgDlg.close();
    if (back && pendingEntryDraft) restoreEntryDraft(orgId);
  });
  orgDlg.addEventListener("close", () => {
    // Cancelled while creating an org from the entry form: bring the entry form back.
    if (orgDlgReturnToEntry && pendingEntryDraft) restoreEntryDraft("");
    orgDlgReturnToEntry = false;
  });
  $("#org-delete").addEventListener("click", async () => {
    const id = $("#org-id").value;
    const n = store.data.entries.filter((e) => e.orgId === id).length;
    orgDlg.close();
    const ok = await confirmDialog({
      title: `Delete ${store.orgName(id)}?`,
      message: n ? `This also deletes the ${n} ${n === 1 ? "entry" : "entries"} (${hoursWord(store.sumHours(store.data.entries.filter((e) => e.orgId === id)))}) logged with this organization.` : "This organization has no logged hours.",
    });
    if (ok) { store.deleteOrg(id); toast("Organization deleted"); }
  });

  /* ---------- reports ---------- */
  function reportRange() {
    const preset = $("#report-preset").value;
    const now = new Date(); const y = now.getFullYear();
    let from = "", to = "";
    if (preset === "ytd") { from = `${y}-01-01`; to = todayISO(); }
    else if (preset === "last-year") { from = `${y - 1}-01-01`; to = `${y - 1}-12-31`; }
    else if (preset === "12m") { from = toISODate(new Date(y, now.getMonth() - 11, 1)); to = todayISO(); }
    else if (preset === "custom") { from = $("#report-from").value; to = $("#report-to").value; }
    if (preset !== "custom") { $("#report-from").value = from; $("#report-to").value = to; }
    $("#report-from").disabled = $("#report-to").disabled = preset !== "custom";
    return { from, to };
  }
  function reportEntries() {
    const { from, to } = reportRange();
    return { from, to, entries: store.filterEntries(store.entriesSorted("date", "asc"), { from, to, orgId: $("#report-org").value }) };
  }
  function generateReport() {
    const { from, to, entries } = reportEntries();
    const name = $("#report-name").value.trim();
    const total = store.sumHours(entries);
    const byOrg = store.hoursByOrg(entries);
    const period = from || to ? `${from ? fmtDate(from) : "Beginning"} – ${to ? fmtDate(to) : "today"}` : "All time";
    const orgFilter = $("#report-org").value ? store.orgName($("#report-org").value) : "";
    $("#report-output").innerHTML = `
      <div class="report-header">
        <div>
          <h2>Volunteer Hours Report</h2>
          <div class="muted">${esc(name || (window.GoogleSync.getProfile() || {}).name || "")}</div>
        </div>
        <div style="text-align:right" class="small muted">
          <div><b>Period:</b> ${esc(period)}</div>
          ${orgFilter ? `<div><b>Organization:</b> ${esc(orgFilter)}</div>` : ""}
          <div><b>Generated:</b> ${esc(new Date().toLocaleDateString(undefined, { dateStyle: "long" }))}</div>
        </div>
      </div>
      <div class="report-summary">
        <div><b>${fmtHours(total)}</b><span>total hours</span></div>
        <div><b>${entries.length}</b><span>${entries.length === 1 ? "entry" : "entries"}</span></div>
        <div><b>${byOrg.length}</b><span>${byOrg.length === 1 ? "organization" : "organizations"}</span></div>
      </div>
      ${entries.length ? `
      <h3>Hours by organization</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Organization</th><th>Contact</th><th class="num">Entries</th><th class="num">Hours</th></tr></thead>
        <tbody>${byOrg.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.org ? [r.org.contact, r.org.contactInfo].filter(Boolean).join(" · ") : "")}</td><td class="num">${r.count}</td><td class="num">${fmtHours(r.hours)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="num">${fmtHours(total)}</td></tr></tfoot>
      </table></div>
      <h3>Detailed log</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Organization</th><th>Activity</th><th>Supervisor</th><th class="num">Hours</th></tr></thead>
        <tbody>${entries.map((e) => `<tr><td style="white-space:nowrap">${esc(fmtDate(e.date))}</td><td>${esc(store.orgName(e.orgId))}</td><td>${esc(e.activity)}${e.notes ? `<div class="activity-notes">${esc(e.notes)}</div>` : ""}</td><td>${esc(e.supervisor)}</td><td class="num">${fmtHours(e.hours)}</td></tr>`).join("")}</tbody>
      </table></div>
      <div class="report-signature">
        <div>Volunteer signature &amp; date</div>
        <div>Supervisor signature &amp; date</div>
      </div>` : `<div class="empty"><p>No entries in this period.</p></div>`}
      <p class="report-footer">Generated by Volunteer Tracker. Hours are self-reported by the volunteer.</p>`;
  }
  $("#report-form").addEventListener("submit", (ev) => { ev.preventDefault(); generateReport(); });
  $("#report-preset").addEventListener("change", generateReport);
  $("#report-org").addEventListener("change", generateReport);
  $("#report-print").addEventListener("click", () => { generateReport(); window.print(); });
  $("#report-csv").addEventListener("click", () => {
    const { entries, from, to } = reportEntries();
    downloadFile(`volunteer-hours-${from || "all"}-to-${to || "today"}.csv`, toCSV(entries, store), "text/csv");
  });

  /* ---------- settings actions ---------- */
  $("#setting-goal").addEventListener("change", (ev) => { store.setGoal(ev.target.value); toast("Goal updated"); });
  $("#setting-theme").addEventListener("change", (ev) => { localStorage.setItem(THEME_KEY, ev.target.value); applyTheme(ev.target.value); });
  $("#setting-categories-save").addEventListener("click", () => { store.setCategories($("#setting-categories").value.split("\n")); toast("Categories saved"); });
  $("#data-export").addEventListener("click", () => {
    downloadFile(`volunteer-tracker-backup-${todayISO()}.json`, JSON.stringify(store.data, null, 2), "application/json");
  });
  $("#data-import").addEventListener("change", async (ev) => {
    const file = ev.target.files[0]; ev.target.value = "";
    if (!file) return;
    try {
      const incoming = normalize(JSON.parse(await file.text()));
      const ok = await confirmDialog({
        title: "Replace your data?",
        message: `The backup has ${incoming.entries.length} entries and ${incoming.organizations.length} organizations. It will replace everything currently in Google Drive.`,
        okLabel: "Import",
      });
      if (!ok) return;
      incoming.updatedAt = new Date().toISOString();
      store.set(incoming);
      toast("Backup imported");
    } catch (e) { toast(e.message || "Could not read that file.", true); }
  });
  $("#data-sample").addEventListener("click", async () => {
    if (store.data.entries.length || store.data.organizations.length) {
      const ok = await confirmDialog({ title: "Load sample data?", message: "This replaces your current entries and organizations with sample data.", okLabel: "Replace" });
      if (!ok) return;
    }
    store.set(sampleData()); toast("Sample data loaded");
  });
  $("#data-clear").addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Delete all data?", message: "Every entry and organization will be removed from the data file in your Google Drive. Export a backup first if you might want it later." });
    if (!ok) return;
    store.set(emptyData()); toast("All data deleted");
  });
  $("#sync-now").addEventListener("click", () => { window.GoogleSync.scheduleSave(store.data); window.GoogleSync.flush(); });

  /* ---------- global click handling ---------- */
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("button, a");
    if (!t) return;
    if (t.dataset.view) return showView(t.dataset.view);
    if (t.dataset.viewLink) return showView(t.dataset.viewLink);
    if (t.dataset.action === "add-entry" || t.id === "quick-add") return openEntryDialog();
    if (t.dataset.action === "add-org") return openOrgDialog();
    if (t.dataset.editEntry) return openEntryDialog({ id: t.dataset.editEntry });
    if (t.dataset.logOrg) return openEntryDialog({ orgId: t.dataset.logOrg });
    if (t.dataset.editOrg) return openOrgDialog({ id: t.dataset.editOrg });
    if (t.dataset.deleteEntry) {
      const id = t.dataset.deleteEntry;
      confirmDialog({ title: "Delete this entry?", message: "This removes the logged hours permanently." }).then((ok) => { if (ok) { store.deleteEntry(id); toast("Entry deleted"); } });
      return;
    }
    if (t.hasAttribute("data-close")) { const d = t.closest("dialog"); if (d) d.close(); }
  });
  $$(".dialog").forEach((d) => d.addEventListener("click", (ev) => { if (ev.target === d) d.close(); }));

  ["#filter-search", "#filter-org", "#filter-category", "#filter-from", "#filter-to"].forEach((sel) => $(sel).addEventListener("input", renderLog));
  $("#filter-clear").addEventListener("click", () => { ["#filter-search", "#filter-org", "#filter-category", "#filter-from", "#filter-to"].forEach((s) => $(s).value = ""); renderLog(); });
  $$("#log-table .sort").forEach((b) => b.addEventListener("click", () => {
    if (logState.sort === b.dataset.sort) logState.dir = logState.dir === "asc" ? "desc" : "asc";
    else { logState.sort = b.dataset.sort; logState.dir = b.dataset.sort === "date" ? "desc" : "asc"; }
    renderLog();
  }));
  $("#log-export-csv").addEventListener("click", () => {
    const entries = store.filterEntries(store.entriesSorted(logState.sort, logState.dir), currentFilters());
    downloadFile(`volunteer-hours-${todayISO()}.csv`, toCSV(entries, store), "text/csv");
  });
  window.addEventListener("hashchange", () => showView(location.hash.slice(1), { push: false }));
  document.addEventListener("keydown", (ev) => {
    if ((ev.key === "n" || ev.key === "N") && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !$("dialog[open]") && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !$("#app").hidden) {
      ev.preventDefault(); openEntryDialog();
    }
  });

  /* ---------- sync indicator / account ---------- */
  function setSyncState(state, detail) {
    const el = $("#sync");
    el.dataset.state = state;
    const text = $("#sync-text");
    const btn = $("#sync-action");
    btn.hidden = true;
    switch (state) {
      case "saving": text.textContent = "Saving to Drive…"; break;
      case "saved": text.textContent = "Saved to Google Drive"; break;
      case "loading": text.textContent = "Loading from Drive…"; break;
      case "offline": text.textContent = "Offline · changes saved locally"; break;
      case "auth": text.textContent = "Session expired"; btn.textContent = "Sign in again"; btn.hidden = false; break;
      case "error": text.textContent = "Couldn't save to Drive"; btn.textContent = "Retry"; btn.hidden = false; break;
      default: text.textContent = "";
    }
    el.title = detail || "";
  }
  $("#sync-action").addEventListener("click", async () => {
    if ($("#sync").dataset.state === "auth") {
      try { await window.GoogleSync.signIn(); toast("Signed in"); } catch (e) { toast(e.message, true); return; }
    }
    window.GoogleSync.scheduleSave(store.data); window.GoogleSync.flush();
  });
  function renderAccount(profile) {
    const wrap = $("#account-avatar-wrap");
    wrap.innerHTML = profile.picture
      ? `<img src="${esc(profile.picture)}" alt="" referrerpolicy="no-referrer" />`
      : `<span class="avatar-fallback">${esc(initials(profile.name))}</span>`;
    $("#account-name").textContent = profile.name;
    $("#account-name").title = profile.email;
  }
  $("#account-signout").addEventListener("click", async () => {
    if (window.GoogleSync.hasPending()) {
      const ok = await confirmDialog({ title: "Unsaved changes", message: "Some changes haven't reached Google Drive yet. Sign out anyway?", okLabel: "Sign out" });
      if (!ok) return;
    }
    window.GoogleSync.signOut();
    cache.clear();
    location.hash = "";
    location.reload();
  });

  /* ---------- auth screen & boot ---------- */
  function getClientId() { return (window.VT_CONFIG && window.VT_CONFIG.GOOGLE_CLIENT_ID) || localStorage.getItem(CLIENT_ID_KEY) || ""; }
  function authStatus(msg, isError = false) {
    const el = $("#auth-status"); el.textContent = msg || ""; el.hidden = !msg; el.classList.toggle("is-error", isError);
  }
  function renderSetup(clientId) {
    const fromConfig = Boolean(window.VT_CONFIG && window.VT_CONFIG.GOOGLE_CLIENT_ID);
    $("#setup-origin").textContent = location.origin;
    $("#setup-client-id").value = fromConfig ? "" : (localStorage.getItem(CLIENT_ID_KEY) || "");
    $("#setup-config-note").hidden = !fromConfig;
    $("#setup-form").hidden = fromConfig;
    $("#setup").open = !clientId;
    $("#setup-missing").hidden = Boolean(clientId);
    $("#auth-signin").disabled = !clientId;
  }
  $("#setup-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = $("#setup-client-id").value.trim();
    if (!v) { localStorage.removeItem(CLIENT_ID_KEY); }
    else if (!/\.apps\.googleusercontent\.com$/.test(v)) { authStatus("That doesn't look like a Google client ID (it should end in .apps.googleusercontent.com).", true); return; }
    else localStorage.setItem(CLIENT_ID_KEY, v);
    location.reload();
  });

  async function enterApp(profile) {
    renderAccount(profile);
    $("#auth").hidden = true;
    $("#app").hidden = false;
    setSyncState("loading");

    const cached = cache.load(profile.email);
    let data = null;
    try {
      const remote = await window.GoogleSync.load();
      if (remote && remote.data) {
        const remoteData = normalize(remote.data);
        if (cached && cached.dirty && cached.data.updatedAt > remoteData.updatedAt) {
          data = cached.data;                       // offline edits newer than Drive: push them
          window.GoogleSync.scheduleSave(data);
        } else {
          data = remoteData;
          cache.save(data, false, profile.email);
          setSyncState("saved");
        }
      } else {
        data = cached ? cached.data : emptyData();   // first run: create the file
        window.GoogleSync.scheduleSave(data);
      }
    } catch (e) {
      data = cached ? cached.data : emptyData();
      if (e instanceof window.GoogleSync.AuthError) setSyncState("auth", e.message);
      else setSyncState(navigator.onLine ? "error" : "offline", e.message);
      if (!cached) toast(`Couldn't load from Google Drive: ${e.message}`, true);
    }

    store.set(data, { silent: true });
    renderAll();
    showView(location.hash.slice(1) || "dashboard", { push: false });

    store.subscribe((d) => {
      renderAll();
      cache.save(d, true, profile.email);
      window.GoogleSync.scheduleSave(d);
    });
  }

  async function boot() {
    applyTheme();
    const clientId = getClientId();
    renderSetup(clientId);
    $("#app").hidden = true;
    $("#auth").hidden = false;
    if (!clientId) return;

    try {
      await window.GoogleSync.init({
        clientId,
        fileName: (window.VT_CONFIG && window.VT_CONFIG.DRIVE_FILE_NAME) || "volunteer-tracker-data.json",
        onState: setSyncState,
        onSaved: () => cache.markClean(),
        onAuthLost: () => {},
      });
    } catch (e) { authStatus(e.message, true); return; }

    const restored = await window.GoogleSync.restoreSession();
    if (restored) { enterApp(restored); return; }

    $("#auth-signin").addEventListener("click", async () => {
      const btn = $("#auth-signin");
      btn.disabled = true; authStatus("Waiting for Google…");
      try {
        const profile = await window.GoogleSync.signIn();
        authStatus("");
        await enterApp(profile);
      } catch (e) {
        authStatus(e.message, true);
      } finally { btn.disabled = false; }
    });
  }

  boot();
})();
