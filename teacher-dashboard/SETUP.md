# Teacher Dashboard – setup (about 10 minutes, once)

Students' lesson scores go from the website into a Google Sheet. Teachers open the Sheet to see who has
and hasn't completed each lesson, each student's term average and their band.

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

## 4. Fill in the Sheet
- **Roster**: paste each class list (column A class e.g. `8A`, column B full name). Students on the roster
  who have done nothing still appear, marked "No work yet" / "—".
- **Settings**: check the three term start dates match the school calendar.
- **Name fixes**: if the Report shows "Check name" (a student typed their name differently), add a row:
  name they typed · class · correct roster name.

## 5. Use it
- **Dashboard**: pick Term, Year group, Class and Subject (yellow cells). You see how many students are in
  each band and what % that is, the share Meeting or above, average completion, and every student
  with the lessons they haven't attempted yet.
- **Completion**: a grid per class and subject: each lesson's % (colour = band), "—" for not attempted,
  italic for started but not finished. It shows the term chosen on the Dashboard.
- Everything refreshes every 10 minutes. For an instant update: **Meadows Compass → Refresh dashboard**.
- End of term: filter the Dashboard to the term and use the band counts for your report; File → Download
  gives Excel or PDF.

Share the Sheet with teachers as **Viewer** (or Commenter) so the data isn't edited by accident.

## Good to know
- Only scores are sent (name, class, lesson, %), not students' written answers.
- If you change the script later, use **Deploy → Manage deployments → Edit → New version** so the
  website's URL stays the same.
- The web address is public, so in principle someone could send made-up results. Names that aren't on the
  Roster are flagged "Check name" on the Report.
