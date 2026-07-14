/**
 * hubspot-sync.gs — HubSpot → Client Saturation sync
 * ---------------------------------------------------------------------------
 * Bind this script to the Client Saturation Google Sheet
 * (Extensions → Apps Script). It runs on an hourly time trigger and:
 *
 *   1. Pulls the current client roster from HubSpot (Companies).
 *   2. Reconciles the "Master Client List" tab:
 *        - marks churned clients inactive (Status = Churned + Churn Date),
 *        - adds newly-onboarded customers,
 *        - refreshes MRR (and optionally owner / practice area).
 *   3. Recomputes the "City Saturation" aggregates from the ACTIVE rows.
 *
 * The map (Client_Saturation_Map.html) already reads the sheet live via the
 * gviz endpoint, so the visual updates on its next load. Nothing else to wire.
 *
 * SETUP (one time):
 *   1. Create a HubSpot Private App with scope `crm.objects.companies.read`
 *      (and `crm.objects.owners.read` if you want owner names). Super-admin only.
 *   2. In Apps Script: Project Settings → Script Properties → add
 *        HUBSPOT_TOKEN = <the private app token>
 *      (Do NOT paste the token into this file — Script Properties keeps it
 *       out of source control and out of the sheet.)
 *   3. Run `discoverProperties()` once and read the Execution Log. Copy the
 *      exact internal property names into CONFIG.HS_PROPS below.
 *   4. Run `runSync()` manually once to verify, then run `installTrigger()`
 *      to schedule the hourly job.
 * ---------------------------------------------------------------------------
 */

// ============================ CONFIG ========================================
const CONFIG = {
  // Exact tab (sheet) names — must match the Google Sheet.
  MASTER_TAB: 'Client List',
  CITY_TAB: 'City Saturation',
  MASTER_HEADER_ROW: 1, // row number that holds the master-list column headers
  CITY_HEADER_ROW: 1,   // row number that holds the city-tab column headers

  // City Saturation is a static tab (confirmed: A5 holds a plain city name, not
  // a =QUERY), so the sync owns it: each run it's recomputed from the ACTIVE
  // Client List rows (churn excluded, states normalized to 2-letter).
  REBUILD_CITY_TAB: true,

  // Don't overwrite manually-cleaned City/State/Classification with HubSpot
  // values (the README documents hand-cleanup of messy HubSpot geo data).
  PRESERVE_MANUAL_GEO: true,
  PRESERVE_CLASSIFICATION: true,

  // If a sheet client is NOT returned by the HubSpot client query, should we
  // auto-mark it churned? Default false = flag for review instead, so a wrong
  // filter can't mass-churn the list. Flip to true once you trust the filter.
  AUTO_CHURN_MISSING: false,

  // Which HubSpot companies count as "clients". We key off "Customer Type":
  // any company that has a Customer Type set is a client (Active Website /
  // Active Project = active, Previous Client = churned). HAS_PROPERTY pulls all
  // three so churned clients get marked too.
  HS_CLIENT_FILTER: { propertyName: 'customer_type', operator: 'HAS_PROPERTY' },

  // HubSpot company property INTERNAL names. Run discoverProperties() to confirm
  // the exact names (the label "Customer Type" may map to a different internal
  // name) and adjust any that don't match.
  HS_PROPS: {
    domain: 'domain',
    website: 'website',            // fallback match key (some customers have a
                                   // blank Company Domain but a filled Website)
    name: 'name',
    ownerId: 'hubspot_owner_id',
    practiceArea: 'primary_practice_area',
    mrr: 'deal_mrr',               // company-level MRR rollup (best available)
    city: 'city',
    state: 'state',
    classification: 'pi_or_nonpi', // "PI or Non-PI" — authoritative source of truth
    clientStatus: 'customer_type', // "Customer Type"
    churnDate: '',                 // no churn-date field; we stamp detection date.
  },

  // Map the HubSpot "PI or Non-PI" stored values -> the labels the sheet/map use.
  // Note: the "PI-MVA" option is stored internally as "PI". Unlisted values pass
  // through unchanged.
  CLASSIFICATION_MAP: { 'PI': 'PI-MVA', 'PI-Other': 'PI-Other', 'Non-PI': 'Non-PI' },

  // "Customer Type" values that mean CHURNED. In HubSpot the "Previous Client"
  // option is stored with the internal value "Churned"; Active Website / Active
  // Project count as active. Matching ignores case/spaces/underscores.
  CHURNED_STATUS_VALUES: ['Churned'],
};

