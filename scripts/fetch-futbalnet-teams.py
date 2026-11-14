"""Fetch actual club teams for one season, with resumable public-data cache.

Usage: python scripts/fetch-futbalnet-teams.py CLUBS_JSON CACHE_DIR OUTPUT_JSON
No squads, people or contact details are fetched.
"""
import concurrent.futures
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SEASON = "2026/2027"
BASE = "https://sutaze.api.sportnet.online/api/v2/public/"


def fetch_club(club, cache):
    club_id = club["_id"]
    target = cache / (urllib.parse.quote(club_id, safe="") + ".json")
    if target.exists():
        return json.loads(target.read_text())
    teams = []
    offset = 0
    while True:
        url = BASE + urllib.parse.quote(club_id, safe="") + "/teams?" + urllib.parse.urlencode({
            "seasonName": SEASON, "limit": 1000, "offset": offset,
        })
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=30) as response:
                    page = json.load(response)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
        batch = page["teams"]
        for team in batch:
            if team.get("appSpace") != club_id or team.get("season", {}).get("name") != SEASON:
                raise ValueError("Unexpected club or season in source")
            if team.get("sport_sector") != "futbal":
                continue
            teams.append({key: team[key] for key in (
                "_id", "appSpace", "ageCategory", "category", "gender", "name", "displayName"
            ) if key in team} | {"season": SEASON})
        if len(batch) < 1000:
            break
        offset += len(batch)
    if len({team["_id"] for team in teams}) != len(teams):
        raise ValueError("Repeated team ID")
    result = {"club_id": club_id, "season": SEASON, "teams": teams}
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False))
    temporary.replace(target)
    return result


if __name__ == "__main__":
    clubs = json.loads(Path(sys.argv[1]).read_text())["items"]
    cache, output = Path(sys.argv[2]), Path(sys.argv[3])
    cache.mkdir(parents=True, exist_ok=True)
    results, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        jobs = {pool.submit(fetch_club, club, cache): club["_id"] for club in clubs}
        for job in concurrent.futures.as_completed(jobs):
            try:
                results.append(job.result())
            except Exception as error:
                errors.append({"club_id": jobs[job], "error": str(error)})
            if (len(results) + len(errors)) % 50 == 0:
                print(f"Checked {len(results) + len(errors)}/{len(clubs)} clubs; {sum(len(x['teams']) for x in results)} teams; {len(errors)} errors", flush=True)
    output.write_text(json.dumps({"season": SEASON, "clubs": results, "errors": errors}, ensure_ascii=False))
    print(f"DONE: {len(results)} clubs, {sum(len(x['teams']) for x in results)} teams, {len(errors)} errors", flush=True)
    if errors:
        sys.exit(1)
