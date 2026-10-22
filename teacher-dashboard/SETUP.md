# Teacher Dashboard – setup (about 10 minutes, once)

Students' lesson scores go from the website into a Google Sheet. Teachers see who has and hasn't completed
each lesson, each student's term average and their band, either on the website's **Staff** page
(each with their own login, showing only their classes) or, for leaders, in the Sheet itself.

| Band | Lesson / term % |
|---|---|
| Below | 0–39% |
| Working towards | 40–59% |
| Meeting | 60–79% |
| Exceeding | 80–100% |

**Lesson %** = 70% auto-marked work (quiz multiple choice, Challenge sort/order games, Literacy reading
quiz, evidence hunt and gap-fills) + 30% lesson steps completed. Lessons with nothing auto-marked
(e.g. Literacy WRITE) use steps completed only. Change the 70/30 split in `js/config.js`.

**Term average** = average of the lessons a student attempted that term. To count missed lessons as 0%,
set "Missed lessons count as 0%" to Yes on the Settings tab.

## 1. Make the Sheet
1. Sign in to your **school** Google account and create a new blank Google Sheet. Name it
   "Meadows Compass – Teacher Dashboard".
2. **Extensions → Apps Script.** Delete what's there, paste everything from `Code.gs`, click **Save**.
3. In the function box at the top choose **setup**, click **Run**, and allow the permissions it asks for.
   Go back to the Sheet: the tabs Dashboard, Completion, Report, Results, Roster, Name fixes and
   Settings are now there, plus a **Meadows Compass** menu.

## 2. Switch on receiving results
1. In Apps Script: **Deploy → New deployment →** gear icon **→ Web app**.
2. Execute as: **Me**. Who has access: **Anyone**. Click **Deploy** and copy the **Web app URL**
   (it ends in `/exec`).
3. Open the URL in a browser: it should say "Meadows Compass results endpoint is running."

## 3. Connect the website
1. In the website files, open `js/config.js` and paste the URL between the quotes:
   `resultsUrl: "https://script.google.com/macros/s/…/exec",`
2. Upload the changed files to GitHub (or Netlify). From then on, every lesson a student works on is
   sent within a few seconds. Lessons already done on a device are sent the next time the student opens
   the site.

Students must type their **name and choose their class** at the top of the site, otherwise nothing is sent
(the site reminds them).

## 4. Give each teacher a login
1. In the Sheet, open the **Teachers** tab. One row per member of staff:

   | Username | Password | Name | Classes | Subjects | Role |
   |---|---|---|---|---|---|
   | laura | (your password) | Laura Husseiny | | | Leader |
   | rasha.k | (her password) | Rasha Khasawneh | 8A, 8B, 8C | MSC | Teacher |

   - **Leader** sees every class and subject.
   - **Teacher** sees only the **Classes** listed. **Subjects** is optional (MSC, Social Studies,
     Moral Education, Literacy); leave it blank for all subjects in those classes.
   - Give everyone a different password. A row with no password can't sign in.
2. Teachers go to the website, click **Staff** at the bottom of any page (or add `#teacher` to the address),
   and sign in. They see filters, the four bands with counts and %, completion and term averages, every
   student with the lessons they haven't attempted, and a lesson-by-lesson grid for one class and subject.
   **Print report** and **Download CSV** are at the top.
3. **Class lists** at the bottom of the page: teachers can add a student who's missing from their class,
   or add with one click a student who is sending work but isn't on the list. New names go to the Roster tab
   ("Added by" shows who). Teachers can remove only students they added; leaders can remove anyone.
4. After 8 wrong passwords a username is locked for 15 minutes.

Before the Sheet is connected, the Staff page offers **Preview with sample data** (made-up students) so you
can see how it looks.

## 5. Fill in the Sheet
- **Roster**: paste each class list (column A class e.g. `8A`, column B full name). Students on the roster
  who have done nothing still appear, marked "No work yet" / "—". Teachers can also add students from the Staff page.
- **Settings**: check the three term start dates match the school calendar.
- **Name fixes**: if the Report shows "Check name" (a student typed their name differently), add a row:
  name they typed · class · correct roster name.

## 6. Use the Sheet
- **Dashboard**: pick Term, Year group, Class and Subject (yellow cells). You see how many students are in
  each band and what % that is, the share Meeting or above, average completion, and every student
  with the lessons they haven't attempted yet.
- **Completion**: a grid per class and subject: each lesson's % (colour = band), "—" for not attempted,
  italic for started but not finished. It shows the term chosen on the Dashboard.
- Everything refreshes every 10 minutes. For an instant update: **Meadows Compass → Refresh dashboard**.
- End of term: filter the Dashboard to the term and use the band counts for your report; File → Download
  gives Excel or PDF.

**Share the Sheet with leaders only.** It holds every teacher's password and all classes' data; teachers use the website's Staff page instead.

## Good to know
- Only scores are sent (name, class, lesson, %), not students' written answers.
- If you change the script later (including this version, which adds the Staff page feed), use **Deploy → Manage deployments → Edit → New version** so the
  website's URL stays the same.
- The web address is public, so in principle someone could send made-up results. Names that aren't on the
  Roster are flagged "Check name" on the Report.