// Master Client List column positions (1-based). Adjust if columns move.
// Cols A–J already exist; K–M are added by this script if missing.
const COL = {
  url: 1, altUrl: 2, name: 3, owner: 4, practiceArea: 5, mrr: 6,
  city: 7, state: 8, metro: 9, classification: 10,
  status: 11, churnDate: 12, lastSynced: 13,
};

const HS_BASE = 'https://api.hubapi.com';

// ============================ ENTRY POINTS ==================================

/** Main job — run on the hourly trigger. */
function runSync() {
  const token = getToken_();
  const owners = fetchOwners_(token);
  const companies = fetchClientCompanies_(token);
  Logger.log('Fetched %s client companies from HubSpot.', companies.length);

  const result = reconcileMaster_(companies, owners);
  Logger.log('Master list: %s updated, %s added, %s churned, %s flagged, %s marked duplicate.',
    result.updated, result.added, result.churned, result.flagged, result.dups);

  const metroFilled = fillMetro_();
  Logger.log('Metro auto-filled on %s blank rows.', metroFilled);

  if (CONFIG.REBUILD_CITY_TAB) {
    const n = rebuildCityTab_();
    Logger.log('City Saturation tab rebuilt: %s cities.', n);
  }
}

/** Install the hourly time-driven trigger (run once). */
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'runSync')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runSync').timeBased().everyHours(1).create();
  Logger.log('Hourly trigger installed for runSync().');
}

/** List HubSpot company properties (name + label) to fill CONFIG.HS_PROPS.
 *  For dropdown/enum properties it also prints each option's internal value,
 *  so you can confirm exactly how e.g. "Previous Client" is stored. */
function discoverProperties() {
  const token = getToken_();
  const res = hsRequest_('GET', '/crm/v3/properties/companies', null, token);
  res.results
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(p => {
      Logger.log('%s   (%s)', p.name, p.label);
      if (p.options && p.options.length) {
        p.options.forEach(o => Logger.log('      option: "%s"  =  value: "%s"', o.label, o.value));
      }
    });
  Logger.log('--- %s properties. Copy internal names (left) into CONFIG.HS_PROPS, ' +
             'and the churned option value into CHURNED_STATUS_VALUES. ---', res.results.length);
}

// ============================ HUBSPOT ========================================

function getToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('HUBSPOT_TOKEN');
  if (!token) throw new Error('Missing HUBSPOT_TOKEN in Script Properties (Project Settings).');
  return token;
}

