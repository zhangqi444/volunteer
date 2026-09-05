/* ==========================================================================
   Volunteer Tracker — Google Sign-In + Google Drive storage
   Exposes window.GoogleSync

   Auth:    Google Identity Services token client (OAuth 2.0 implicit flow,
            runs entirely in the browser; no server needed).
   Storage: one JSON file in the user's Drive, created by this app. The
            `drive.file` scope only grants access to files this app created.
   ========================================================================== */
(function () {
  "use strict";

  const GIS_SRC = "https://accounts.google.com/gsi/client";
  const SCOPES = "https://www.googleapis.com/auth/drive.file openid email profile";
  const FILES = "https://www.googleapis.com/drive/v3/files";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  const USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";
  const APP_TAG = "volunteer-tracker";
  const TOKEN_KEY = "vt:token";
  const PROFILE_KEY = "vt:profile";
  const SAVE_DEBOUNCE_MS = 1200;

  let cfg = { clientId: "", fileName: "volunteer-tracker-data.json", onState: () => {}, onSaved: () => {}, onAuthLost: () => {} };
  let tokenClient = null;
  let token = null;      // { access_token, expires_at }
  let profile = null;    // { name, email, picture }
  let file = null;       // { id, webViewLink }
  let tokenWaiter = null; // { resolve, reject } for the in-flight requestAccessToken

  let pendingData = null;
  let saveTimer = null;
  let saveInFlight = false;

  class AuthError extends Error { constructor(msg, code) { super(msg); this.name = "AuthError"; this.code = code; } }

  /* ---------- state reporting ---------- */
  function setState(state, detail) { try { cfg.onState(state, detail || ""); } catch { /* ignore */ } }

  /* ---------- Google Identity Services ---------- */
  function loadGis() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
      const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
      if (existing) { existing.addEventListener("load", () => resolve()); existing.addEventListener("error", () => reject(new Error("Could not load Google Sign-In."))); return; }
      const s = document.createElement("script");
      s.src = GIS_SRC; s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load Google Sign-In. Check your connection."));
      document.head.appendChild(s);
    });
  }

  function friendlyAuthError(code) {
    switch (code) {
      case "popup_closed": return "The Google sign-in window was closed before finishing.";
      case "popup_failed_to_open": return "The sign-in popup was blocked. Allow popups for this site and try again.";
      case "access_denied": return "Google Drive access was not granted, so nothing can be saved.";
      case "invalid_client": return "The Google client ID is invalid.";
      default: return code ? `Google sign-in failed (${code}).` : "Google sign-in failed.";
    }
  }

  function handleTokenResponse(resp) {
    const w = tokenWaiter; tokenWaiter = null;
    if (!w) return;
    if (!resp || resp.error) return w.reject(new AuthError(friendlyAuthError(resp && resp.error), resp && resp.error));
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, "https://www.googleapis.com/auth/drive.file")) {
      return w.reject(new AuthError(friendlyAuthError("access_denied"), "access_denied"));
    }
    token = { access_token: resp.access_token, expires_at: Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60_000 };
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token)); } catch { /* ignore */ }
    w.resolve(token);
  }
  function handleTokenError(err) {
    const w = tokenWaiter; tokenWaiter = null;
    if (w) w.reject(new AuthError(friendlyAuthError(err && err.type), err && err.type));
  }

  function requestToken(opts = {}) {
    if (!tokenClient) return Promise.reject(new AuthError("Google Sign-In is not initialised.", "not_ready"));
    if (tokenWaiter) return Promise.reject(new AuthError("A sign-in is already in progress.", "busy"));
    return new Promise((resolve, reject) => {
      tokenWaiter = { resolve, reject };
      const req = {};
      if (opts.prompt !== undefined) req.prompt = opts.prompt;
      if (profile && profile.email) req.hint = profile.email;
      tokenClient.requestAccessToken(req);
    });
  }

  function tokenValid() { return token && token.access_token && Date.now() < token.expires_at; }

  async function ensureToken() {
    if (tokenValid()) return token;
    token = null;
    try {
      // Silent refresh: Google completes this without UI when the session is still valid.
      return await requestToken({ prompt: "" });
    } catch (e) {
      cfg.onAuthLost(e);
      throw e;
    }
  }

  /* ---------- HTTP ---------- */
  async function apiFetch(url, opts = {}, retry = true) {
    const t = await ensureToken();
    const headers = Object.assign({}, opts.headers || {}, { Authorization: `Bearer ${t.access_token}` });
    let res;
    try {
      res = await fetch(url, Object.assign({}, opts, { headers }));
    } catch (e) {
      throw new Error(navigator.onLine ? "Network error talking to Google Drive." : "You're offline.");
    }
    if (res.status === 401 && retry) { token = null; return apiFetch(url, opts, false); }
    if (!res.ok) {
      let msg = `Google Drive error ${res.status}`;
      try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch { /* ignore */ }
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res;
  }

  async function fetchProfile() {
    const res = await apiFetch(USERINFO);
    const j = await res.json();
    profile = { name: j.name || j.email || "Volunteer", email: j.email || "", picture: j.picture || "" };
    try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
    return profile;
  }

  /* ---------- Drive file ---------- */
  async function findFile() {
    const params = new URLSearchParams({
      q: `appProperties has { key='app' and value='${APP_TAG}' } and trashed=false`,
      fields: "files(id,name,modifiedTime,webViewLink)",
      orderBy: "modifiedTime desc",
      pageSize: "5",
      spaces: "drive",
    });
    const res = await apiFetch(`${FILES}?${params}`);
    const j = await res.json();
    const f = (j.files || [])[0];
    file = f ? { id: f.id, webViewLink: f.webViewLink, modifiedTime: f.modifiedTime } : null;
    return file;
  }

  /** Returns { data, file } or null when no data file exists yet. */
  async function load() {
    const f = await findFile();
    if (!f) return null;
    const res = await apiFetch(`${FILES}/${encodeURIComponent(f.id)}?alt=media`);
    const text = await res.text();
    let data;
    try { data = text.trim() ? JSON.parse(text) : null; } catch { throw new Error("The data file in Google Drive is not valid JSON."); }
    return { data, file: f };
  }

  async function save(data) {
    const body = JSON.stringify(data, null, 2);
    if (file && file.id) {
      const res = await apiFetch(`${UPLOAD}/${encodeURIComponent(file.id)}?uploadType=media&fields=id,webViewLink,modifiedTime`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body,
      });
      const j = await res.json();
      file = { id: j.id || file.id, webViewLink: j.webViewLink || file.webViewLink, modifiedTime: j.modifiedTime };
      return file;
    }
    // Re-check before creating so two tabs don't create two files.
    const existing = await findFile();
    if (existing) return save(data);

    const boundary = "vt_" + Math.random().toString(36).slice(2);
    const meta = { name: cfg.fileName, mimeType: "application/json", appProperties: { app: APP_TAG }, description: "Volunteer Tracker data. Edit with care; the app reads and writes this file." };
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await apiFetch(`${UPLOAD}?uploadType=multipart&fields=id,webViewLink,modifiedTime`, {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart,
    });
    const j = await res.json();
    file = { id: j.id, webViewLink: j.webViewLink, modifiedTime: j.modifiedTime };
    return file;
  }

  /* ---------- debounced autosave ---------- */
  function scheduleSave(data) {
    pendingData = data;
    setState("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  async function flush() {
    clearTimeout(saveTimer);
    if (saveInFlight || !pendingData) return;
    const data = pendingData; pendingData = null;
    saveInFlight = true;
    setState("saving");
    try {
      await save(data);
      if (!pendingData) { setState("saved"); try { cfg.onSaved(data, file); } catch { /* ignore */ } }
    } catch (e) {
      if (!pendingData) pendingData = data; // keep the unsaved data for a retry
      if (e instanceof AuthError) setState("auth", e.message);
      else setState(navigator.onLine ? "error" : "offline", e.message);
    } finally {
      saveInFlight = false;
      if (pendingData && navigator.onLine) saveTimer = setTimeout(flush, 4000);
    }
  }

  function hasPending() { return Boolean(pendingData) || saveInFlight; }

  window.addEventListener("online", () => { if (pendingData) flush(); });
  window.addEventListener("pagehide", () => {
    // Best-effort final write for a save still waiting on the debounce.
    if (!pendingData || !file || !file.id || !tokenValid()) return;
    try {
      fetch(`${UPLOAD}/${encodeURIComponent(file.id)}?uploadType=media`, {
        method: "PATCH", keepalive: true,
        headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(pendingData),
      });
    } catch { /* ignore */ }
  });

  /* ---------- public API ---------- */
  async function init(options) {
    cfg = Object.assign(cfg, options);
    if (!cfg.clientId) throw new Error("Missing Google client ID.");
    await loadGis();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: SCOPES,
      callback: handleTokenResponse,
      error_callback: handleTokenError,
    });
    try {
      const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
      if (t && t.access_token && Date.now() < t.expires_at) token = t;
      profile = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || "null");
    } catch { token = null; profile = null; }
  }

  /** Resume a session from this tab without showing any Google UI. */
  async function restoreSession() {
    if (!tokenValid()) return null;
    try { return await fetchProfile(); } catch { token = null; return null; }
  }

  /** Interactive sign-in (must be called from a click). */
  async function signIn() {
    await requestToken();
    return fetchProfile();
  }

  function signOut() {
    const t = token && token.access_token;
    token = null; profile = null; file = null; pendingData = null; clearTimeout(saveTimer);
    try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
    if (t && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(t, () => {}); } catch { /* ignore */ }
    }
  }

  window.GoogleSync = {
    AuthError,
    init, restoreSession, signIn, signOut,
    load, save, scheduleSave, flush, hasPending,
    getProfile: () => profile,
    getFile: () => file,
    isSignedIn: () => tokenValid() && Boolean(profile),
  };
})();
