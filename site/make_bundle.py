#!/usr/bin/env python3
"""content/** -> site/public/content/bundle.json, the app's only content input.

Validates the catalog (every item needs an id, org, title, kind, summary, source
url and verified date; every org referenced must exist) and writes a deterministic
bundle, so CI can fail the build when the committed bundle has drifted."""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "catalog.json"
OUT = ROOT / "site" / "public" / "content" / "bundle.json"
KINDS = {"at-home", "drive", "on-site", "program", "event"}
REQUIRED = ("id", "org", "title", "kind", "summary", "url", "verified")

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
        ages = it.setdefault("ages", {})
        for k in ("min", "max"):
            v = ages.get(k)
            if v is not None and not isinstance(v, int):
                sys.exit(f"{it['id']}: ages.{k} must be an integer or null")
        ages.setdefault("withAdult", False); ages.setdefault("note", "")
        it.setdefault("details", []); it.setdefault("tags", [])
        for k in ("commitment", "location", "howTo"):
            it.setdefault(k, "")
    items = sorted(cat["items"], key=lambda x: (orgs[x["org"]]["name"], x["title"]))
    bundle = {"schema": 1, "note": cat.get("note", ""), "organizations": orgs, "items": items}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(items)} items, {len(orgs)} organizations")

if __name__ == "__main__":
    main()
