# EduGhaf on Cloudflare – setup (about 15 minutes, once)

EduGhaf now has logins: students sign in with their **M Number**, teachers with their **teacher code** (e.g. PLO),
and the leader account is **LHU**. Everyone gets a temporary password (in the logins spreadsheet) and chooses
their own the first time they sign in. Lesson work is saved to each student's account, so it follows them to any device.

## 1. Put EduGhaf on Cloudflare
1. Create a free account at dash.cloudflare.com (use your own email, not the school one, if the site should stay yours).
2. **Workers & Pages → Create → Import a repository →** connect GitHub and choose **Meadows-Compass**.
3. Branch: **cloudflare** (once you're happy, this moves to `main`). Leave the build command empty; the deploy command is `npx wrangler deploy`.
4. **Deploy.** The first deploy also creates the database (`edughaf-db`) automatically.
   - If the deploy log says the D1 database is missing: **Storage & Databases → D1 → Create** a database named
     `edughaf-db`, copy its **Database ID**, add `"database_id": "<the ID>"` next to `"database_name"` in `wrangler.jsonc`
     on GitHub, and deploy again.
5. Your site's address is shown when it finishes, e.g. `https://edughaf.<your-account>.workers.dev`.

## 2. First sign in and import everyone
1. Open the site → **Sign in** with `LHU` and the password on the **Staff** tab of the logins spreadsheet. Choose your own password.
2. On the **Staff dashboard → Staff accounts → Import accounts file**, choose `edughaf-accounts-import.json`.
   This creates every student and teacher account and links students to their teachers.
   (The file has scrambled passwords and student names: keep it private and don't upload it to GitHub.)
3. Hand out logins: teachers from the **Staff** tab, students from the class tabs (7A, 7B …) of the spreadsheet.

## Forgotten passwords
Students see: *"Forgot your M Number or password? Contact Ms Laura Husseiny to reset it."*
Reset it on the Staff dashboard → **Student accounts → New password** (or **Staff accounts → New password**).
They choose a new one when they sign in. After 8 wrong passwords an account locks for 15 minutes.

## Backups (three layers)
1. **Download full backup** (Staff dashboard → Backups & settings): one file with every account, class list and saved
   lesson. Do it weekly and keep it in your Google Drive. **Restore from a backup** puts it back.
2. **Google Sheet copy:** every lesson result is also sent to the existing "EduGhaf – Teacher Dashboard" Google Sheet
   (`MIRROR_URL` in `wrangler.jsonc`), so the results exist outside Cloudflare too.
3. **Cloudflare Time Travel:** Cloudflare keeps the database's history automatically and can roll it back to any
   minute in the last 7 days (30 days on the paid plan) — the safety net for an accidental mistake.

## Adding lessons later
Add or edit lesson files in `data/` on GitHub exactly as before (see README.md). Cloudflare redeploys the site
automatically in about a minute. Accounts and saved work live in the database, not in the files, so nothing is lost.
**Keep existing lesson IDs** (e.g. `id:"w04"`): changing an ID makes it a new lesson and its old results stay under the old ID.

## Good to know
- Teachers see only students linked to their code; leaders see everyone. Each lesson can be opened step by step
  (**Each part of a lesson**) to see which parts every student has done.
- The free Cloudflare plan is enough for one school. If the dashboard ever shows "exceeded CPU" errors, the
  $5/month Workers plan removes the limit.