function hsRequest_(method, path, payload, token) {
  const opts = {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  };
  if (payload) opts.payload = JSON.stringify(payload);
  const resp = UrlFetchApp.fetch(HS_BASE + path, opts);
  const code = resp.getResponseCode();
  if (code === 429) { Utilities.sleep(1000); return hsRequest_(method, path, payload, token); }
  if (code < 200 || code >= 300) {
    throw new Error('HubSpot ' + method + ' ' + path + ' → ' + code + ': ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText());
}

/** Resolve HubSpot owner ids → "First Last". */
function fetchOwners_(token) {
  const map = {};
  try {
    let after = null;
    do {
      const q = after ? ('?after=' + after + '&limit=100') : '?limit=100';
      const res = hsRequest_('GET', '/crm/v3/owners' + q, null, token);
      (res.results || []).forEach(o => {
        map[o.id] = [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || o.email || '';
      });
      after = res.paging && res.paging.next ? res.paging.next.after : null;
    } while (after);
  } catch (e) {
    Logger.log('Owner lookup skipped: %s', e.message);
  }
  return map;
}

/** Set of internal property names that actually exist on Company. */
function fetchValidPropertyNames_(token) {
  const res = hsRequest_('GET', '/crm/v3/properties/companies', null, token);
  const set = {};
  (res.results || []).forEach(p => { set[p.name] = true; });
  return set;
}

/** Pull all client companies via the CRM Search API (paginated). */
function fetchClientCompanies_(token) {
  const P = CONFIG.HS_PROPS;
  const valid = fetchValidPropertyNames_(token);
  const wanted = [P.domain, P.website, P.name, P.ownerId, P.practiceArea, P.mrr,
                  P.city, P.state, P.classification, P.clientStatus, P.churnDate]
                  .filter(Boolean);
  const properties = wanted.filter(name => valid[name]);
  const missing = wanted.filter(name => !valid[name]);
  if (missing.length) {
    Logger.log('WARNING: these CONFIG.HS_PROPS names do not exist on Company and ' +
               'were skipped — fix them via discoverProperties(): %s', missing.join(', '));
  }
  const out = [];
  let after = null;
  do {
    const body = {
      filterGroups: [{ filters: [CONFIG.HS_CLIENT_FILTER] }],
      properties: properties,
      limit: 100,
    };
    if (after) body.after = after;
    const res = hsRequest_('POST', '/crm/v3/objects/companies/search', body, token);
    (res.results || []).forEach(r => out.push(r.properties || {}));
    after = res.paging && res.paging.next ? res.paging.next.after : null;
  } while (after);
  return out;
}

// ============================ RECONCILE ======================================

function reconcileMaster_(companies, owners) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CONFIG.MASTER_TAB);
  if (!sh) throw new Error('Tab not found: ' + CONFIG.MASTER_TAB);

  ensureColumnHeaders_(sh);

  const headerRow = CONFIG.MASTER_HEADER_ROW;
  const firstData = headerRow + 1;
  const lastRow = sh.getLastRow();
  const width = Math.max(COL.lastSynced, sh.getLastColumn());
  const range = lastRow >= firstData
    ? sh.getRange(firstData, 1, lastRow - firstData + 1, width)
    : null;
  const values = range ? range.getValues() : [];

  const P = CONFIG.HS_PROPS;
  const now = new Date();
  const churnedSet = CONFIG.CHURNED_STATUS_VALUES.map(normStatus_);

  // Index every HubSpot company by ALL of its domains (Company Domain + Website),
  // so a firm that owns multiple domains still matches. Track churn per company.
  const hsIndex = {}; // normalized domain -> company index
  const companyChurned = companies.map(c =>
    churnedSet.indexOf(normStatus_(c[P.clientStatus])) !== -1);
  const companyMatched = companies.map(() => false);
  companies.forEach((c, ci) => {
    [normDomain_(c[P.domain]), normDomain_(c[P.website])].forEach(d => {
      if (d && !(d in hsIndex)) hsIndex[d] = ci;
    });
  });

  let updated = 0, added = 0, churned = 0, flagged = 0, dups = 0;

  // Pass 1a — resolve each row's matching HubSpot company. A row matches if
  // EITHER its URL or Alternative URL corresponds to a company (multi-domain
  // firms). Track match quality: 2 = matched on primary URL, 1 = only on Alt URL.
  const rowMatch = values.map(row => {
    const primary = normDomain_(row[COL.url - 1]);
    const alt = normDomain_(row[COL.altUrl - 1]);
    let ci = -1;
    [primary, alt].filter(Boolean).forEach(d => {
      if (!(d in hsIndex)) return;
      const cand = hsIndex[d];
      // Prefer an active match over a churned one when the two domains disagree.
      if (ci === -1 || (companyChurned[ci] && !companyChurned[cand])) ci = cand;
    });
    if (ci === -1) return { ci: -1, quality: 0 };
    return { ci, quality: (primary && hsIndex[primary] === ci) ? 2 : 1 };
  });

  // Pass 1b — pick ONE winner row per HubSpot company (highest match quality,
  // ties → first). Any other row matching the same company is a duplicate.
  const winnerRow = {};
  rowMatch.forEach((m, i) => {
    if (m.ci === -1) return;
    const cur = winnerRow[m.ci];
    if (cur === undefined || m.quality > rowMatch[cur].quality) winnerRow[m.ci] = i;
  });

  // Pass 1c — apply status and field updates.
  values.forEach((row, i) => {
    const m = rowMatch[i];

    if (m.ci === -1) {
      // Not in HubSpot on either domain — flag for review (never auto-churn here).
      if (!normDomain_(row[COL.url - 1]) && !normDomain_(row[COL.altUrl - 1])) return;
      const cur = String(row[COL.status - 1] || '');
      if (CONFIG.AUTO_CHURN_MISSING) {
        if (cur !== 'Churned') {
          row[COL.status - 1] = 'Churned';
          if (!row[COL.churnDate - 1]) row[COL.churnDate - 1] = now;
          churned++;
        }
      } else if (cur !== 'Churned' && cur !== 'Review — not in HubSpot') {
        row[COL.status - 1] = 'Review — not in HubSpot';
        flagged++;
      }
      return;
    }

    if (winnerRow[m.ci] !== i) {
      // Another sheet row already represents this HubSpot company (e.g. a firm
      // listed under two domains, one as URL and one as Alt URL). Mark this row
      // a duplicate so it stops double-counting. Self-heals if the winner is
      // removed (the survivor becomes the winner next run).
      if (String(row[COL.status - 1] || '') !== 'Duplicate') dups++;
      row[COL.status - 1] = 'Duplicate';
      row[COL.lastSynced - 1] = now;
      return;
    }

    companyMatched[m.ci] = true;
    const c = companies[m.ci];
    const isChurned = companyChurned[m.ci];
    const ownerName = owners[c[P.ownerId]] || '';

    // Status is the ONLY field HubSpot is authoritative over on existing rows.
    row[COL.status - 1] = isChurned ? 'Churned' : 'Active';
    row[COL.churnDate - 1] = isChurned ? (row[COL.churnDate - 1] || now) : '';
    row[COL.lastSynced - 1] = now;
    // Classification is authoritative from HubSpot: overwrite whenever HubSpot
    // has a value (leaves the cell alone if HubSpot's is empty).
    const cls = mapClass_(c[P.classification]);
    if (cls) row[COL.classification - 1] = cls;
    // Everything else: fill only when the sheet cell is empty — never clobber
    // manually-maintained data (MRR, geo cleanup, owner).
    if (!row[COL.owner - 1] && ownerName) row[COL.owner - 1] = ownerName;
    if (!row[COL.practiceArea - 1] && c[P.practiceArea]) row[COL.practiceArea - 1] = c[P.practiceArea];
    if (!row[COL.mrr - 1] && toNumber_(c[P.mrr]) > 0) row[COL.mrr - 1] = toNumber_(c[P.mrr]);
    if (!row[COL.city - 1] && c[P.city]) row[COL.city - 1] = c[P.city];
    if (!row[COL.state - 1] && c[P.state]) row[COL.state - 1] = c[P.state];
    updated++;
    if (isChurned) churned++;
  });

  // Pass 2 — HubSpot customers with no matching sheet row become new rows.
  // Only add ACTIVE ones; no value in importing a brand-new already-churned firm.
  const appends = [];
  companies.forEach((c, ci) => {
    if (companyMatched[ci] || companyChurned[ci]) return;
    const domain = c[P.domain] || c[P.website] || '';
    if (!normDomain_(domain)) return;
    const row = new Array(width).fill('');
    row[COL.url - 1] = domain;
    row[COL.name - 1] = c[P.name] || '';
    row[COL.owner - 1] = owners[c[P.ownerId]] || '';
    row[COL.practiceArea - 1] = c[P.practiceArea] || '';
    row[COL.mrr - 1] = toNumber_(c[P.mrr]);
    row[COL.city - 1] = c[P.city] || '';
    row[COL.state - 1] = c[P.state] || '';
    row[COL.classification - 1] = mapClass_(c[P.classification]);
    row[COL.status - 1] = 'Active';
    row[COL.lastSynced - 1] = now;
    appends.push(row);
    added++;
  });

  // Write updates back in one batch, then append new rows.
  if (range) range.setValues(values);
  if (appends.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appends.length, width).setValues(appends);
  }
  return { updated, added, churned, flagged, dups };
}

