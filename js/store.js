/* ==========================================================================
   Volunteer Tracker — data model, queries, local cache, import/export
   Exposes window.Store
   ========================================================================== */
(function () {
  "use strict";

  const VERSION = 1;
  const CACHE_KEY = "vt:data";
  const DIRTY_KEY = "vt:dirty";
  const OWNER_KEY = "vt:owner";

  const DEFAULT_CATEGORIES = [
    "Community", "Education", "Environment", "Health", "Animals",
    "Arts & Culture", "Disaster Relief", "Faith-based", "Other",
  ];
  const ORG_COLORS = [
    "#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c",
    "#ca8a04", "#16a34a", "#0891b2", "#64748b",
  ];

  /* ---------- small utils ---------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayISO() { return toISODate(new Date()); }
  function isISODate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }
  function monthKey(iso) { return iso.slice(0, 7); }
  function round2(n) { return Math.round(n * 100) / 100; }

  function emptyData() {
    return {
      version: VERSION,
      updatedAt: new Date().toISOString(),
      organizations: [],
      entries: [],
      goals: { yearly: 50 },
      settings: { categories: DEFAULT_CATEGORIES.slice() },
    };
  }

  /* Validate and coerce arbitrary JSON (from Drive, import, or cache). */
  function normalize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Data file is not a valid Volunteer Tracker backup.");
    }
    const out = emptyData();
    const orgs = Array.isArray(raw.organizations) ? raw.organizations : [];
    out.organizations = orgs
      .filter((o) => o && typeof o === "object" && typeof o.name === "string" && o.name.trim())
      .map((o, i) => ({
        id: String(o.id || uid()),
        name: o.name.trim(),
        contact: String(o.contact || ""),
        contactInfo: String(o.contactInfo || ""),
        website: String(o.website || ""),
        color: ORG_COLORS.includes(o.color) ? o.color : ORG_COLORS[i % ORG_COLORS.length],
        notes: String(o.notes || ""),
        createdAt: o.createdAt || new Date().toISOString(),
      }));
    const orgIds = new Set(out.organizations.map((o) => o.id));

    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    out.entries = entries
      .filter((e) => e && typeof e === "object" && isISODate(e.date))
      .map((e) => ({
        id: String(e.id || uid()),
        date: e.date,
        orgId: orgIds.has(String(e.orgId)) ? String(e.orgId) : "",
        activity: String(e.activity || "").trim() || "Volunteer work",
        category: String(e.category || ""),
        hours: Math.max(0, round2(Number(e.hours) || 0)),
        supervisor: String(e.supervisor || ""),
        notes: String(e.notes || ""),
        createdAt: e.createdAt || new Date().toISOString(),
      }))
      .filter((e) => e.hours > 0);

    const yearly = Number(raw.goals && raw.goals.yearly);
    out.goals.yearly = Number.isFinite(yearly) && yearly >= 0 ? yearly : 50;

    const cats = raw.settings && Array.isArray(raw.settings.categories) ? raw.settings.categories : null;
    if (cats && cats.length) {
      out.settings.categories = [...new Set(cats.map((c) => String(c).trim()).filter(Boolean))];
    }
    out.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString();
    return out;
  }

  /* ---------- store ---------- */
  class DataStore {
    constructor() {
      this.data = emptyData();
      this.listeners = [];
    }
    subscribe(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
    emit() { this.listeners.forEach((fn) => fn(this.data)); }

    /** Replace all data. silent=true skips listeners (used on initial load). */
    set(data, { silent = false } = {}) {
      this.data = data;
      if (!silent) this.emit();
    }
    mutate(fn) {
      fn(this.data);
      this.data.updatedAt = new Date().toISOString();
      this.emit();
    }

    /* --- organizations --- */
    orgById(id) { return this.data.organizations.find((o) => o.id === id) || null; }
    orgName(id) { const o = this.orgById(id); return o ? o.name : "Unknown organization"; }
    orgsSorted() { return this.data.organizations.slice().sort((a, b) => a.name.localeCompare(b.name)); }
    addOrg(fields) {
      const org = {
        id: uid(),
        name: fields.name.trim(),
        contact: fields.contact || "",
        contactInfo: fields.contactInfo || "",
        website: fields.website || "",
        color: fields.color || ORG_COLORS[this.data.organizations.length % ORG_COLORS.length],
        notes: fields.notes || "",
        createdAt: new Date().toISOString(),
      };
      this.mutate((d) => d.organizations.push(org));
      return org;
    }
    updateOrg(id, fields) {
      this.mutate((d) => {
        const o = d.organizations.find((x) => x.id === id);
        if (o) Object.assign(o, fields, { name: fields.name.trim() });
      });
    }
    /** Deletes the organization and every entry logged against it. */
    deleteOrg(id) {
      this.mutate((d) => {
        d.organizations = d.organizations.filter((o) => o.id !== id);
        d.entries = d.entries.filter((e) => e.orgId !== id);
      });
    }

    /* --- entries --- */
    entryById(id) { return this.data.entries.find((e) => e.id === id) || null; }
    addEntry(fields) {
      const entry = {
        id: uid(),
        date: fields.date,
        orgId: fields.orgId,
        activity: fields.activity.trim(),
        category: fields.category || "",
        hours: round2(Number(fields.hours)),
        supervisor: fields.supervisor || "",
        notes: fields.notes || "",
        createdAt: new Date().toISOString(),
      };
      this.mutate((d) => d.entries.push(entry));
      return entry;
    }
    updateEntry(id, fields) {
      this.mutate((d) => {
        const e = d.entries.find((x) => x.id === id);
        if (e) Object.assign(e, fields, { activity: fields.activity.trim(), hours: round2(Number(fields.hours)) });
      });
    }
    deleteEntry(id) { this.mutate((d) => { d.entries = d.entries.filter((e) => e.id !== id); }); }

    setGoal(hours) { this.mutate((d) => { d.goals.yearly = Math.max(0, Number(hours) || 0); }); }
    setCategories(list) {
      const cats = [...new Set(list.map((c) => c.trim()).filter(Boolean))];
      this.mutate((d) => { d.settings.categories = cats.length ? cats : DEFAULT_CATEGORIES.slice(); });
    }
    categories() { return this.data.settings.categories; }

    /* --- queries --- */
    entriesSorted(sortKey = "date", dir = "desc") {
      const sign = dir === "asc" ? 1 : -1;
      const byName = (e) => this.orgName(e.orgId).toLowerCase();
      return this.data.entries.slice().sort((a, b) => {
        let r = 0;
        if (sortKey === "hours") r = a.hours - b.hours;
        else if (sortKey === "org") r = byName(a).localeCompare(byName(b));
        else r = a.date.localeCompare(b.date);
        if (r === 0) r = a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
        return r * sign;
      });
    }
    filterEntries(entries, { search = "", orgId = "", category = "", from = "", to = "" } = {}) {
      const q = search.trim().toLowerCase();
      return entries.filter((e) => {
        if (orgId && e.orgId !== orgId) return false;
        if (category && e.category !== category) return false;
        if (from && e.date < from) return false;
        if (to && e.date > to) return false;
        if (q) {
          const hay = `${e.activity} ${e.notes} ${e.supervisor} ${e.category} ${this.orgName(e.orgId)}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }
    sumHours(entries) { return round2(entries.reduce((s, e) => s + e.hours, 0)); }

    hoursByMonth(months = 12, ref = new Date()) {
      const out = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        out.push({ key, label: d.toLocaleString(undefined, { month: "short" }), year: d.getFullYear(), hours: 0, count: 0 });
      }
      const idx = new Map(out.map((m, i) => [m.key, i]));
      for (const e of this.data.entries) {
        const i = idx.get(monthKey(e.date));
        if (i !== undefined) { out[i].hours = round2(out[i].hours + e.hours); out[i].count++; }
      }
      return out;
    }
    hoursByOrg(entries = this.data.entries) {
      const map = new Map();
      for (const e of entries) {
        const cur = map.get(e.orgId) || { orgId: e.orgId, hours: 0, count: 0 };
        cur.hours = round2(cur.hours + e.hours);
        cur.count++;
        map.set(e.orgId, cur);
      }
      return [...map.values()]
        .map((r) => ({ ...r, org: this.orgById(r.orgId), name: this.orgName(r.orgId) }))
        .sort((a, b) => b.hours - a.hours);
    }
    stats(now = new Date()) {
      const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
      const y = String(now.getFullYear());
      const e = this.data.entries;
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const pm = `${prevMonth.getFullYear()}-${pad(prevMonth.getMonth() + 1)}`;
      return {
        total: this.sumHours(e),
        count: e.length,
        month: this.sumHours(e.filter((x) => x.date.startsWith(ym))),
        prevMonth: this.sumHours(e.filter((x) => x.date.startsWith(pm))),
        year: this.sumHours(e.filter((x) => x.date.startsWith(y))),
        yearCount: e.filter((x) => x.date.startsWith(y)).length,
        orgs: this.data.organizations.length,
        activeOrgs: new Set(e.filter((x) => x.date.startsWith(y)).map((x) => x.orgId)).size,
      };
    }
  }

  /* ---------- local cache (offline reads + pending writes) ---------- */
  /* The cache belongs to one Google account; a different account never sees it. */
  const cache = {
    load(owner = "") {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        if ((localStorage.getItem(OWNER_KEY) || "") !== owner) return null;
        return { data: normalize(JSON.parse(raw)), dirty: localStorage.getItem(DIRTY_KEY) === "1" };
      } catch { return null; }
    },
    save(data, dirty, owner = "") {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(DIRTY_KEY, dirty ? "1" : "0");
        localStorage.setItem(OWNER_KEY, owner);
      } catch { /* storage full or blocked: ignore, Drive is the source of truth */ }
    },
    markClean() { try { localStorage.setItem(DIRTY_KEY, "0"); } catch { /* ignore */ } },
    clear() { try { [CACHE_KEY, DIRTY_KEY, OWNER_KEY].forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } },
  };

  /* ---------- export helpers ---------- */
  function csvEscape(v) {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(entries, store) {
    const header = ["Date", "Organization", "Activity", "Category", "Hours", "Supervisor", "Notes"];
    const rows = entries.map((e) => [
      e.date, store.orgName(e.orgId), e.activity, e.category, e.hours, e.supervisor, e.notes,
    ]);
    return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  }
  function downloadFile(name, content, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- sample data ---------- */
  function sampleData() {
    const d = emptyData();
    const now = new Date();
    const ago = (months, day) => toISODate(new Date(now.getFullYear(), now.getMonth() - months, Math.min(day, 28)));
    const orgs = [
      { id: "org-food", name: "Riverside Food Bank", contact: "Maria Lopez", contactInfo: "volunteer@riversidefoodbank.org", website: "https://example.org", color: "#0f766e", notes: "Saturday morning shifts, warehouse entrance on 3rd St." },
      { id: "org-lib", name: "Public Library Literacy Program", contact: "Dev Patel", contactInfo: "(555) 010-2244", website: "", color: "#2563eb", notes: "Weekly reading buddies with 2nd graders." },
      { id: "org-park", name: "Friends of Cedar Park", contact: "", contactInfo: "", website: "", color: "#16a34a", notes: "" },
    ].map((o) => ({ ...o, createdAt: now.toISOString() }));
    const entries = [
      [ago(9, 6), "org-food", "Sorted and shelved donations", "Community", 3, "Maria Lopez", ""],
      [ago(8, 13), "org-food", "Packed weekend meal boxes", "Community", 3.5, "Maria Lopez", "Packed 120 boxes with a team of six."],
      [ago(8, 20), "org-lib", "Reading buddies session", "Education", 1.5, "Dev Patel", ""],
      [ago(7, 4), "org-park", "Spring trail cleanup", "Environment", 4, "", "Collected 14 bags of litter along the creek trail."],
      [ago(7, 18), "org-lib", "Reading buddies session", "Education", 1.5, "Dev Patel", ""],
      [ago(6, 8), "org-food", "Mobile pantry distribution", "Community", 4, "Maria Lopez", "Served about 90 families."],
      [ago(5, 2), "org-lib", "Summer reading kickoff event", "Education", 5, "Dev Patel", "Registration table and craft station."],
      [ago(5, 16), "org-park", "Native plant garden weeding", "Environment", 2.5, "", ""],
      [ago(4, 11), "org-food", "Sorted and shelved donations", "Community", 3, "Maria Lopez", ""],
      [ago(3, 7), "org-lib", "Reading buddies session", "Education", 1.5, "Dev Patel", ""],
      [ago(3, 21), "org-food", "Packed weekend meal boxes", "Community", 3.5, "Maria Lopez", ""],
      [ago(2, 9), "org-park", "Tree planting day", "Environment", 5, "", "Planted 40 saplings with the neighborhood association."],
      [ago(1, 5), "org-food", "Mobile pantry distribution", "Community", 4, "Maria Lopez", ""],
      [ago(1, 19), "org-lib", "Reading buddies session", "Education", 1.5, "Dev Patel", ""],
      [ago(0, Math.max(1, now.getDate() - 3)), "org-food", "Sorted and shelved donations", "Community", 3, "Maria Lopez", ""],
    ].map(([date, orgId, activity, category, hours, supervisor, notes]) => ({
      id: uid(), date, orgId, activity, category, hours, supervisor, notes, createdAt: now.toISOString(),
    }));
    d.organizations = orgs;
    d.entries = entries;
    d.goals.yearly = 60;
    return d;
  }

  window.Store = {
    VERSION, DEFAULT_CATEGORIES, ORG_COLORS,
    DataStore, cache,
    uid, todayISO, toISODate, isISODate, round2,
    emptyData, normalize, sampleData,
    toCSV, downloadFile,
  };
})();
