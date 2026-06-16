/**
 * Revenue Kitchen — Event Lead Capture (backend)
 * Google Apps Script web app + nightly HubSpot sync.
 *
 *   doGet  ?action=reps   -> rep roster
 *   doGet  ?action=events -> event list (dropdown source)
 *   doPost {action:lead}  -> append a lead (with event_name)
 *   doPost {action:ocr}   -> business-card OCR via the Anthropic API
 *   syncToHubSpot_()      -> nightly: upsert new/edited leads as HubSpot contacts
 *
 * SETUP (see SETUP.md and HUBSPOT.md):
 *   Script Properties: ANTHROPIC_API_KEY (OCR), HUBSPOT_TOKEN (private-app token)
 *   Run setupNightlyTrigger() once to schedule the ~3 AM sync.
 */

var SHEET_ID = '1dN-tOKbG1_3cAiaXEM_DyRVy4n18gaoZqXwvKZvi6RE';
var LEADS_TAB = 'Leads';
var REPS_TAB = 'Reps';
var EVENTS_TAB = 'Events';
var DEFAULT_SCHEDULING_LINK = 'https://meetings.hubspot.com/sknudson/inbound-discovery';
var OCR_MODEL = 'claude-sonnet-4-6';

// HubSpot contact property internal name for the event. If you named the
// property "Event Name" in HubSpot, its internal name is "event_name".
var HS_EVENT_PROP = 'event_name';

// Leads columns (1-based): A timestamp, B rep_id, C rep_name, D source,
// E contact_type, F first_name, G last_name, H firm, I email, J notes,
// K event_name, L contact_owner, M synced_at, N hubspot_id
var COL_SYNCED_AT = 13; // M
var COL_HUBSPOT_ID = 14; // N

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ---- Roster + events -------------------------------------------------------
function getReps_() {
  var sheet = ss_().getSheetByName(REPS_TAB);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  var reps = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var rep_id = String(r[0] || '').trim();
    var name = String(r[1] || '').trim();
    if (!rep_id || !name) continue;
    var link = String(r[6] || '').trim();
    reps.push({
      rep_id: rep_id, name: name,
      title: String(r[2] || '').trim(),
      email: String(r[3] || '').trim(),
      phone: String(r[4] || '').trim(),
      company: String(r[5] || '').trim(),
      scheduling_link: link,
      scheduling_url: link || DEFAULT_SCHEDULING_LINK,
    });
  }
  return reps;
}

function getEvents_() {
  var sheet = ss_().getSheetByName(EVENTS_TAB);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var n = String(values[i][0] || '').trim();
    if (n) out.push(n);
  }
  return out;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'reps';
  if (action === 'reps') return jsonOut_({ reps: getReps_() });
  if (action === 'events') return jsonOut_({ events: getEvents_() });
  return jsonOut_({ error: 'Unknown action' });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return jsonOut_({ error: 'Invalid JSON' }); }
  var action = body.action || '';
  if (action === 'lead') return jsonOut_(appendLead_(body));
  if (action === 'ocr') return jsonOut_(runOcr_(body));
  return jsonOut_({ error: 'Unknown action' });
}

// ---- Lead append -----------------------------------------------------------
function appendLead_(body) {
  var rep_id = String(body.rep_id || '').trim();
  var source = String(body.source || '').trim();
  if (!rep_id) return { error: 'Missing rep_id' };
  if (['qr', 'manual', 'card'].indexOf(source) === -1) return { error: 'Invalid source' };

  var first_name = String(body.first_name || '').trim();
  var last_name = String(body.last_name || '').trim();
  var firm = String(body.firm || '').trim();
  var email = String(body.email || '').trim();
  if (!first_name && !last_name && !firm && !email)
    return { error: 'Provide at least a name, firm, or email' };

  var contact_type = String(body.contact_type || '').trim();
  if (['Lead', 'Vendor', 'Partner', 'Client', 'Other'].indexOf(contact_type) === -1)
    contact_type = 'Lead';

  var reps = getReps_();
  var rep_name = '';
  for (var i = 0; i < reps.length; i++) if (reps[i].rep_id === rep_id) rep_name = reps[i].name;

  var sheet = ss_().getSheetByName(LEADS_TAB);
  if (!sheet) return { error: 'Leads tab missing' };

  // 11 values write A..K (event_name). L/M/N (contact_owner/synced_at/hubspot_id)
  // stay blank — synced_at blank means the nightly job will pick this row up.
  sheet.appendRow([
    new Date().toISOString(),
    rep_id, rep_name, source, contact_type,
    first_name, last_name, firm, email,
    String(body.notes || '').trim(),
    String(body.event_name || '').trim(),
  ]);
  return { ok: true };
}

