/*  Event ROI Tracker — Google Apps Script Web App
    Handles form submissions for deals, feedback, and conversations.
    Deploy as web app: Execute as Me, Anyone with link can access.

    Sheet tabs expected:
      - Events        (main event data — read by gviz)
      - Deals         (deal name, MRR, HubSpot link, event ID, date added)
      - Feedback      (team member, rating, notes, event ID, date)
      - Conversations (contact name, firm name, notes, follow-up status, event ID, date)
*/

var SHEET_ID = ''; // ← paste your Google Sheet ID here

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var result;

    switch (data.action) {
      case 'addEvent':
        result = addEvent(ss, data);
        break;
      case 'addDeal':
        result = addDeal(ss, data);
        break;
      case 'addFeedback':
        result = addFeedback(ss, data);
        break;
      case 'addConversation':
        result = addConversation(ss, data);
        break;
      default:
        return buildResponse(400, { error: 'Unknown action: ' + data.action });
    }

    return buildResponse(200, result);
  } catch (err) {
    return buildResponse(500, { error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function addEvent(ss, data) {
  var sheet = ss.getSheetByName('Events') || ss.insertSheet('Events');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Task ID', 'Task Name', 'Location', 'Start Date', 'End Date', 'Status', 'Attendees', 'Registration Cost', 'Hotel Cost', 'Hotel Name', 'Sponsorship', 'Sponsorship Cost', 'Notes']);
  }
  sheet.appendRow([
    data.id || ('custom-' + new Date().getTime()),
    data.name,
    data.location || '',
    data.startDate || '',
    data.endDate || '',
    data.status || 'planned',
    data.attendees || '',
    data.registrationCost || '',
    data.hotelCost || '',
    data.hotelName || '',
    data.sponsorshipCost > 0 ? 'true' : '',
    data.sponsorshipCost || '',
    data.notes || ''
  ]);
  return { success: true, type: 'event' };
}

function addDeal(ss, data) {
  var sheet = ss.getSheetByName('Deals') || ss.insertSheet('Deals');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Event ID', 'Deal Name', 'MRR', 'HubSpot Link', 'Stage', 'Date Added']);
  }
  sheet.appendRow([
    data.eventId,
    data.dealName,
    data.mrr,
    data.hubspotLink || '',
    data.stage || 'Pipeline',
    new Date().toISOString()
  ]);
  return { success: true, type: 'deal' };
}

function addFeedback(ss, data) {
  var sheet = ss.getSheetByName('Feedback') || ss.insertSheet('Feedback');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Event ID', 'Team Member', 'Rating', 'Notes', 'Date']);
  }
  sheet.appendRow([
    data.eventId,
    data.teamMember,
    data.rating,
    data.notes || '',
    new Date().toISOString()
  ]);
  return { success: true, type: 'feedback' };
}

function addConversation(ss, data) {
  var sheet = ss.getSheetByName('Conversations') || ss.insertSheet('Conversations');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Event ID', 'Type', 'Contact Name', 'Firm Name', 'Notes', 'Follow-up Status', 'Date']);
  }
  sheet.appendRow([
    data.eventId,
    data.type || 'New Prospect',
    data.contactName,
    data.firmName || '',
    data.notes || '',
    data.followUp || 'Pending',
    new Date().toISOString()
  ]);
  return { success: true, type: 'conversation' };
}

function doGet(e) {
  return buildResponse(200, { status: 'Event Tracker API is running' });
}

function buildResponse(code, payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
