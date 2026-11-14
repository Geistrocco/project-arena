"""Prepare idempotent club-team rows from verified current-season snapshots.

Usage: python scripts/prepare-futbalnet-teams.py CLUB_ROWS_JSON CACHE_DIR OUTPUT
Club rows contain id/source_id from the reviewed club directory import.
Only identity/category/season fields are used; existing team IDs are retained
by the database's (club_id, category, season) conflict key.
"""
import collections
import json
import re
import sys
import urllib.parse
from pathlib import Path


def prepare(clubs, snapshots):
    clubs_by_source = {c["source_id"]: c for c in clubs}
    groups = collections.defaultdict(list)
    for snapshot in snapshots:
        for team in snapshot["teams"]:
            club = team["appSpace"]
            if club not in clubs_by_source:
                raise ValueError("Team has unknown parent club: " + club)
            age, gender, squad = team["ageCategory"], team["gender"], team["category"]
            if gender not in ("M", "F") or not re.fullmatch(r"[A-Z0-9]{1,4}", squad):
                raise ValueError("Unexpected gender or squad")
            if not re.fullmatch(r"\d{4}/\d{4}", team["season"]):
                raise ValueError("Unexpected season")
            groups[(club, team["season"], age, gender, squad)].append(team)
    rows = []
    for (club, season, age, gender, squad), teams in sorted(groups.items()):
        if age == "ADULTS":
            category = "Muži" if gender == "M" else "Ženy"
        elif re.fullmatch(r"U\d{1,2}", age):
            category = "U" + str(int(age[1:]))
            if gender == "F":
                category += " dievčatá"
        else:
            raise ValueError("Unexpected age category: " + age)
        if squad != "A":
            category += " " + squad
        if len(category) > 30:
            raise ValueError("Category exceeds database limit")
        parent = clubs_by_source[club]
        gender_label = "muži" if age == "ADULTS" and gender == "M" else "ženy" if age == "ADULTS" else "chlapci" if gender == "M" else "dievčatá"
        age_label = "" if age == "ADULTS" else " U" + str(int(age[1:]))
        name = f"{parent['name']}{age_label} ({gender_label} {squad})"
        if len(name) > 180:
            raise ValueError("Team name exceeds database limit")
        # Different competition registration IDs can represent one club squad.
        # The natural source identity remains stable if those IDs change.
        source_id = ":".join((club, season, age, gender, squad))
        source_url = ("https://sutaze.api.sportnet.online/api/v2/futbalnet/" +
                      urllib.parse.quote(club, safe="") + "/teams/" + gender + "/" + age + "/" + squad +
                      "?seasonName=" + urllib.parse.quote(season, safe=""))
        rows.append({"club_id": parent["id"], "name": name, "category": category,
                     "season": season[:5] + season[-2:], "source_id": source_id,
                     "source_url": source_url, "status": parent["status"],
                     "registration_ids": sorted({t["_id"] for t in teams})})
    if len({(r["club_id"], r["category"], r["season"]) for r in rows}) != len(rows):
        raise ValueError("Colliding normalized team categories")
    return rows


if __name__ == "__main__":
    clubs = json.loads(Path(sys.argv[1]).read_text())
    snapshots = [json.loads(p.read_text()) for p in Path(sys.argv[2]).glob("*.json")]
    rows = prepare(clubs, snapshots)
    Path(sys.argv[3]).write_text(json.dumps(rows, ensure_ascii=False))
    checked = sum(s.get("kind") != "competition_coverage" for s in snapshots)
    print(f"Prepared {len(rows)} distinct squads from {sum(len(s['teams']) for s in snapshots)} registrations across {checked} checked clubs")
