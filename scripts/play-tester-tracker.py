#!/usr/bin/env python3
"""Report closed-testing gate progress from the gitignored tester-list.csv.

Why this exists
---------------
Google gates production access for personal developer accounts behind a
closed test with MIN_TESTERS opted-in testers for 14 consecutive days
(docs/play-store-submission.md §7; the Console Testing page states the exact
figure for this account). tester-list.csv holds personal email addresses and
is gitignored (.gitignore:134), so this script only ever prints counts and
dates - never the addresses - and never touches the network.

Usage
-----
    python3 scripts/play-tester-tracker.py          # status report
    python3 scripts/play-tester-tracker.py --check  # exit 1 while opted-in < MIN_TESTERS
"""

import argparse
import csv
import datetime as dt
import sys
from pathlib import Path

MIN_TESTERS = 20  # dossier §7; re-verify on the Console Testing page
GATE_DAYS = 14  # consecutive days the minimum must hold
OPT_OUT_BUFFER = 4  # recruit this many above the minimum to survive opt-outs
CSV_PATH = Path(__file__).resolve().parent.parent / "tester-list.csv"
TRUTHY = {"y", "yes", "true", "1"}


def load_rows():
    with CSV_PATH.open(newline="", encoding="utf-8") as fh:
        return [row for row in csv.DictReader(fh) if (row.get("email") or "").strip()]


def parse_date(value):
    value = (value or "").strip()
    return dt.date.fromisoformat(value) if value else None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 1 while opted-in testers are below the minimum",
    )
    args = parser.parse_args()

    rows = load_rows()
    opted = [parse_date(row.get("optin_confirmed")) for row in rows]
    opted = [d for d in opted if d]
    installed = sum(
        1 for row in rows if (row.get("installed") or "").strip().lower() in TRUTHY
    )

    print(f"testers on list : {len(rows)}")
    print(f"opted in        : {len(opted)} / {MIN_TESTERS} required")
    print(f"installed       : {installed}")

    missing = MIN_TESTERS - len(opted)
    if missing > 0:
        print(f"still to recruit: {missing} (aim for {MIN_TESTERS + OPT_OUT_BUFFER} total to survive opt-outs)")
        print("gate window     : not started - fill optin_confirmed (YYYY-MM-DD) as testers opt in")
    else:
        start = max(opted)
        earliest = start + dt.timedelta(days=GATE_DAYS)
        print(f"gate window     : {start} .. {earliest} (closed release must stay live throughout)")
        print(f"earliest production request: {earliest}")
    return 1 if (args.check and missing > 0) else 0


if __name__ == "__main__":
    sys.exit(main())
