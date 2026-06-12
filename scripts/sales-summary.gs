/**
 * Sales Summary — Auto-builds month-over-month sales metrics from multiple tabs.
 *
 * SETUP:
 * 1. Open the master spreadsheet: https://docs.google.com/spreadsheets/d/1OR7ypbyUa0TVNzQEwUVp0oGgzAGEYJ2TquvQPFf1-sU
 * 2. Go to Extensions → Apps Script
 * 3. Paste this script (add to existing bdr-rollup.gs project or create new file)
 * 4. Run buildSalesSummary() once manually to test
 * 5. Run createSalesSummaryTrigger() once to auto-refresh every 30 minutes
 *
 * DATA SOURCES:
 * - "Closed Deals" tab → Total MRR/ARR, Deals Closed, Averages, per-rep Closed Won ARR,
 *   and (via the "Pipeline Direction" column) Closed Won ARR + deal counts split
 *   by Outbound / Inbound
 * - "BDR Rollup" tab → Outbound Sets (by Date Set), Outbound Holds/Shows (by Date of Meeting)
 * - "Lead Log" tab → Inbound Sets (by Date Inbound)
 *
 * IMPORTANT: Historical data (Jan–Apr 2026) is seeded on first run.
 * May 2026+ is auto-calculated from live sheet data.
 */

var CLOSED_WON_TAB = 'Closed Deals';
var BDR_ROLLUP_TAB = 'BDR Rollup';
var LEAD_LOG_TAB = 'Lead Log';
var SUMMARY_TAB = 'Sales Summary';

// Months as column headers
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var YEAR = 2026;

// First auto-calculated month (0-indexed: 0=Jan, 4=May)
var AUTO_START_MONTH = 4; // May

// ── Historical data (Jan–Apr 2026) ──
// Format: { 'Metric Label': [Jan, Feb, Mar, Apr] }
var HISTORICAL = {
  'Total MRR':                  [null, null, null, null],
  'Total ARR':                  [null, null, null, null],
  'Deals Closed':               [null, null, null, null],
  'Average MRR Per Deal':       [null, null, null, null],
  'Average ARR Per Deal':       [null, null, null, null],
  'Average Sales Cycle (Days)': [null, null, null, null],
  'Win Rate (From Qualifed)':   [null, null, null, null],
};

// Rep names to track (must match Owner column in Closed Deals)
var REPS = ['Mike Budny', 'Megan Grothman', 'Simon Golding', 'Jake Wangler', 'Brandon Steed', 'Jacob Man'];

// Historical rep data — fill in actual values before first run
var HISTORICAL_REPS = {};
REPS.forEach(function(r) { HISTORICAL_REPS[r] = [null, null, null, null]; });

// Outbound rows
// NOTE: 'Numer of Deals' [sic] matches the existing row label in the sheet —
// don't fix the typo here without renaming the sheet row too.
var OUTBOUND_ROWS = [
  'Sets',
  'Holds / Shows',
  'Avg Daily Dials',
  'Closed Won ARR (Outbound)',
  'Numer of Deals',
];

// Outbound rows that are auto-calculated (the rest stay manual)
var OUTBOUND_AUTO = ['Sets', 'Holds / Shows', 'Closed Won ARR (Outbound)', 'Numer of Deals'];

// Inbound rows ('Holds' and 'Avg Daily Dials' stay manual — no data source in this sheet)
var INBOUND_ROWS = [
  'Inbound Sets',
  'Holds',
  'Closed Won ARR',
  'Avg Daily Dials',
];
var INBOUND_AUTO = ['Inbound Sets', 'Closed Won ARR'];

function buildSalesSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Read Closed Deals ──
  var closedWon = ss.getSheetByName(CLOSED_WON_TAB);
  if (!closedWon) {
    Logger.log('ERROR: Could not find "' + CLOSED_WON_TAB + '" tab.');
    return;
  }

  var summary = ss.getSheetByName(SUMMARY_TAB);
  if (!summary) {
    summary = ss.insertSheet(SUMMARY_TAB);
  }

  // ── Parse Closed Deals ──
  var cwData = closedWon.getDataRange().getDisplayValues();
  var deals = [];
  for (var i = 1; i < cwData.length; i++) {
    var row = cwData[i];
    var dealName = (row[0] || '').trim();
    if (!dealName) continue;

    var mrr = parseFloat(String(row[1]).replace(/[^0-9.\-]/g, '')) || 0;
    var owner = ((row[3] || '') + ' ' + (row[4] || '')).trim();
    var dateStr = (row[5] || '').trim();
    var dateClosed = parseClosedDate(dateStr);
    if (!dateClosed) continue;

    deals.push({
      name: dealName,
      mrr: mrr,
      arr: mrr * 12,
      owner: owner,
      direction: (row[6] || '').trim().toLowerCase(), // "Pipeline Direction": outbound / inbound
      dateClosed: dateClosed,
      month: dateClosed.getMonth(),
      year: dateClosed.getFullYear(),
    });
  }

  // ── Parse BDR Rollup (Outbound sets & holds) ──
  // Columns: A=Rep, B=Date Set, C=Date of Meeting, D=Company, E=Meeting Stage, F=Meeting Type
  var outboundSets = {};    // monthIdx → count
  var outboundHolds = {};   // monthIdx → count
  MONTHS.forEach(function(_, mi) { outboundSets[mi] = 0; outboundHolds[mi] = 0; });

  var bdrRollup = ss.getSheetByName(BDR_ROLLUP_TAB);
  if (bdrRollup) {
    var bdrData = bdrRollup.getDataRange().getDisplayValues();
    for (var i = 1; i < bdrData.length; i++) {
      var bRow = bdrData[i];
      var company = (bRow[3] || '').trim();
      if (!company) continue;

      // Count sets by Date Set (col B)
      var dateSet = parseClosedDate((bRow[1] || '').trim());
      if (dateSet && dateSet.getFullYear() === YEAR) {
        outboundSets[dateSet.getMonth()]++;
      }

      // Count holds/shows by Date of Meeting (col C) where stage = show
      var dateMeeting = parseClosedDate((bRow[2] || '').trim());
      var stage = (bRow[4] || '').trim().toLowerCase();
      if (dateMeeting && dateMeeting.getFullYear() === YEAR) {
        if (stage.indexOf('show') !== -1 && stage.indexOf('no') === -1) {
          outboundHolds[dateMeeting.getMonth()]++;
        }
      }
    }
    Logger.log('BDR Rollup: parsed ' + (bdrData.length - 1) + ' rows.');
  } else {
    Logger.log('WARNING: Could not find "' + BDR_ROLLUP_TAB + '" tab — outbound sets will be empty.');
  }

  // ── Parse Lead Log (Inbound sets) ──
  // Columns: A=Num, B=Name, C=Practice, D=AE, E=Date Inbound
  var inboundSets = {};
  MONTHS.forEach(function(_, mi) { inboundSets[mi] = 0; });

  var leadLog = ss.getSheetByName(LEAD_LOG_TAB);
  if (leadLog) {
    var llData = leadLog.getDataRange().getDisplayValues();
    for (var i = 1; i < llData.length; i++) {
      var lRow = llData[i];
      var name = (lRow[1] || '').trim();
      if (!name) continue;

      var dateInbound = parseClosedDate((lRow[4] || '').trim());
      if (dateInbound && dateInbound.getFullYear() === YEAR) {
        inboundSets[dateInbound.getMonth()]++;
      }
    }
    Logger.log('Lead Log: parsed ' + (llData.length - 1) + ' rows.');
  } else {
    Logger.log('WARNING: Could not find "' + LEAD_LOG_TAB + '" tab — inbound sets will be empty.');
  }

  // ── Compute monthly metrics ──
  var monthlyDeals = {};
  var repMonthlyARR = {};
  var outboundARR = {}, outboundDeals = {}, inboundARR = {};

  MONTHS.forEach(function(_, mi) {
    monthlyDeals[mi] = [];
    outboundARR[mi] = 0; outboundDeals[mi] = 0; inboundARR[mi] = 0;
  });
  REPS.forEach(function(r) { repMonthlyARR[r] = {}; });

  deals.forEach(function(d) {
    if (d.year !== YEAR) return;
    monthlyDeals[d.month].push(d);

    if (d.direction.indexOf('outbound') !== -1) {
      outboundARR[d.month] += d.arr;
      outboundDeals[d.month]++;
    } else if (d.direction.indexOf('inbound') !== -1) {
      inboundARR[d.month] += d.arr;
    }

    var repKey = null;
    REPS.forEach(function(r) {
      if (d.owner.toLowerCase().indexOf(r.toLowerCase()) !== -1) repKey = r;
    });
    if (repKey) {
      repMonthlyARR[repKey][d.month] = (repMonthlyARR[repKey][d.month] || 0) + d.arr;
    }
  });

  // ── Build the output grid ──
  var output = [];
  var headerRow = [''].concat(MONTHS);
  output.push(headerRow);

  // Key Metrics section
  var metricKeys = [
    'Total MRR',
    'Total ARR',
    'Deals Closed',
    'Average MRR Per Deal',
    'Average ARR Per Deal',
    'Average Sales Cycle (Days)',
    'Win Rate (From Qualifed)',
  ];

  metricKeys.forEach(function(key) {
    var row = [key];
    for (var mi = 0; mi < MONTHS.length; mi++) {
      if (mi < AUTO_START_MONTH) {
        var hist = HISTORICAL[key];
        row.push(hist ? hist[mi] : '');
      } else {
        var mDeals = monthlyDeals[mi];
        var val = '';
        if (key === 'Total MRR') {
          val = mDeals.length > 0 ? sumField(mDeals, 'mrr') : '';
        } else if (key === 'Total ARR') {
          val = mDeals.length > 0 ? sumField(mDeals, 'arr') : '';
        } else if (key === 'Deals Closed') {
          val = mDeals.length > 0 ? mDeals.length : '';
        } else if (key === 'Average MRR Per Deal') {
          val = mDeals.length > 0 ? Math.round(sumField(mDeals, 'mrr') / mDeals.length) : '';
        } else if (key === 'Average ARR Per Deal') {
          val = mDeals.length > 0 ? Math.round(sumField(mDeals, 'arr') / mDeals.length) : '';
        }
        row.push(val);
      }
    }
    output.push(row);
  });

  // Blank separator
  output.push(new Array(MONTHS.length + 1).fill(''));

  // Sales Rep section header
  output.push(['Sales Rep (Closed Won ARR)'].concat(new Array(MONTHS.length).fill('')));
  REPS.forEach(function(rep) {
    var row = [rep];
    for (var mi = 0; mi < MONTHS.length; mi++) {
      if (mi < AUTO_START_MONTH) {
        var hist = HISTORICAL_REPS[rep];
        row.push(hist ? hist[mi] : '');
      } else {
        var arr = repMonthlyARR[rep][mi];
        row.push(arr ? arr : '');
      }
    }
    output.push(row);
  });

  // Blank separator
  output.push(new Array(MONTHS.length + 1).fill(''));

  // Outbound section header
  output.push(['Outbound'].concat(new Array(MONTHS.length).fill('')));
  OUTBOUND_ROWS.forEach(function(label) {
    var row = [label];
    for (var mi = 0; mi < MONTHS.length; mi++) {
      if (mi < AUTO_START_MONTH) {
        row.push(''); // historical — manual
      } else if (label === 'Sets') {
        row.push(outboundSets[mi] > 0 ? outboundSets[mi] : '');
      } else if (label === 'Holds / Shows') {
        row.push(outboundHolds[mi] > 0 ? outboundHolds[mi] : '');
      } else if (label === 'Closed Won ARR (Outbound)') {
        // Write (possibly 0) once the month has any closed deals; blank until then
        row.push(monthlyDeals[mi].length > 0 ? outboundARR[mi] : '');
      } else if (label === 'Numer of Deals') {
        row.push(monthlyDeals[mi].length > 0 ? outboundDeals[mi] : '');
      } else {
        row.push(''); // manual rows (Avg Daily Dials)
      }
    }
    output.push(row);
  });

  // Blank separator
  output.push(new Array(MONTHS.length + 1).fill(''));

  // Inbound section header
  output.push(['Inbound'].concat(new Array(MONTHS.length).fill('')));
  INBOUND_ROWS.forEach(function(label) {
    var row = [label];
    for (var mi = 0; mi < MONTHS.length; mi++) {
      if (mi < AUTO_START_MONTH) {
        row.push(''); // historical — manual
      } else if (label === 'Inbound Sets') {
        row.push(inboundSets[mi] > 0 ? inboundSets[mi] : '');
      } else if (label === 'Closed Won ARR') {
        row.push(monthlyDeals[mi].length > 0 ? inboundARR[mi] : '');
      } else {
        row.push(''); // manual rows (Holds, Avg Daily Dials)
      }
    }
    output.push(row);
  });

  // Blank separator
  output.push(new Array(MONTHS.length + 1).fill(''));

  // Pipeline section header
  output.push(['Pipeline'].concat(new Array(MONTHS.length).fill('')));

  // ── Write to sheet ──
  var existingData = [];
  if (summary.getLastRow() > 0 && summary.getLastColumn() > 0) {
    existingData = summary.getDataRange().getValues();
  }

  // On first run or if structure changed, write everything
  if (existingData.length === 0) {
    summary.clearContents();
    summary.getRange(1, 1, output.length, output[0].length).setValues(output);
    formatSummarySheet(summary, output);
    Logger.log('Sales Summary: initial build complete — ' + deals.length + ' deals processed.');
    return;
  }

  // On subsequent runs, only update auto-calculated cells
  for (var oi = 0; oi < output.length; oi++) {
    var label = output[oi][0];
    if (!label) continue;

    var existRow = -1;
    for (var ei = 0; ei < existingData.length; ei++) {
      if (String(existingData[ei][0]).trim() === label) { existRow = ei; break; }
    }
    if (existRow === -1) continue;

    for (var mi = AUTO_START_MONTH; mi < MONTHS.length; mi++) {
      var val = output[oi][mi + 1];
      if (val === '') continue;

      var isAuto = (label === 'Total MRR' || label === 'Total ARR' ||
                    label === 'Deals Closed' || label === 'Average MRR Per Deal' ||
                    label === 'Average ARR Per Deal');
      // Auto for rep rows
      REPS.forEach(function(r) { if (label === r) isAuto = true; });
      // Auto for outbound sets/holds
      OUTBOUND_AUTO.forEach(function(r) { if (label === r) isAuto = true; });
      // Auto for inbound sets
      INBOUND_AUTO.forEach(function(r) { if (label === r) isAuto = true; });

      if (isAuto) {
        summary.getRange(existRow + 1, mi + 2).setValue(val);
      }
    }
  }

  Logger.log('Sales Summary: refreshed auto-calculated cells — ' + deals.length + ' deals processed.');
}