// ---- OCR -------------------------------------------------------------------
function runOcr_(body) {
  var EMPTY = { firstName: '', lastName: '', firm: '', email: '' };
  var image = String(body.image || '');
  if (!image) return EMPTY;
  var mediaType = body.mediaType || 'image/jpeg';
  var m = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/);
  if (m) { mediaType = m[1]; image = m[2]; }

  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return EMPTY;

  var payload = {
    model: OCR_MODEL, max_tokens: 512,
    system:
      'Extract contact info from this business card or event badge. ' +
      'Return ONLY a JSON object with keys firstName, lastName, firm, email. ' +
      'Use empty strings for anything not present. No prose, no markdown.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: 'Extract the contact fields as JSON.' },
      ],
    }],
  };

  try {
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
    var data = JSON.parse(res.getContentText());
    var text = '';
    if (data && data.content) {
      for (var i = 0; i < data.content.length; i++)
        if (data.content[i].type === 'text') text += data.content[i].text;
    }
    return parseFields_(text);
  } catch (err) { return EMPTY; }
}

function parseFields_(text) {
  var EMPTY = { firstName: '', lastName: '', firm: '', email: '' };
  try {
    var c = String(text || '').trim();
    c = c.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    var s = c.indexOf('{'), en = c.lastIndexOf('}');
    if (s !== -1 && en !== -1 && en > s) c = c.slice(s, en + 1);
    var p = JSON.parse(c);
    return {
      firstName: typeof p.firstName === 'string' ? p.firstName : '',
      lastName: typeof p.lastName === 'string' ? p.lastName : '',
      firm: typeof p.firm === 'string' ? p.firm : '',
      email: typeof p.email === 'string' ? p.email : '',
    };
  } catch (err) { return EMPTY; }
}

// ===========================================================================
// HubSpot sync
// ===========================================================================

/** Run once from the editor to schedule the nightly (~3 AM) sync. */
function setupNightlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncToHubSpot_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncToHubSpot_').timeBased().atHour(3).everyDays(1).create();
  Logger.log('Nightly HubSpot sync scheduled for ~3 AM (project timezone).');
}

/** Manual trigger for testing the sync from the editor. */
function runSyncNow() { syncToHubSpot_(); }

/** When a Leads row is edited by hand, clear synced_at so it re-syncs. */
function onEdit(e) {
  try {
    var sh = e.range.getSheet();
    if (sh.getName() !== LEADS_TAB) return;
    var startRow = e.range.getRow();
    var numRows = e.range.getNumRows();
    // If only the synced_at column was touched, ignore (avoid loops).
    if (e.range.getColumn() === COL_SYNCED_AT && e.range.getNumColumns() === 1) return;
    for (var r = 0; r < numRows; r++) {
      var row = startRow + r;
      if (row < 2) continue;
      sh.getRange(row, COL_SYNCED_AT).setValue('');
    }
  } catch (err) { /* simple triggers must not throw */ }
}

