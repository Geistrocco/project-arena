"""Download only public club directory fields; follow next_offset until a short page.

Usage: python scripts/fetch-futbalnet-clubs.py /tmp/futbalnet-clubs.json
The endpoint uses look-ahead totals and can return next_offset after the last page.
This script does not import people, rosters, contacts or create team categories.
"""

import datetime
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = "https://api.sportnet.online/v1/ppo/futbalsfz.sk/related-ppos"
FIELDS = ("_id", "name", "country", "type", "sport", "status", "logo_public_url")


def download():
    items, seen_offsets, seen_ids = [], set(), set()
    offset = 0
    while True:
        if offset in seen_offsets:
            raise ValueError("Repeated pagination offset")
        seen_offsets.add(offset)
        url = ENDPOINT + "?" + urllib.parse.urlencode({"ppoType": "club", "limit": 1000, "offset": offset})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=30) as response:
                    page = json.load(response)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
        batch = page["items"]
        for row in batch:
            if row["_id"] in seen_ids:
                raise ValueError("Duplicate club ID; source changed during pagination")
            if row.get("type") != "club" or row.get("sport") != "futbal":
                raise ValueError("Unexpected non-football club")
            seen_ids.add(row["_id"])
            items.append({key: row[key] for key in FIELDS if key in row} | {
                "relation_status": row.get("relation", {}).get("status")
            })
        print(f"Downloaded {len(items)} clubs", file=sys.stderr)
        next_offset = page.get("next_offset")
        if len(batch) < 1000 or next_offset is None:
            break
        if not batch or next_offset <= offset:
            raise ValueError("Invalid next_offset")
        offset = next_offset
        time.sleep(0.15)
    encoded = json.dumps(items, ensure_ascii=False, sort_keys=True).encode()
    return {"source": ENDPOINT, "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "total": len(items), "sha256": hashlib.sha256(encoded).hexdigest(), "items": items}


if __name__ == "__main__":
    target = Path(sys.argv[1])
    snapshot = download()
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(target)
