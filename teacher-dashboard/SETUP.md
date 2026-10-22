# Teacher Dashboard – setup (about 10 minutes, once)

Students type their **M Number** and class at the top of the website. Every lesson they work on sends its %
to a Google Sheet. The Sheet reads the school's master student list, which gives each student's section and,
for each subject, their teacher's code (PLO, SAY, …). Each teacher signs in on the website's **Staff** page and
sees only **their own students**; leaders see everyone and manage logins there too.

| Band | Lesson / term % |
|---|---|
| Below | 0–39% |
| Working towards | 40–59% |
| Meeting | 60–79% |
| Exceeding | 80–100% |

**Lesson %** = 70% auto-marked work (quiz, Challenge games, Literacy reading quiz, evidence hunt, gap-fills)
+ 30% lesson steps completed. Lessons with nothing auto-marked (e.g. Literacy WRITE) use steps only.
Change the split in `js/config.js`.
**Term average** = average of the lessons a student attempted (Settings → "Missed lessons count as 0%" to change).

## Who sees whom
From the master list (one tab per year, headings: M Number, Name, Section, ME/ Lit + Teacher, SS/MSC + Teacher,
Islamic, Literacy/ Islamic Teacher):
- **MSC / Social Studies**: the teacher next to "SS/MSC".
- **Moral Education**: the teacher next to "ME/ Lit" when it says ME.
- **Literacy**: the teacher next to "ME/ Lit" when it says Lit, **and** the "Literacy/ Islamic Teacher" (both see it).
- Section Y7AA = class 7A on the website, Y8BB = 8B, and so on.

## 1. Make the Sheet
1. In your **school** Google account, create a blank Google Sheet called "Meadows Compass – Teacher Dashboard".
   You need to be able to open the master student list with the same account.
2. **Extensions → Apps Script.** Delete what's there, paste everything from `Code.gs`, click **Save**.
3. Choose **setup** in the function box, click **Run**, and allow the permissions it asks for (it needs to read the
   master list and to run on a timer).
4. Back in the Sheet: the **Roster** tab now lists every student with their teacher codes, and the **Teachers**
   tab has one login per teacher code (no passwords yet). Settings shows when the list was last imported.
   It re-reads the master list every hour, so changes there flow through.

## 2. Switch on receiving results
1. Apps Script: **Deploy → New deployment →** gear icon **→ Web app**. Execute as **Me**, access **Anyone**. **Deploy**.
2. Copy the **Web app URL** (ends in `/exec`). Opening it should say "Meadows Compass results endpoint is running."

## 3. Connect the website
Put the URL in `js/config.js` (`resultsUrl: "…/exec"`) and upload it, or send it to whoever maintains the site.

## 4. Logins
1. **Your login**: on the Teachers tab, type a password in cell **B2** (row "laura", role Leader, code LHU).
   It's scrambled the first time you sign in.
2. Go to the website → **Staff** (bottom of any page, or add `#teacher` to the address) and sign in as `laura`.
3. Under **Staff accounts**, press **Set password** next to each teacher. A password is generated for you;
   press **Save**, then **Copy login** and send it to the teacher privately. Usernames are their codes in
   lower case (e.g. `plo`); you can change any username, name or code with **Edit**.
4. Optional: **Whole classes** on a login (e.g. for a head of year) shows every student in those classes.

## 5. What teachers see
- Filters for term, year group, class and subject; the four bands with counts and %; average completion and
  term %; every student with the lessons they haven't attempted; a lesson-by-lesson grid for one class and
  subject; **Print report** and **Download CSV**.
- **My students**: their students by class and subject, with M Numbers. They can add a student by M Number
  (name only needed if the student isn't on the school list yet), or with one click when an unknown M Number
  has sent work in their class. They can remove only students they added; school-list students change when the
  master list changes.

## Good to know
- Students must enter their **M Number** and class at the top of the site, otherwise nothing is sent (the site
  reminds them). Their name is still used on their PDF hand-in.
- Results from an M Number that isn't on the school list are flagged **check M Number**.
- Only scores are sent (M Number, name, class, lesson, %), not students' written answers.
- Keep the Google Sheet shared with **leaders only**. Teachers use the website.
- After changing the script, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.
- After 8 wrong passwords a username is locked for 15 minutes.
