# Meadows Compass

Interactive lessons for Emirates International School – Meadows (2026–27):
MSC (Years 7–10), Social Studies (Years 7–10), Moral Education (Years 7–13) and Literacy (Years 7–11).

## Put it on GitHub Pages
1. Create a repository and upload everything in this folder (index.html, js/, data/, images/, videos/).
2. Settings → Pages → Deploy from branch → main / root.
3. Share the Pages link with students.

## Add videos
Open `data/videos.js` and follow the example. Use a YouTube link, or upload an .mp4 to `videos/`.

## Add pictures
Upload a photo to `images/` and add `image:"images/your-photo.jpg"` to that lesson in its data file.
If the photo is missing, the built-in illustration shows instead.

## Add lessons
- MSC: `data/y7-msc.js` (copy it as `data/y8-msc.js`, change the key to "y8-msc").
- Moral Education: `data/y7-me.js`, `data/y8-me.js` (add `data/y9-me.js` etc.).
- Literacy: the full Years 7–11 curriculum is in `data/literacy.js`. Texts and word work for a unit go in a
  file like `data/lit-y7-u1.js` (keys "year-unit-week", e.g. "7-2-1").
Then add a `<script src="data/…"></script>` line for each new file in `index.html`, before `js/app.js`.

## Social Studies (Arabic)
- Lessons live in `data/y7-ss.js` … `data/y10-ss.js` (Year 11 uses the Year 10 lessons, as in the term overview).
- Pages switch to Arabic and right-to-left automatically. The hand-in PDF is built from the on-screen Arabic text, so it needs a normal browser (Chrome, Edge, Safari).
- Add a video with keys like `"y7-ss-w04"` in `data/videos.js`.

## Moral Education
- All years are in Arabic. Years 7–8 come from the department's decks; Years 9–13 (`data/y9-me.js` … `data/y13-me.js`) were written from the MOE 2025–26 Term 1 book contents. Replace any lesson by editing its file.

## Teacher dashboard (student progress and bands)
Students enter their M Number and class at the top of the site. Each lesson's % (auto-marked work + steps
completed) goes to a Google Sheet that reads the school's master student list. Teachers sign in on the
**Staff** page (`#teacher`) and see only their own students: completion, term averages and bands
(Below / Working towards / Meeting / Exceeding). Setup: `teacher-dashboard/SETUP.md`.
The Sheet's web address goes in `js/config.js`; leave it empty to switch sending off.