function sumField(deals, field) {
  var total = 0;
  deals.forEach(function(d) { total += d[field]; });
  return total;
}

function parseClosedDate(str) {
  if (!str) return null;
  var d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  // Try MM/DD/YYYY
  var parts = str.split('/');
  if (parts.length === 3) {
    d = new Date(parts[2], parts[0] - 1, parts[1]);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function formatSummarySheet(sheet, data) {
  // Bold header row
  sheet.getRange(1, 1, 1, data[0].length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // Bold section headers
  for (var i = 0; i < data.length; i++) {
    var label = String(data[i][0]).trim();
    if (label === 'Sales Rep (Closed Won ARR)' || label === 'Outbound' || label === 'Inbound' || label === 'Pipeline') {
      sheet.getRange(i + 1, 1, 1, data[0].length).setFontWeight('bold');
    }
  }

  // Auto-resize columns
  for (var c = 1; c <= data[0].length; c++) {
    sheet.autoResizeColumn(c);
  }

  // Number formatting for money rows
  var moneyRows = ['Total MRR', 'Total ARR', 'Average MRR Per Deal', 'Average ARR Per Deal', 'Closed Won ARR (Outbound)'];
  for (var i = 0; i < data.length; i++) {
    if (moneyRows.indexOf(String(data[i][0]).trim()) !== -1) {
      sheet.getRange(i + 1, 2, 1, MONTHS.length).setNumberFormat('$#,##0');
    }
  }

  // Money format for rep rows too
  REPS.forEach(function(rep) {
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === rep) {
        sheet.getRange(i + 1, 2, 1, MONTHS.length).setNumberFormat('$#,##0');
      }
    }
  });

  // Percent format for Win Rate
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'Win Rate (From Qualifed)') {
      sheet.getRange(i + 1, 2, 1, MONTHS.length).setNumberFormat('0%');
    }
  }
}

/**
 * Run once to create a 30-minute auto-refresh trigger.
 */
function createSalesSummaryTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'buildSalesSummary') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('buildSalesSummary')
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log('Trigger created: buildSalesSummary will run every 30 minutes.');
}
