/**
 * BDR Rollup — Pulls outbound activity from 6 rep sheets into "BDR Rollup" tab.
 *
 * SETUP:
 * 1. Open the master spreadsheet: https://docs.google.com/spreadsheets/d/1OR7ypbyUa0TVNzQEwUVp0oGgzAGEYJ2TquvQPFf1-sU
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire script and save
 * 4. Run syncAllReps() once manually to test (it will ask for permissions)
 * 5. Then run createTrigger() once to set up auto-sync every 30 minutes
 */

var REP_SHEETS = [
  { name: 'Andrew',    id: '1NiYxYIZYbkIbJRg8pTGMJZsNwg8K46ZRQL_YOafM2Nw', hasDateSet: true },
  { name: 'Dave',      id: '19Q5hIa1gox5SBsDFiWqWOq1cVW2I6ovEsVtMTRRarEA', hasDateSet: true },
  { name: 'Matt',      id: '1saAE5EDg8OKFwIlPVwAoYxGMGtlalFWEFnTkDjEt5sg', hasDateSet: true },
  { name: 'Michael H', id: '1k_2qJdn97Vw-N6GWS41Kei8n1ztfIpeFf4iRlM6rRpg', hasDateSet: true },
  { name: 'Michael W', id: '18TBknEp9rRHzfqa2E6ZeIIIt_oyMcYsQFPTk4wMaY1s', hasDateSet: true },
  { name: 'Ryan D',    id: '1qPboLv9RVCnQeHnEgX2CK0a49J5P7H84XbvWTj35eZI', hasDateSet: true },
];

var ROLLUP_TAB = 'BDR Rollup';

function syncAllReps() {
  var master = SpreadsheetApp.getActiveSpreadsheet();
  var rollup = master.getSheetByName(ROLLUP_TAB);

  // Create the tab if it doesn't exist
  if (!rollup) {
    rollup = master.insertSheet(ROLLUP_TAB);
  }

  // Clear existing data
  rollup.clearContents();

  // Write header row
  var headers = ['Rep', 'Date Set', 'Date of Meeting', 'Company Name', 'Meeting Stage', 'Meeting Type', 'AE', 'Deal Stage', 'Spiff', 'Notes'];
  rollup.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Bold + freeze header
  rollup.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  rollup.setFrozenRows(1);

  var allRows = [];

  for (var i = 0; i < REP_SHEETS.length; i++) {
    var rep = REP_SHEETS[i];
    try {
      var ss = SpreadsheetApp.openById(rep.id);
      var sheet = ss.getSheets()[0]; // first tab
      var data = sheet.getDataRange().getDisplayValues();

      for (var r = 1; r < data.length; r++) { // skip header row
        var row = data[r];

        // Skip summary rows — they have month names like "January", "February" etc.
        // or are empty rows. Data rows have a date in the meeting date column.
        var firstCell = String(row[0]).trim();

        // Columns: Date Set, Date of Meeting, Company Name, Meeting Stage, Meeting Type, AE, Deal Stage, Spiff, Notes
        var companyName = String(row[2]).trim();

        // Skip if no company name or if it looks like a summary row
        if (!companyName || companyName === '' || isSummaryRow(firstCell)) {
          continue;
        }

        allRows.push([
          rep.name,
          row[0], // Date Set
          row[1], // Date of Meeting
          row[2], // Company Name
          row[3], // Meeting Stage
          row[4], // Meeting Type
          row[5], // AE
          row[6], // Deal Stage
          row[7], // Spiff
          row[8], // Notes
        ]);
      }
    } catch (e) {
      Logger.log('Error reading sheet for ' + rep.name + ': ' + e.message);
    }
  }

  // Write all data rows
  if (allRows.length > 0) {
    rollup.getRange(2, 1, allRows.length, headers.length).setValues(allRows);
  }

  // Auto-resize columns
  for (var c = 1; c <= headers.length; c++) {
    rollup.autoResizeColumn(c);
  }

  Logger.log('BDR Rollup synced: ' + allRows.length + ' rows from ' + REP_SHEETS.length + ' reps.');
}

/**
 * Checks if a cell value looks like a summary row (month name, "Meetings Set:", etc.)
 */
function isSummaryRow(val) {
  if (!val) return true;
  var s = val.toString().toLowerCase().trim();
  // Skip repeated header rows
  if (s === 'meeting set' || s === 'date set') return true;
  // Skip month summary rows
  var months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  for (var i = 0; i < months.length; i++) {
    if (s === months[i]) return true;
  }
  if (s.indexOf('meetings set') !== -1) return true;
  if (s.indexOf('meetings held') !== -1) return true;
  if (s.indexOf('commission') !== -1) return true;
  if (s.indexOf('closed deals') !== -1) return true;
  return false;
}

/**
 * Run this once to create a 30-minute auto-sync trigger.
 */
function createTrigger() {
  // Remove any existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncAllReps') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('syncAllReps')
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log('Trigger created: syncAllReps will run every 30 minutes.');
}
