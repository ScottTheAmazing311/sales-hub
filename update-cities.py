import csv

INPUT = '/Users/homebase/sales-hub/lawfirm-data-updated.csv'
OUTPUT = '/Users/homebase/sales-hub/lawfirm-data-updated.csv'

# Results from Google searches: {row_index: (city, hq_possible)}
# row_index is 0-based data index (header excluded)
search_results = {
    # Previously missing - now found via Google
    4:   ('Pasadena', 'Los Angeles'),           # Olen Firm
    11:  ('Houston', ''),                        # Havens & Associates
    20:  ('Clifton', ''),                        # Cohen & Bernstein
    26:  ('Abilene', 'San Angelo'),              # Law Offices of David M. White
    28:  ('New York', ''),                       # The Perecman Firm
    29:  ('McLean', 'Savannah'),                 # The Atlantic Law Firm
    34:  ('Reisterstown', ''),                   # Law Offices of David Ellin
    62:  ('Cape Girardeau', ''),                 # Cook, Barkett, Ponder & Wolz
    65:  ('New York', 'Elmhurst'),               # Omrani & Taub
    73:  ('Oklahoma City', 'Tulsa'),             # Carr & Carr
    90:  ('Pittsburgh', 'White Oak'),            # Pribanic & Pribanic
    91:  ('Clinton', ''),                        # Law Offices of Bailey and Burke
    92:  ('Bradenton', 'Sarasota'),              # Legler Murphy & Battaglia
    110: ('Greenville', ''),                     # FR Law LLC
    113: ('Houston', 'Austin'),                  # Lowenberg Law Firm
    116: ('Pasadena', 'San Mateo'),              # Trust Law Partners
    122: ('Toronto', ''),                        # Preszler Injury Lawyers
    125: ('Cedarburg', ''),                      # Michael Johnson Legal
    146: ('San Francisco', 'Berkeley; San Jose'), # Law Offices of Alex Bonilla
    148: ('Austin', ''),                         # Ramos James Law
    158: ('Fort Worth', ''),                     # Stephens Law
    180: ('Delray Beach', 'Jacksonville'),       # The Russo Firm
    182: ('Puyallup', 'Portland; Olympia'),      # Jacobs and Jacobs
    206: ('Kitchener', ''),                      # Harris Law Personal Injury
    208: ('Scottsdale', ''),                     # BTL Family Law
    209: ('Austin', 'Dallas'),                   # Lemon Lawyers
    210: ('Mesa', ''),                           # Udall Shumway
    219: ('Pikeville', ''),                      # Billy Johnson Law
    221: ('Yakima', ''),                         # Kapuza Lighty
    222: ('', ''),                               # Gonzalez & Havens - not found
    223: ('New York', 'Elmwood Park; Sugar Land'), # Onal Gallant
    224: ('St. Louis', ''),                      # Brown & Crouppen (HQ Arnold but St. Louis area)
    234: ('Halifax', ''),                        # Wagners Law Firm
    242: ('Miami', ''),                          # Berger & Hicks
    244: ('Thibodaux', 'Houma'),                 # Ory Law Group
    249: ('Elmwood Park', 'New York'),           # Onal Injury Law
    252: ('Augusta', ''),                        # The Hawk Firm
}

# Alternative locations for firms that already had cities (found during scraping)
alt_locations = {
    # Some firms where scrape found one city but Google shows alternatives
    5:   ('', 'San Diego'),        # Tropea McMillan - scraped "A San Diego", already fixed to San Diego
    16:  ('', 'Indianapolis'),     # Yosha Law - scraped South Bend, also Indianapolis
    100: ('', 'Peekskill'),        # Pollack Pollack - set to Manhattan, also Peekskill
    # Firms with multiple offices visible from scraping
}

with open(INPUT, newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    rows = list(reader)

# Add HQ Possible column header
header = rows[0]
if len(header) <= 4 or header[4] != 'HQ Possible':
    header.insert(4, 'HQ Possible')
    for row in rows[1:]:
        row.insert(4, '')

# Apply search results
for idx, (city, alt) in search_results.items():
    row = rows[idx + 1]  # +1 for header
    if city and not row[3].strip():
        row[3] = city
    if alt:
        row[4] = alt

# Apply alt locations for existing firms
for idx, (_, alt) in alt_locations.items():
    row = rows[idx + 1]
    if alt and not row[4].strip():
        row[4] = alt

with open(OUTPUT, 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerows(rows)

# Stats
filled = sum(1 for r in rows[1:] if r[3].strip())
empty = sum(1 for r in rows[1:] if not r[3].strip())
alts = sum(1 for r in rows[1:] if r[4].strip())
print(f"Cities filled: {filled}/{len(rows)-1}")
print(f"Still empty: {empty}")
print(f"HQ Possible entries: {alts}")
