# Volunteer Tracker

A static website for tracking volunteer work: log hours per organization, watch progress toward a yearly goal, and print reports for schools, employers, or award applications.

There is no backend. You sign in with Google, and the app keeps all of your data in a single JSON file in **your own Google Drive**. The site itself is plain HTML, CSS, and JavaScript with no build step, so it can be hosted on GitHub Pages, Netlify, or any static host.

## Features

- **Dashboard**: total hours, this month, this year, yearly goal progress, hours by month, hours by organization, active work items, recent activity.
- **Work items**: create a project or commitment under an organization (title, description, status, start date, optional target hours). Each item has a **work tracker** listing the hours logged against it with progress toward the target, and a **memo** stream for notes, contacts, and reminders.
- **Hours log**: add, edit, and delete entries (date, hours, organization, work item, activity, category, supervisor, notes) with search, filters, sorting, and CSV export.
- **Organizations**: contacts, website, color, notes, and per-organization totals.
- **Reports**: year-to-date, last year, last 12 months, all time, or a custom range, with a printable summary and signature lines.
- **Settings**: yearly goal, categories, light/dark theme, JSON backup export/import, sample data.
- **Google Drive storage**: changes are saved automatically about a second after you make them. A copy is cached in the browser so the app still opens offline, and pending changes are pushed when you are back online.
- **Least privilege**: the app requests the `drive.file` scope, which only grants access to files it created. It cannot see the rest of your Drive.

## Setup (one time, about five minutes)

The site needs a Google OAuth client ID before anyone can sign in.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a project (or pick an existing one).
2. **APIs & Services → Library**: enable the **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and support email, and add the scope `https://www.googleapis.com/auth/drive.file`. While the app is in *Testing* status, add each Google account that should be able to sign in under **Test users**. (Publishing the app removes that restriction; Google may ask for verification if you make it public.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**: choose *Web application* and add every origin the site is served from under **Authorized JavaScript origins**, for example:
   - `http://localhost:8000` for local development
   - `https://<your-username>.github.io` for GitHub Pages (origin only, no path)

   No redirect URI is needed.
5. Copy the client ID (it ends in `.apps.googleusercontent.com`) into `js/config.js`:

   ```js
   window.VT_CONFIG = {
     GOOGLE_CLIENT_ID: "1234567890-abc.apps.googleusercontent.com",
     DRIVE_FILE_NAME: "volunteer-tracker-data.json",
   };
   ```

   If you leave it empty, the sign-in page shows a **Set up** panel where you can paste the client ID for the current browser only. That is handy for trying the app before committing the value.

## Running locally

Any static file server works. OAuth requires `http://localhost` or `https://`, so do not open `index.html` directly from the file system.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

1. In the repository, open **Settings → Pages**, set **Source** to *Deploy from a branch*, and pick `main` with the `/ (root)` folder.
2. Every push to `main` is published automatically at `https://<your-username>.github.io/<repo>/`.
3. Add `https://<your-username>.github.io` to the OAuth client's authorized JavaScript origins.

## How data is stored

- On first sign-in the app creates `volunteer-tracker-data.json` in the root of your Google Drive and tags it so it can find the file again even if you rename or move it.
- Every change is written back to that file (debounced, so a burst of edits is one upload). The status indicator in the top bar shows *Saving*, *Saved*, *Offline*, or an error with a retry button.
- **Settings → Your data** has a link to open the file in Drive, a manual save button, and JSON export/import for backups or moving between accounts.
- Sign-in tokens live in the browser tab's session storage and expire after an hour. The app refreshes them silently; if that fails you get a *Sign in again* prompt and nothing is lost, because unsaved changes stay cached locally until the next successful save.

The file format is a plain JSON object:

```json
{
  "version": 1,
  "updatedAt": "2026-09-05T10:00:00.000Z",
  "organizations": [{ "id": "…", "name": "Riverside Food Bank", "contact": "…", "color": "#0f766e" }],
  "workItems": [{ "id": "…", "orgId": "…", "title": "Saturday warehouse shifts", "status": "active", "targetHours": 40 }],
  "entries": [{ "id": "…", "date": "2026-09-02", "orgId": "…", "workItemId": "…", "activity": "Sorted donations", "category": "Community", "hours": 3 }],
  "memos": [{ "id": "…", "workItemId": "…", "date": "2026-09-02", "text": "Sign in at the side entrance." }],
  "goals": { "yearly": 60 },
  "settings": { "categories": ["Community", "Education", "…"] }
}
```

## Project layout

```
index.html        page shell: sign-in screen, app views, dialogs
css/styles.css    styles, light/dark themes, print layout for reports
js/config.js      Google client ID and Drive file name
js/store.js       data model, queries, local cache, CSV/JSON export, sample data
js/drive.js       Google Sign-In (Google Identity Services) and Drive file read/write
js/app.js         UI rendering and event handling
```
