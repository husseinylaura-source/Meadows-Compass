/* Settings for sending lesson results to the teacher dashboard.
   Paste the Web app URL from the Google Sheet's Apps Script deployment between the quotes.
   Leave it empty ("") and the site works exactly as before, without sending anything. */
window.COMPASS_CONFIG = {
  resultsUrl: "https://script.google.com/macros/s/AKfycbyH0XV07k_aeKYNZ2VeC71mpF0quPQB3A1aeDmTxmekL_c1mOCX3R-g_nWfOdKjgrjJQg/exec",
  /* How a lesson % is worked out: auto-marked activities vs lesson steps completed. */
  autoWeight: 0.7,
  stepsWeight: 0.3
};