/** Push new/edited leads (synced_at empty) to HubSpot as contacts. */
function syncToHubSpot_() {
  var token = PropertiesService.getScriptProperties().getProperty('HUBSPOT_TOKEN');
  if (!token) { Logger.log('No HUBSPOT_TOKEN set — skipping.'); return; }

  var sheet = ss_().getSheetByName(LEADS_TAB);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) { Logger.log('No leads.'); return; }

  var owners = getOwnerMap_(token); // lowercased email -> ownerId
  var synced = 0, failed = 0;
  var now = new Date().toISOString();

  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[COL_SYNCED_AT - 1] || '').trim()) continue; // already synced

    var first = String(r[5] || '').trim();
    var last = String(r[6] || '').trim();
    var firm = String(r[7] || '').trim();
    var email = String(r[8] || '').trim();
    var eventName = String(r[10] || '').trim();
    var ownerField = String(r[11] || '').trim();
    var hubspotId = String(r[COL_HUBSPOT_ID - 1] || '').trim();
    if (!email && !first && !last && !firm) continue; // blank row

    var props = {};
    if (first) props.firstname = first;
    if (last) props.lastname = last;
    if (email) props.email = email;
    if (firm) props.company = firm;
    if (eventName) props[HS_EVENT_PROP] = eventName;
    if (ownerField) {
      var oid = owners[ownerField.toLowerCase()];
      if (oid) props.hubspot_owner_id = oid;
      else Logger.log('Row ' + (i + 1) + ': no HubSpot owner matches "' + ownerField + '"');
    }

    try {
      var id = upsertContact_(token, hubspotId, email, props);
      if (id) {
        sheet.getRange(i + 1, COL_SYNCED_AT).setValue(now);
        sheet.getRange(i + 1, COL_HUBSPOT_ID).setValue(id);
        synced++;
      }
    } catch (err) {
      failed++;
      Logger.log('Row ' + (i + 1) + ' sync failed: ' + err);
    }
  }
  Logger.log('HubSpot sync done. Synced: ' + synced + ', Failed: ' + failed);
}

/** Map of lowercased owner email -> HubSpot owner id. */
function getOwnerMap_(token) {
  var map = {};
  try {
    var res = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/owners/?limit=500', {
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
    });
    var json = JSON.parse(res.getContentText() || '{}');
    (json.results || []).forEach(function (o) {
      if (o.email) map[String(o.email).toLowerCase()] = o.id;
    });
  } catch (e) { Logger.log('Owners fetch failed: ' + e); }
  return map;
}

/**
 * Upsert a contact. Prefers update-by-id (if we already synced it), else
 * create-or-update by email, else a plain create for email-less leads.
 * Returns the HubSpot contact id.
 */
function upsertContact_(token, hubspotId, email, props) {
  var base = 'https://api.hubapi.com/crm/v3/objects/contacts';
  var headers = { Authorization: 'Bearer ' + token };

  if (hubspotId) {
    var pres = UrlFetchApp.fetch(base + '/' + encodeURIComponent(hubspotId), {
      method: 'patch', contentType: 'application/json', headers: headers,
      muteHttpExceptions: true, payload: JSON.stringify({ properties: props }),
    });
    return handleContactResponse_(pres, hubspotId);
  }

  if (email) {
    var bres = UrlFetchApp.fetch(base + '/batch/upsert', {
      method: 'post', contentType: 'application/json', headers: headers,
      muteHttpExceptions: true,
      payload: JSON.stringify({ inputs: [{ idProperty: 'email', id: email, properties: props }] }),
    });
    var code = bres.getResponseCode();
    var json = JSON.parse(bres.getContentText() || '{}');
    if (code >= 200 && code < 300 && json.results && json.results[0]) return json.results[0].id;
    throw new Error('upsert ' + code + ': ' + bres.getContentText());
  }

  var cres = UrlFetchApp.fetch(base, {
    method: 'post', contentType: 'application/json', headers: headers,
    muteHttpExceptions: true, payload: JSON.stringify({ properties: props }),
  });
  return handleContactResponse_(cres, null);
}

function handleContactResponse_(res, fallbackId) {
  var code = res.getResponseCode();
  var json = JSON.parse(res.getContentText() || '{}');
  if (code >= 200 && code < 300) return json.id || fallbackId;
  throw new Error(code + ': ' + res.getContentText());
}
