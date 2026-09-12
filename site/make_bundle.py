#!/usr/bin/env python3
"""content/** -> site/public/content/bundle.json, the app's only content input.

Validates the catalog (every item needs an id, org, title, kind, where, summary, source
url and verified date; every org referenced must exist) and writes a deterministic
bundle, so CI can fail the build when the committed bundle has drifted."""
import json, sys
from collections import Counter
from urllib.parse import urlparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "catalog.json"
OUT = ROOT / "site" / "public" / "content" / "bundle.json"
# Two independent axes, kept apart on purpose: kind is what she would be doing,
# where is how she takes part. They used to be one enum, which put "At home" and
# "Event" in a single filter as though they were alternatives.
KINDS = {"craft", "drive", "foster", "shift", "program", "event", "citizen-science", "outreach"}
WHERES = {"in-person", "at-home", "online"}
REQUIRED = ("id", "org", "title", "kind", "where", "summary", "url", "verified")

def site(url):
    """The registrable domain, so www./support./help. subdomains all count as the org's own."""
    host = urlparse(url).netloc.lower()
    return ".".join(host.split(".")[-2:])


def main():
    cat = json.loads(SRC.read_text())
    orgs = cat["organizations"]
    seen = set()
    for it in cat["items"]:
        for k in REQUIRED:
            if not it.get(k):
                sys.exit(f"{it.get('id', '?')}: missing {k}")
        if it["id"] in seen:
            sys.exit(f"duplicate id {it['id']}")
        seen.add(it["id"])
        if it["org"] not in orgs:
            sys.exit(f"{it['id']}: unknown org {it['org']}")
        if it["kind"] not in KINDS:
            sys.exit(f"{it['id']}: unknown kind {it['kind']}")
        if it["where"] not in WHERES:
            sys.exit(f"{it['id']}: unknown where {it['where']}")
        # An archived page is not evidence a programme still runs: PAWS moved its preteen
        # workshops under /archive/ and the catalog went on advertising the old times and price.
        if "/archive/" in it["url"]:
            sys.exit(f"{it['id']}: {it['url']} is an archived page; source a live one or drop the item")
        # An item describes what an organization offers, so its own site is the only thing
        # that can say so. The iNaturalist entry was written off a "volunteering online"
        # listicle and got the age rule wrong, which the org's own pages state plainly.
        if site(it["url"]) != site(orgs[it["org"]]["url"]):
            sys.exit(
                f"{it['id']}: {it['url']} is not on {site(orgs[it['org']]['url'])}; "
                "cite the organization's own page, not a third party writing about it"
            )
        ages = it.setdefault("ages", {})
        for k in ("min", "max"):
            v = ages.get(k)
            if v is not None and not isinstance(v, int):
                sys.exit(f"{it['id']}: ages.{k} must be an integer or null")
        ages.setdefault("withAdult", False); ages.setdefault("note", "")
        it.setdefault("details", []); it.setdefault("tags", [])
        for k in ("commitment", "location", "howTo"):
            it.setdefault(k, "")
    # Deleting the last item of an organization should delete the organization too:
    # LDCRF's only entry turned out to be 18+ and left its org behind when it went.
    unused = sorted(set(orgs) - {it["org"] for it in cat["items"]})
    if unused:
        sys.exit(f"organizations with no items: {', '.join(unused)}; remove them too")
    counts = Counter(it["org"] for it in cat["items"])
    for it in cat["items"]:
        if counts[it["org"]] > 1 and orgs[it["org"]]["url"] == it["url"]:
            sys.exit(
                f"{it['org']}: the organization link is {it['url']}, which is {it['id']}'s own page; "
                "give an organization with several items a front door of its own"
            )
    items = sorted(cat["items"], key=lambda x: (orgs[x["org"]]["name"], x["title"]))
    bundle = {"schema": 1, "note": cat.get("note", ""), "organizations": orgs, "items": items}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(items)} items, {len(orgs)} organizations")

if __name__ == "__main__":
    main()
