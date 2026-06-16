# HubSpot sync — setup

Leads captured during the day are pushed to HubSpot as **Contacts** on a
**nightly** schedule (~3 AM). Sync is driven by the Apps Script — no extra tools.

- Contacts are **deduped by email** (create-or-update). Re-captures and edits
  update the same contact instead of making duplicates.
- Each contact gets an **Event Name** property (from the rep's selected event),
  so you can build a HubSpot **Active List / segment** per event.
- A **`contact_owner`** cell on the Leads tab, when filled with an owner's
  HubSpot login email, **overwrites** that contact's HubSpot owner. Left blank,
  ownership is untouched.
- Editing any lead row clears its `synced_at`, so the next nightly run
  re-pushes the updated version.

## What the sheet now has

`Leads` tab columns (added): `event_name`, `contact_owner`, `synced_at`,
`hubspot_id`. A new **`Events`** tab holds the dropdown list the app shows reps —
**replace the example row with your real event names** (one per row under the
`event_name` header). Keep names consistent — they become your HubSpot segments.

## One-time HubSpot setup

### 1. Create the Event Name property

HubSpot → **Settings → Properties → Contact properties → Create property**:
- **Label:** `Event Name`  (HubSpot sets the internal name to `event_name`)
- **Field type:** Single-line text (or Dropdown if you want a controlled list)

> If your internal name ends up different from `event_name`, update
> `HS_EVENT_PROP` at the top of `Code.gs` to match.

### 2. Create a Private App token

HubSpot → **Settings → Integrations → Private Apps → Create a private app**:
- **Scopes:** `crm.objects.contacts.read` and `crm.objects.contacts.write`
  (owner assignment also needs `crm.objects.owners.read` — add it if present).
- Create it, then **copy the access token**.

### 3. Give the script the token

Apps Script editor → **Project Settings (gear) → Script Properties → Add**:
- **Property:** `HUBSPOT_TOKEN`  ·  **Value:** the private-app token

### 4. Update the script + schedule the sync

1. Paste the latest `Code.gs` into the Apps Script editor and **save**.
2. **Re-deploy:** Deploy → Manage deployments → edit (pencil) → Version: **New
   version** → Deploy. (The `/exec` URL stays the same.)
3. Set the project time zone to Central: **Project Settings → Time zone →
   (GMT-06:00) Central Time**, so the nightly run fires ~3 AM Central.
4. In the editor, select **`setupNightlyTrigger`** from the function dropdown and
   click **Run** once. Approve permissions. This schedules the nightly sync.

## Testing it

- Add an event to the `Events` tab, capture a test lead in the app with that
  event selected (and a real email).
- In the Apps Script editor, run **`runSyncNow`** to push immediately instead of
  waiting for night. Check **Executions** / **Logs** for `Synced: N`.
- The lead's `synced_at` + `hubspot_id` fill in on the sheet, and the contact
  appears in HubSpot with the Event Name set.

## Building the segment

HubSpot → **Contacts → Lists → Create list → Active list**, filter:
**Event Name** *is any of* `Your Event Name`. That list auto-updates as the
nightly sync tags contacts.

## Notes / behavior

- **No email on a lead?** It's still pushed (created without dedup); the stored
  `hubspot_id` keeps later edits from duplicating it.
- **Owner not applied?** The `contact_owner` value must match a HubSpot user's
  email exactly. Mismatches are logged and skipped (the rest of the contact
  still syncs).
- **Printed QR leads** come in with a blank `event_name` — type the event into
  that row's cell later; the edit clears `synced_at` and the next nightly run
  tags the contact.
- **Re-run anytime:** `runSyncNow` only touches rows where `synced_at` is blank,
  so it's safe to run repeatedly.