/** Add K/L/M headers if they aren't there yet. */
function ensureColumnHeaders_(sh) {
  const headerRow = CONFIG.MASTER_HEADER_ROW;
  const need = [
    [COL.status, 'Status'],
    [COL.churnDate, 'Churn Date'],
    [COL.lastSynced, 'Last Synced'],
  ];
  need.forEach(([col, label]) => {
    const cell = sh.getRange(headerRow, col);
    if (!String(cell.getValue()).trim()) cell.setValue(label);
  });
}

// ============================ CITY AGGREGATES ================================

function rebuildCityTab_() {
  const ss = SpreadsheetApp.getActive();
  const master = ss.getSheetByName(CONFIG.MASTER_TAB);
  const city = ss.getSheetByName(CONFIG.CITY_TAB);
  if (!city) throw new Error('Tab not found: ' + CONFIG.CITY_TAB);

  const firstData = CONFIG.MASTER_HEADER_ROW + 1;
  const lastRow = master.getLastRow();
  if (lastRow < firstData) return 0;
  const rows = master.getRange(firstData, 1, lastRow - firstData + 1, COL.lastSynced).getValues();

  const byCity = {};
  rows.forEach(r => {
    const st = String(r[COL.status - 1]);
    if (st === 'Churned' || st === 'Duplicate') return; // active, de-duplicated only
    const name = String(r[COL.name - 1]).trim();
    const c = String(r[COL.city - 1]).trim();
    const s = stateAbbr_(r[COL.state - 1]); // normalize "New Mexico" -> "NM"
    if (!name || !c) return;
    const key = c + '|' + s;
    if (!byCity[key]) byCity[key] = { city: c, state: s, firms: [] };
    byCity[key].firms.push({
      name: name,
      classification: String(r[COL.classification - 1]).trim(),
      mrr: toNumber_(r[COL.mrr - 1]),
    });
  });

  const out = Object.keys(byCity).sort().map(key => {
    const g = byCity[key];
    const mva = g.firms.filter(f => f.classification === 'PI-MVA');
    const other = g.firms.filter(f => f.classification === 'PI-Other');
    const nonpi = g.firms.filter(f => f.classification === 'Non-PI');
    const total = g.firms.length;
    const mvaMrr = mva.reduce((s, f) => s + f.mrr, 0);
    const under10k = g.firms.filter(f => f.mrr > 0 && f.mrr < 10000).map(f => f.name);
    return [
      g.city, g.state, total, mva.length, other.length, nonpi.length,
      saturationLevel_(total), mvaMrr,
      mva.map(f => f.name).sort().join(', '),
      under10k.sort().join(', '),
    ];
  });

  // Clear old data rows (keep header) and write fresh aggregates (cols A–J).
  const cityFirst = CONFIG.CITY_HEADER_ROW + 1;
  const cityLast = city.getLastRow();
  if (cityLast >= cityFirst) city.getRange(cityFirst, 1, cityLast - cityFirst + 1, 10).clearContent();
  if (out.length) city.getRange(cityFirst, 1, out.length, 10).setValues(out);
  return out.length;
}

