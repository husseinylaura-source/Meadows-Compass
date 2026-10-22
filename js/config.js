/* Settings for sending lesson results to the teacher dashboard.
   Paste the Web app URL from the Google Sheet's Apps Script deployment between the quotes.
   Leave it empty ("") and the site works exactly as before, without sending anything. */
window.COMPASS_CONFIG = {
  resultsUrl: "",
  /* How a lesson % is worked out: auto-marked activities vs lesson steps completed. */
  autoWeight: 0.7,
  stepsWeight: 0.3
};
