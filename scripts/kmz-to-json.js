#!/usr/bin/env node

/**
 * kmz-to-json.js
 *
 * Extracts client placemarks from a KMZ file and writes them to a JSON file.
 * Uses only built-in Node.js modules + macOS `unzip` command.
 *
 * Usage:  node scripts/kmz-to-json.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const KMZ_PATH = path.join(__dirname, '..', 'map', 'Most Updated Client Map.kmz');
const OUTPUT_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'clients.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Extract KML content from KMZ (which is a zip file)
const kml = execSync(`unzip -p "${KMZ_PATH}" doc.kml`, { encoding: 'utf-8' });

// Extract all Placemark blocks
const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
const nameRegex = /<name>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/name>/;
const coordRegex = /<coordinates>\s*([\d.,-\s]+?)\s*<\/coordinates>/;

const clients = [];
let match;

while ((match = placemarkRegex.exec(kml)) !== null) {
  const block = match[1];

  const nameMatch = block.match(nameRegex);
  const coordMatch = block.match(coordRegex);

  if (nameMatch && coordMatch) {
    const name = nameMatch[1].trim();
    // KML coordinate format: lng,lat,altitude
    const parts = coordMatch[1].trim().split(',');
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);

    clients.push({ name, lat, lng });
  }
}

const output = { clients };

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');

console.log(`Extracted ${clients.length} placemarks -> ${OUTPUT_PATH}`);