/** Client-count → saturation level (matches README HQ-city tiers). */
function saturationLevel_(count) {
  if (count >= 5) return 4; // Very High
  if (count >= 3) return 3; // High
  if (count === 2) return 2; // Moderate
  if (count === 1) return 1; // Low
  return 0;
}

// ============================ HELPERS ========================================

/** Normalize a status/enum value for comparison (ignore case/spaces/underscores). */
function normStatus_(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const STATE_ABBR = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
  'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
  'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
  'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
  'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC',
};

/** Map a HubSpot "PI or Non-PI" value to the sheet/map label (e.g. PI -> PI-MVA). */
function mapClass_(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  return CONFIG.CLASSIFICATION_MAP[s] || s;
}

/** Normalize a state to its 2-letter code ("New Mexico" -> "NM"). */
function stateAbbr_(v) {
  const s = String(v == null ? '' : v).trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_ABBR[s.toLowerCase()] || s;
}

function normDomain_(v) {
  if (!v) return '';
  return String(v).trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/\s+/g, '');
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  // HubSpot date props are epoch millis or ISO strings.
  const n = Number(v);
  if (!isNaN(n) && String(v).length >= 10) return new Date(n);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ============================ METRO / DMA FILL ==============================

// City -> Nielsen DMA fallback for cities not already tagged in the sheet.
// Keyed by "city_lowercase|ST". Suburbs roll up to their metro's DMA.
const CITY_METRO = {
  'lexington|KY': 'Lexington',
  'cherry hill|NJ': 'Philadelphia',
  'philadelphia|PA': 'Philadelphia',
  'lugoff|SC': 'Columbia, SC',
  'savannah|GA': 'Savannah',
  'williamsport|PA': 'Wilkes Barre-Scranton',
  'salt lake city|UT': 'Salt Lake City',
  'macon|GA': 'Macon',
  'mill valley|CA': 'San Francisco-Oakland-San Jose',
  'providence|RI': 'Providence-New Bedford',
  'winston salem|NC': 'Greensboro-High Point-Winston Salem',
  'winston salem nc|NC': 'Greensboro-High Point-Winston Salem',
  'albuquerque|NM': 'Albuquerque-Santa Fe',
  'peoria|IL': 'Peoria-Bloomington',
  'east orange|NJ': 'New York',
  'downey|CA': 'Los Angeles',
  'oklahoma city|OK': 'Oklahoma City',
  'palos heights|IL': 'Chicago',
  'sherman oaks|CA': 'Los Angeles',
  'new york city|NY': 'New York',
  'chicago|IL': 'Chicago',
};

