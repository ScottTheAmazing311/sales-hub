/**
 * Run this from the MASTER spreadsheet (1-urPmmHtiLdJDoAXEFb4SLIfcRhojlUm8rcmLeSVwyY).
 * It pulls the "Lead Log" and "Weekly Summary" tabs from the source sheet
 * and creates (or replaces) them as new tabs in the master.
 */

function importLeadTabs() {
  const SOURCE_ID = '1hDJka4XRZmbTTFyDGxIyJzV3btYMlPrk';
  const master = SpreadsheetApp.getActiveSpreadsheet();
  const source = SpreadsheetApp.openById(SOURCE_ID);

  const tabs = [
    { gid: 298242111, name: 'Lead Log' },
    { gid: 887299160, name: 'Weekly Summary' },
  ];

  for (const tab of tabs) {
    // Find source sheet by GID
    const srcSheet = source.getSheets().find(s => s.getSheetId() === tab.gid);
    if (!srcSheet) {
      Logger.log('Could not find tab with gid ' + tab.gid);
      continue;
    }

    // Get all data from source
    const data = srcSheet.getDataRange().getValues();
    if (data.length === 0) {
      Logger.log('No data in ' + tab.name);
      continue;
    }

    // Delete existing tab in master if it exists
    const existing = master.getSheetByName(tab.name);
    if (existing) {
      master.deleteSheet(existing);
    }

    // Create new tab and paste data
    const newSheet = master.insertSheet(tab.name);
    newSheet.getRange(1, 1, data.length, data[0].length).setValues(data);

    // Auto-resize columns
    for (let i = 1; i <= data[0].length; i++) {
      newSheet.autoResizeColumn(i);
    }

    Logger.log('Imported ' + tab.name + ': ' + data.length + ' rows');
  }

  SpreadsheetApp.getUi().alert('Done! Imported Lead Log and Weekly Summary.');
}
