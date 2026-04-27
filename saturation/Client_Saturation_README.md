# Client Saturation Analysis

Geographic distribution of Rankings.io's active client base, broken down by HQ City and Metro area (Nielsen DMA). Use these resources to spot saturation hot spots, identify white-space markets, and inform sales territory and pitch decisions.

**Last updated:** April 27, 2026
**Data source:** HubSpot client export (`hubspot-crm-exports-clients-2026-04-27.csv`)
**Coverage:** 254 clients · 168 HQ cities · 84 metro areas · 38 states

---

## Resources

| File | Format | What it's for |
|---|---|---|
| `Client_Saturation_by_HQ_and_Metro.xlsx` | Excel | Sortable, filterable tables. Three sheets: Summary, By HQ City, By Metro. |
| `Client_Saturation_Map.html` | Interactive map | At-a-glance geographic view with hover tooltips and click-through client rosters per city. Open in any modern browser. |

---

## Methodology

**Why "HQ City" and not just "city"?** A law firm headquartered in Katy, TX is in a different competitive market than one in Houston, TX, even though they're 30 miles apart. We count saturation at the actual HQ city level so suburb-based firms aren't lumped in with downtown competitors.

**Why also include "Metro"?** Sometimes you need the bigger picture — a prospect asking "do you work with anyone else in my market?" usually means the DMA, not the literal city. The Metro view groups HQ cities by Nielsen DMA (e.g., Houston DMA includes Houston, Katy, Sugar Land, Bellaire, etc.).

**Saturation tiers — HQ City view:**

| Tier | Client Count |
|---|---|
| Very High | 5+ |
| High | 3–4 |
| Moderate | 2 |
| Low | 1 |
| Very Low | 0 |

**Saturation tiers — Metro view** (wider tiers since metros aggregate):

| Tier | Client Count |
|---|---|
| Very High | 7+ |
| High | 4–6 |
| Moderate | 2–3 |
| Low | 1 |

---

## Headline Findings

### Top HQ Cities

| Rank | HQ City | Clients | Saturation |
|---|---|---|---|
| 1 | Houston, TX | 10 | Very High |
| 2 | Los Angeles, CA | 9 | Very High |
| 3 | New York, NY | 6 | Very High |
| 3 | San Diego, CA | 6 | Very High |
| 3 | St. Louis, MO | 6 | Very High |
| 6 | Austin, TX | 5 | Very High |
| 7 | Chicago, IL | 4 | High |
| 7 | Dallas, TX | 4 | High |
| 7 | Indianapolis, IN | 4 | High |
| 7 | San Antonio, TX | 4 | High |

### Top Metro Areas (Nielsen DMA)

| Rank | Metro | Clients | Saturation |
|---|---|---|---|
| 1 | New York | 17 | Very High |
| 2 | Los Angeles | 16 | Very High |
| 3 | Houston | 12 | Very High |
| 4 | Miami–Fort Lauderdale | 10 | Very High |
| 4 | Tampa–St. Petersburg (Sarasota) | 10 | Very High |
| 6 | Dallas–Fort Worth | 9 | Very High |
| 7 | Chicago | 8 | Very High |
| 8 | San Diego | 7 | Very High |
| 8 | West Palm Beach–Fort Pierce | 7 | Very High |
| 10 | Atlanta | 6 | High |

### Distribution at a Glance

**HQ City tier breakdown:**

- **Very High (5+ clients):** 6 cities, 42 clients
- **High (3–4 clients):** 13 cities, 43 clients
- **Moderate (2 clients):** 19 cities, 38 clients
- **Low (1 client):** 130 cities, 130 clients

The long tail is real — most of our clients are the only Rankings.io firm in their HQ city. Saturation pressure (the "we already work with your competitor" conversation) is concentrated in roughly the top 20 markets.

---

## How to Use This

**Sales conversations.** Before a discovery call, check the prospect's HQ city in the Excel doc. If saturation is "Very High" in their city — and especially if it's "Very High" in their metro — you'll likely need to address the conflict-of-interest question proactively. If it's "Low" or "Very Low," lean into it: "We don't currently work with any other firms in [their city]."

**Territory and white-space planning.** The Metro view surfaces DMAs where we have zero or near-zero presence. Big metros at "Low" or "Moderate" are candidate targets for outbound focus.

**Pitch deck stats.** "Working with X firms across Y cities and Z states" pulls cleanly from the Summary sheet of the Excel doc. Numbers update as the source export is refreshed.

---

## Data Quality Notes

A few records in the HubSpot export needed cleanup before this analysis was reliable. These were corrected in the report but should also be cleaned up at the source:

- **5 clients had blank or scrambled HQ city/state in HubSpot:** Lawton Legal Practice (Phoenix, AZ), Law Bear (Phoenix, AZ), Kirsch & Kirsch, LLC (Jefferson City, MO), Berger & Hicks, P.A. (Miami, FL), and The Cagle Law Firm (Austin, TX — the original record had Missouri as state and a UK postal code).
- **Inconsistent state formatting:** Some records used 2-letter codes (`TX`), others used full state names (`Texas`). Both are normalized to 2-letter in this report.
- **One record had `State/Region = "National"`** (Kayla's Survivors). Treated as St. Louis, MO based on the city field.
- **One record (1 of 254) could not be placed on the map** because no city/state could be inferred from the HubSpot row.

If the underlying HubSpot data is cleaned up, these notes go away and the numbers shift slightly.

---

## Refreshing the Report

To regenerate with a current HubSpot export:

1. Export clients from HubSpot using the same column set (Record ID, Company name, City, State/Region, Location, etc.).
2. Drop the new CSV in place of the existing source file.
3. Re-run the build pipeline (or hand the new export off to whoever owns this report).

The DMA mapping is sourced from `Rankings_Saturation_Report_-_03_04_26.xlsx` (the broader market saturation report), which already contains a `DMA Mapping` sheet covering 162 cities. New HQ cities not in that mapping fall through to a manually maintained fallback list.

---

*Maintained by Revenue Operations. Questions or corrections — ping Scott.*