/** Look up a metro by city+state from the fallback table. */
function metroFor_(city, st) {
  const key = String(city || '').trim().toLowerCase() + '|' + String(st || '').trim().toUpperCase();
  return CITY_METRO[key] || '';
}

/** Fill blank Metro/DMA on active rows: first from city+state pairs already
 *  tagged elsewhere in the sheet, then from the CITY_METRO fallback. Never
 *  overwrites an existing metro. Returns the number filled. */
function fillMetro_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.MASTER_TAB);
  const firstData = CONFIG.MASTER_HEADER_ROW + 1;
  const lastRow = sh.getLastRow();
  if (lastRow < firstData) return 0;
  const rng = sh.getRange(firstData, 1, lastRow - firstData + 1, COL.lastSynced);
  const vals = rng.getValues();

  // Learn "city|ST" -> metro from rows that already have a metro.
  const learned = {};
  vals.forEach(r => {
    const m = String(r[COL.metro - 1] || '').trim();
    if (!m) return;
    const key = String(r[COL.city - 1] || '').trim().toLowerCase() + '|' + stateAbbr_(r[COL.state - 1]);
    if (!(key in learned)) learned[key] = m;
  });

  let filled = 0;
  vals.forEach(r => {
    if (String(r[COL.status - 1]) !== 'Active') return;
    if (String(r[COL.metro - 1] || '').trim()) return;
    const city = String(r[COL.city - 1] || '').trim();
    const st = stateAbbr_(r[COL.state - 1]);
    const m = learned[city.toLowerCase() + '|' + st] || metroFor_(city, st);
    if (m) { r[COL.metro - 1] = m; filled++; }
  });
  if (filled) rng.setValues(vals);
  return filled;
}

/** Manual entry point: fill blank metros and log the result. */
function fillMetro() {
  Logger.log('Metro filled on %s blank rows.', fillMetro_());
}

// ============================ MAINTENANCE ===================================

/** One-off: highlight active rows missing Classification so they're easy to
 *  find and fill. Colors the Metro (I) and Classification (J) cells orange. */
function highlightUnmarked() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.MASTER_TAB);
  const firstData = CONFIG.MASTER_HEADER_ROW + 1;
  const lastRow = sh.getLastRow();
  if (lastRow < firstData) return;
  const rows = sh.getRange(firstData, 1, lastRow - firstData + 1, COL.lastSynced).getValues();
  let n = 0;
  rows.forEach((r, i) => {
    if (String(r[COL.status - 1]) === 'Active' && !String(r[COL.classification - 1]).trim()) {
      sh.getRange(firstData + i, COL.metro, 1, 2).setBackground('#F8CBAD'); // cols I:J
      n++;
    }
  });
  Logger.log('Highlighted %s unmarked active rows.', n);
}

/** Undo the highlighting from highlightUnmarked() once the cells are filled. */
function clearHighlights() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.MASTER_TAB);
  const firstData = CONFIG.MASTER_HEADER_ROW + 1;
  const lastRow = sh.getLastRow();
  if (lastRow >= firstData) sh.getRange(firstData, COL.metro, lastRow - firstData + 1, 2).setBackground(null);
}
