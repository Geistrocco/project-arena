"""Prepare reviewed club identities without changing existing IDs or metadata.

Usage: python scripts/prepare-futbalnet-clubs.py SOURCE_JSON EXISTING_JSON OUTPUT
EXISTING_JSON is a public.clubs export with id/name/status/source/source_id.
Unmatched existing clubs are retained. Ambiguous matches require explicit review.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path


def normalized(value):
    value = unicodedata.normalize("NFD", value).encode("ascii", "ignore").decode().lower()
    return re.sub("[^a-z0-9]", "", value)


def prepare(source, existing, aliases):
    mapping = {}
    for club in existing:
        if club.get("source") == "sportnet_futbalnet":
            candidates = [s for s in source if s["_id"] == club.get("source_id")]
        elif club["id"] in aliases:
            candidates = [s for s in source if s["_id"] == aliases[club["id"]]]
        else:
            candidates = [s for s in source if normalized(s["name"]) == normalized(club["name"])
                          or s["_id"].removesuffix(".futbalnet.sk") == club["id"]]
        if len(candidates) > 1:
            raise ValueError("Ambiguous existing club: " + club["id"])
        if candidates:
            key = candidates[0]["_id"]
            if key in mapping:
                raise ValueError("Two existing clubs refer to one source identity")
            mapping[key] = club
    rows = []
    for club in source:
        old = mapping.get(club["_id"])
        name = club["name"].strip()
        if club.get("type") != "club" or club.get("sport") != "futbal" or not 2 <= len(name) <= 160:
            raise ValueError("Unexpected club record")
        mark = "".join(w[0] for w in name.split() if w[0].isalnum())[:4] or "FK"
        rows.append({"id": old["id"] if old else "sportnet:" + club["_id"], "name": name,
                     "short_name": name[:80], "city": old.get("city", "") if old else "",
                     "logo_placeholder": mark, "logo_url": club.get("logo_public_url"),
                     "source_id": club["_id"], "source_url": "https://sportnet.sme.sk/futbalnet/k/" + club["_id"].removesuffix(".futbalnet.sk") + "/",
                     "status": old["status"] if old else "active" if str(club.get("status", "")).lower() == "active" else "inactive",
                     "matched": old is not None})
    if len({r["id"] for r in rows}) != len(rows):
        raise ValueError("Colliding target club IDs")
    return rows


if __name__ == "__main__":
    source = json.loads(Path(sys.argv[1]).read_text())["items"]
    existing = json.loads(Path(sys.argv[2]).read_text())
    aliases = json.loads((Path(__file__).resolve().parents[1] / "data/futbalnet-club-aliases.json").read_text())
    rows = prepare(source, existing, aliases)
    Path(sys.argv[3]).write_text(json.dumps(rows, ensure_ascii=False))
    print(f"Prepared {len(rows)} clubs; retained {sum(r['matched'] for r in rows)} existing IDs")
