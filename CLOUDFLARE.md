# EduGhaf on Cloudflare (about 10 minutes, once)

The site now has accounts and saves every student's work:

- **You (admin):** username `laura`. You see every class, manage staff logins, class lists, settings and backups.
- **Teachers:** you give each one a starting password; they choose their own the first time they sign in.
  They see only their own students (by teacher code), each student's lesson %, the term average and band,
  and can open any student's saved work.
- **Students:** sign in with their **M Number** and the **class password**, then choose their own password.
  Their work saves as they go and follows them to any device. Forgotten password → their teacher (or you) presses
  **Reset password**, and the class password works again.

Bands: Below 0–39 · Working towards 40–59 · Meeting 60–79 · Exceeding 80–100.

## 1. Create the site
1. Sign in at **dash.cloudflare.com** (a free account is fine).
2. **Workers & Pages → Create → Pages → Connect to Git** → choose GitHub → repository **Meadows-Compass**.
3. Build settings: Framework preset **None**, build command **empty**, build output directory **/** (or `.`). **Save and Deploy**.

## 2. Create the database
1. **Storage & Databases → D1 → Create database**, name it `edughaf`.
2. Back in your Pages project: **Settings → Bindings → Add → D1 database**. Variable name **`DB`**, database **edughaf**. Save.
   (The tables are created automatically on first use.)

## 3. Set your first password
**Settings → Variables and secrets → Add**, type **Secret**:
- `ADMIN_PASSWORD` = a password only you know (used for your first sign-in and to recover your account).
- Optional: `STUDENT_PASSWORD` = the starting class password (default `Meadows2026`; you can change it later on the Settings tab).

Then **Deployments → Retry deployment** (or push any change) so the settings take effect.

## 4. First sign-in
1. Open your site (`https://<project>.pages.dev`) → **Staff** → username `laura`, password = `ADMIN_PASSWORD`.
2. Choose your own password.
3. **Settings → School student list**: in the master Google Sheet use *File → Download → Microsoft Excel*, then upload it.
   This creates the class lists and one staff login per teacher code.
4. **Staff accounts → Set password** for each teacher, then **Copy login** and send it privately.
5. Tell students the class password (Settings shows it).

## Backups
- **Settings → Download full backup** saves everything (accounts, class lists, all saved work and results) to one file.
- Cloudflare D1 also keeps 30 days of automatic restore points (D1 → edughaf → **Time Travel**).

## Adding lessons
Same as before: add or edit files in `data/` on GitHub. Cloudflare redeploys automatically within a minute.

## Notes
- The GitHub Pages copy still opens, but sign-in and saving only work on the Cloudflare site.
- The old Google Sheet dashboard (`teacher-dashboard/`) is no longer used; `js/config.js` no longer sends to it.
