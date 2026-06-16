/**
 * Revenue Kitchen — Event Lead Capture (backend)
 * Google Apps Script web app. Reads the Reps tab, appends to the Leads tab,
 * and proxies business-card OCR to the Anthropic API.
 *
 * SETUP (see SETUP.md):
 *   1. Open the lead Sheet → Extensions → Apps Script. Paste this file.
 *   2. Project Settings → Script Properties → add ANTHROPIC_API_KEY (for OCR).
 *   3. Deploy → New deployment → Web app:
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      Copy the /exec URL into event-lead-capture.html (APPS_SCRIPT_URL).
 *
 * The page calls this with Content-Type text/plain so the browser skips the
 * CORS preflight — Apps Script web apps handle simple requests cross-origin.
 */

var SHEET_ID = '1dN-tOKbG1_3cAiaXEM_DyRVy4n18gaoZqXwvKZvi6RE';
var LEADS_TAB = 'Leads';
var REPS_TAB = 'Reps';
var DEFAULT_SCHEDULING_LINK = 'https://meetings.hubspot.com/sknudson/inbound-discovery';
var OCR_MODEL = 'claude-sonnet-4-6';

function ss_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

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
      rep_id: rep_id,
      name: name,
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

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'reps';
  if (action === 'reps') return jsonOut_({ reps: getReps_() });
  return jsonOut_({ error: 'Unknown action' });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ error: 'Invalid JSON' });
  }
  var action = body.action || '';
  if (action === 'lead') return jsonOut_(appendLead_(body));
  if (action === 'ocr') return jsonOut_(runOcr_(body));
  return jsonOut_({ error: 'Unknown action' });
}

function appendLead_(body) {
  var rep_id = String(body.rep_id || '').trim();
  var source = String(body.source || '').trim();
  if (!rep_id) return { error: 'Missing rep_id' };
  if (['qr', 'manual', 'card'].indexOf(source) === -1)
    return { error: 'Invalid source' };

  var first_name = String(body.first_name || '').trim();
  var last_name = String(body.last_name || '').trim();
  var firm = String(body.firm || '').trim();
  var email = String(body.email || '').trim();
  if (!first_name && !last_name && !firm && !email)
    return { error: 'Provide at least a name, firm, or email' };

  var contact_type = String(body.contact_type || '').trim();
  if (['Lead', 'Vendor', 'Partner', 'Client', 'Other'].indexOf(contact_type) === -1)
    contact_type = 'Lead';

  // Resolve the denormalized rep name from the roster.
  var reps = getReps_();
  var rep_name = '';
  for (var i = 0; i < reps.length; i++)
    if (reps[i].rep_id === rep_id) rep_name = reps[i].name;

  var sheet = ss_().getSheetByName(LEADS_TAB);
  if (!sheet) return { error: 'Leads tab missing' };

  sheet.appendRow([
    new Date().toISOString(), // timestamp, set server-side
    rep_id,
    rep_name,
    source,
    contact_type,
    first_name,
    last_name,
    firm,
    email,
    String(body.notes || '').trim(),
  ]);
  return { ok: true };
}

function runOcr_(body) {
  var EMPTY = { firstName: '', lastName: '', firm: '', email: '' };
  var image = String(body.image || '');
  if (!image) return EMPTY;

  var mediaType = body.mediaType || 'image/jpeg';
  var m = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/);
  if (m) {
    mediaType = m[1];
    image = m[2];
  }

  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return EMPTY; // fail soft: confirm form just opens blank

  var payload = {
    model: OCR_MODEL,
    max_tokens: 512,
    system:
      'Extract contact info from this business card or event badge. ' +
      'Return ONLY a JSON object with keys firstName, lastName, firm, email. ' +
      'Use empty strings for anything not present. No prose, no markdown.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: 'Extract the contact fields as JSON.' },
        ],
      },
    ],
  };

  try {
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var data = JSON.parse(res.getContentText());
    var text = '';
    if (data && data.content) {
      for (var i = 0; i < data.content.length; i++) {
        if (data.content[i].type === 'text') text += data.content[i].text;
      }
    }
    return parseFields_(text);
  } catch (err) {
    return EMPTY;
  }
}

function parseFields_(text) {
  var EMPTY = { firstName: '', lastName: '', firm: '', email: '' };
  try {
    var c = String(text || '').trim();
    c = c.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    var s = c.indexOf('{');
    var en = c.lastIndexOf('}');
    if (s !== -1 && en !== -1 && en > s) c = c.slice(s, en + 1);
    var p = JSON.parse(c);
    return {
      firstName: typeof p.firstName === 'string' ? p.firstName : '',
      lastName: typeof p.lastName === 'string' ? p.lastName : '',
      firm: typeof p.firm === 'string' ? p.firm : '',
      email: typeof p.email === 'string' ? p.email : '',
    };
  } catch (err) {
    return EMPTY;
  }
}
