#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Service Menu — Drive sync helper
#
# Pulls the current files from the public Drive "Service Menu" folder and
# extracts their text, so when an offer doc changes you (or Claude) can see
# exactly what's different and patch the matrix fields in menu.json.
#
#   Usage:  bash sync-drive.sh
#   Output: _drive-cache/  (downloaded files + .txt extractions, git-ignored)
#
# The Drive folder must be shared "Anyone with the link → Viewer".
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"
FOLDER_ID="$(python3 -c "import json;print(json.load(open('menu.json'))['meta']['driveFolderId'])")"
OUT="_drive-cache"
mkdir -p "$OUT"

echo "▶ Crawling Drive folder $FOLDER_ID …"
python3 - "$FOLDER_ID" > "$OUT/_manifest.tsv" <<'PY'
import sys, urllib.request, re, html
def fetch(fid):
    req=urllib.request.Request(f"https://drive.google.com/embeddedfolderview?id={fid}",
        headers={'User-Agent':'Mozilla/5.0'})
    return urllib.request.urlopen(req,timeout=25).read().decode('utf-8','ignore')
def entries(h):
    out=[]; folders=set(re.findall(r'/drive/folders/([A-Za-z0-9_-]+)',h))
    for m in re.finditer(r'id="entry-([A-Za-z0-9_-]+)"[^>]*>.*?flip-entry-title">([^<]+)',h,re.S):
        out.append((m.group(1),html.unescape(m.group(2)).strip(),m.group(1) in folders))
    return out
seen=set()
def walk(fid,path):
    if fid in seen:return
    seen.add(fid)
    for eid,name,isdir in entries(fetch(fid)):
        if isdir: walk(eid, path+"/"+name)
        else: print(f"{eid}\t{path}/{name}")
walk(sys.argv[1],"")
PY

echo "▶ Downloading + extracting …"
while IFS=$'\t' read -r id path; do
  name="$(basename "$path")"
  safe="${name// /_}"
  curl -sL "https://drive.google.com/uc?export=download&id=$id" -o "$OUT/$safe"
  case "$name" in
    *.docx) textutil -convert txt -stdout "$OUT/$safe" 2>/dev/null > "$OUT/$safe.txt" && echo "  ✓ $name (docx→txt)";;
    *.pdf)  echo "  ✓ $name (pdf — read with the Read tool)";;
    *.pptx) echo "  ✓ $name (pptx)";;
    *)      echo "  ✓ $name";;
  esac
done < "$OUT/_manifest.tsv"

echo "▶ Done. Files + text in $OUT/  — diff the .txt against menu.json to find changed fields."
