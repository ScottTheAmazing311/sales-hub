#!/usr/bin/env python3
"""Scrape HQ city from law firm websites and update CSV."""

import csv
import re
import urllib.request
import urllib.error
import ssl
import sys
import time
from urllib.parse import urlparse

INPUT = '/Users/homebase/sales-hub/lawfirm-data.csv'
OUTPUT = '/Users/homebase/sales-hub/lawfirm-data-updated.csv'

# Common US states for pattern matching
STATES = [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
    'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
    'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
    'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
    'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
    'District of Columbia'
]

STATE_ABBREVS = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC'
]

# Build regex patterns
state_pattern = '|'.join(re.escape(s) for s in STATES)
abbrev_pattern = '|'.join(re.escape(s) for s in STATE_ABBREVS)

# City, State patterns (e.g., "Austin, TX" or "Austin, Texas")
city_state_re = re.compile(
    r'([A-Z][a-zA-Z\s\.]{1,30}?),\s*(' + abbrev_pattern + r')\b',
    re.MULTILINE
)
city_state_full_re = re.compile(
    r'([A-Z][a-zA-Z\s\.]{1,30}?),\s*(' + state_pattern + r')\b',
    re.MULTILINE
)

# Address-like patterns with zip
address_re = re.compile(
    r'([A-Z][a-zA-Z\s\.]{1,30}?),\s*(' + abbrev_pattern + r')\s+\d{5}',
    re.MULTILINE
)

# Skip these "cities" that are actually noise
SKIP_WORDS = {
    'suite', 'floor', 'building', 'bldg', 'office', 'po box', 'p.o.',
    'null', 'none', 'n/a', 'test', 'click', 'call', 'free', 'learn',
    'practice', 'personal', 'criminal', 'family', 'estate', 'employment',
    'about', 'contact', 'home', 'blog', 'news', 'review', 'case',
    'attorney', 'lawyer', 'law', 'legal', 'injury', 'defense',
    'january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'copyright', 'rights reserved', 'privacy', 'disclaimer',
}

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def normalize_url(url):
    url = url.strip()
    if not url:
        return ''
    if not url.startswith('http'):
        url = 'https://' + url
    return url


def fetch_page(url, timeout=10):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    })
    resp = urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx)
    data = resp.read(500000)  # Read up to 500KB
    # Try to decode
    for enc in ['utf-8', 'latin-1', 'ascii']:
        try:
            return data.decode(enc)
        except:
            continue
    return data.decode('utf-8', errors='replace')


def strip_tags(html):
    """Rough HTML to text."""
    # Remove script/style
    text = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
    # Replace tags with spaces
    text = re.sub(r'<[^>]+>', ' ', text)
    # Decode common entities
    text = text.replace('&amp;', '&').replace('&nbsp;', ' ').replace('&#39;', "'")
    text = re.sub(r'&[a-z]+;', ' ', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text)
    return text


def is_valid_city(city):
    city_lower = city.strip().lower()
    if len(city_lower) < 2 or len(city_lower) > 35:
        return False
    for skip in SKIP_WORDS:
        if skip in city_lower:
            return False
    # Must start with a letter
    if not city_lower[0].isalpha():
        return False
    # Should not be all caps unless short (like "LA")
    if city.isupper() and len(city) > 3:
        return False
    return True


def extract_city(html):
    """Extract city from HTML content."""
    text = strip_tags(html)

    # Try address with zip first (most reliable)
    for m in address_re.finditer(text):
        city = m.group(1).strip()
        if is_valid_city(city):
            return city.strip('. ')

    # Try City, ST pattern
    for m in city_state_re.finditer(text):
        city = m.group(1).strip()
        if is_valid_city(city):
            return city.strip('. ')

    # Try City, Full State Name
    for m in city_state_full_re.finditer(text):
        city = m.group(1).strip()
        if is_valid_city(city):
            return city.strip('. ')

    return ''


def find_contact_links(html, base_url):
    """Find contact/about/location page links."""
    links = []
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    link_re = re.compile(r'<a[^>]+href=["\']([^"\']+)["\']', re.IGNORECASE)
    for m in link_re.finditer(html):
        href = m.group(1)
        href_lower = href.lower()
        if any(kw in href_lower for kw in ['contact', 'about', 'location', 'office']):
            if href.startswith('/'):
                href = base + href
            elif not href.startswith('http'):
                href = base + '/' + href
            # Only follow links on same domain
            if parsed.netloc in href:
                links.append(href)
    return links[:3]  # Max 3 subpages


def scrape_city(website_url):
    """Scrape a website for its HQ city."""
    url = normalize_url(website_url)
    if not url:
        return ''

    try:
        html = fetch_page(url)
        city = extract_city(html)
        if city:
            return city

        # Try contact/about pages
        sub_links = find_contact_links(html, url)
        for link in sub_links:
            try:
                sub_html = fetch_page(link)
                city = extract_city(sub_html)
                if city:
                    return city
            except:
                continue
    except Exception as e:
        pass

    return ''


def main():
    with open(INPUT, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)

    header = rows[0]
    data = rows[1:]

    total = len(data)
    found = 0
    skipped = 0
    failed = 0

    for i, row in enumerate(data):
        city = row[3].strip() if len(row) > 3 else ''
        website = row[6].strip() if len(row) > 6 else ''
        company = row[1].strip() if len(row) > 1 else ''

        if city:
            skipped += 1
            print(f"[{i+1}/{total}] {company} — already has city: {city}")
            continue

        if not website:
            skipped += 1
            print(f"[{i+1}/{total}] {company} — no website, skipping")
            continue

        print(f"[{i+1}/{total}] {company} — scraping {website}...", end=' ', flush=True)

        result = scrape_city(website)

        if result:
            row[3] = result
            found += 1
            print(f"-> {result}")
        else:
            failed += 1
            print("-> NOT FOUND")

        time.sleep(0.3)  # Be polite

    # Write output
    with open(OUTPUT, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(data)

    print(f"\nDone! Found: {found}, Not found: {failed}, Skipped: {skipped}")
    print(f"Output: {OUTPUT}")


if __name__ == '__main__':
    main()
