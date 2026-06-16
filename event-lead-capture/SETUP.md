# Event Lead Capture — setup (static + Apps Script)

A single static page (`event-lead-capture.html`, served at
`revenuekitchen.io/event-lead-capture.html`) backed by a Google Apps Script web
app bound to the lead Sheet. No Vercel, no Node server, no service-account key —
the script runs as you and is already authorized to the Sheet.

```
Lead's / rep's phone
        │  (fetch, text/plain — no CORS preflight)
        ▼
Apps Script web app  ──reads/writes──►  Google Sheet (Leads + Reps tabs)
        │
        └─ OCR: proxies the card image to the Anthropic API
                (ANTHROPIC_API_KEY stored in Script Properties)
```

## One-time setup

### 1. Create the Apps Script

1. Open the lead spreadsheet
   (`1dN-tOKbG1_3cAiaXEM_DyRVy4n18gaoZqXwvKZvi6RE`).
2. **Extensions → Apps Script**.
3. Delete the default `Code.gs` contents and paste in this folder's `Code.gs`.
4. Save (disk icon).

> The `SHEET_ID` at the top of `Code.gs` already points at your Sheet, so this
> also works as a standalone script if you'd rather create it from
> [script.google.com](https://script.google.com).

### 2. Add the Anthropic key (for card scanning)

1. In the Apps Script editor: **Project Settings** (gear icon) → scroll to
   **Script Properties** → **Add script property**.
2. Property: `ANTHROPIC_API_KEY`  ·  Value: your key from console.anthropic.com.
3. Save. (Skip this if you don't need card OCR yet — that flow just opens a blank
   form until the key is set.)

### 3. Deploy as a web app

1. **Deploy → New deployment**.
2. Gear next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. **Deploy**. Approve the permissions prompt (it needs access to the Sheet and
   to make external requests for OCR).
5. Copy the **Web app URL** — it ends in `/exec`.

> Re-deploying after a code change: **Deploy → Manage deployments → edit (pencil)
> → Version: New version → Deploy.** The `/exec` URL stays the same.

### 4. Point the page at it

Open `event-lead-capture.html` and replace the placeholder near the top:

```js
var APPS_SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE";
```

with your `/exec` URL.

### 5. Publish

Commit and push `sales-hub` — GitHub Pages serves it at
`https://revenuekitchen.io/event-lead-capture.html`.

```bash
git add event-lead-capture.html event-lead-capture/
git commit -m "Add event lead capture tool"
git push
```

## Using it

- **Reps:** open the page → pick your name (remembered on the device) → use the
  four tiles: My QR, Scan a card, Manual entry, Schedule.
- **Leads:** scan a rep's QR → it opens
  `event-lead-capture.html?capture=<rep_id>` → they fill the short form.
- **Roster & config** live in the Sheet's `Reps` tab. Fill in
  title/email/phone/company (powers the vCard) and `scheduling_link` (blank =
  the default link). Edits show up on the next page load.

## Notes

- The page talks to Apps Script with `Content-Type: text/plain` on purpose — it
  keeps requests "simple" so the browser skips the CORS preflight that Apps
  Script can't answer.
- The OCR model is `claude-sonnet-4-6` (in `Code.gs`, `OCR_MODEL`).
- This replaces the need for the Vercel/Next.js version and the Google
  service-account credentials for production.
