"""Private, revision-bound persistence for human manufacturing measurements."""
from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE = ROOT / ".runtime" / "manufacturing-reviews.sqlite3"
GROUPS = {
    "inside-pocket-corner": {"insideRadiusMm", "selectedCutterRadiusMm"},
    "deep-pocket": {"depthMm", "minWidthMm"},
    "thin-wall": {"thicknessMm"},
    "deep-drilled-hole": {"depthMm", "diameterMm"},
    "mounting-hole-tolerance": {"diameterMm", "tolerancePlusMinusMm"},
}
SNAPSHOT = re.compile(r"^[A-Za-z0-9._:/@-]{1,500}$")


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def validate_review(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"snapshotKey", "reviewer", "acknowledged", "groups"}:
        raise ValueError("The manufacturing review contract is incomplete.")
    if not isinstance(value["snapshotKey"], str) or not SNAPSHOT.fullmatch(value["snapshotKey"]) or ".." in value["snapshotKey"]:
        raise ValueError("The source snapshot key is invalid.")
    reviewer = value["reviewer"].strip() if isinstance(value["reviewer"], str) else ""
    if value["acknowledged"] is not True or not 1 <= len(reviewer) <= 100:
        raise ValueError("A named reviewer must acknowledge the measurements.")
    if not isinstance(value["groups"], list) or not 1 <= len(value["groups"]) <= len(GROUPS):
        raise ValueError("At least one supported measurement group is required.")
    groups, seen = [], set()
    for item in value["groups"]:
        if not isinstance(item, dict) or set(item) != {"featureId", "reference", "dimensions"}:
            raise ValueError("A measurement group is incomplete.")
        feature = item["featureId"]
        if feature not in GROUPS or feature in seen:
            raise ValueError("A measurement group is unknown or duplicated.")
        seen.add(feature)
        reference = item["reference"].strip() if isinstance(item["reference"], str) else ""
        if not 1 <= len(reference) <= 500 or any(ord(character) < 32 for character in reference):
            raise ValueError("A bounded face or drawing reference is required.")
        dimensions = item["dimensions"]
        if not isinstance(dimensions, dict) or set(dimensions) != GROUPS[feature]:
            raise ValueError("Every selected measurement dimension is required.")
        if not all(type(number) in (int, float) and math.isfinite(number) and 0 < number <= 100000 for number in dimensions.values()):
            raise ValueError("Measurements must be positive finite millimeter values.")
        groups.append({"featureId": feature, "reference": reference, "dimensions": dimensions})
    return {"snapshotKey": value["snapshotKey"], "reviewer": reviewer, "acknowledged": True, "groups": groups}


class ManufacturingReviewStore:
    def __init__(self, database: Path = DEFAULT_DATABASE, *, clock=time.time):
        self.database, self.clock = Path(database), clock
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS manufacturing_reviews (
                snapshot_key TEXT PRIMARY KEY, review_hash TEXT NOT NULL,
                review_json TEXT NOT NULL, created REAL NOT NULL, expires REAL NOT NULL)""")

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.database, timeout=10)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def put(self, value: Any) -> dict[str, Any]:
        review = validate_review(value)
        content = canonical(review)
        review_hash = "sha256-" + hashlib.sha256(content.encode()).hexdigest()
        now = self.clock()
        expires = now + 7 * 86400
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            prior = db.execute("SELECT * FROM manufacturing_reviews WHERE snapshot_key=?", (review["snapshotKey"],)).fetchone()
            if prior:
                if prior["review_hash"] != review_hash:
                    raise ValueError("This revision already has a different review. Create a new CAD revision or explicitly reconcile the record.")
                return {"review": json.loads(prior["review_json"]), "reviewHash": review_hash, "expiresAt": prior["expires"]}
            db.execute("INSERT INTO manufacturing_reviews VALUES (?, ?, ?, ?, ?)",
                       (review["snapshotKey"], review_hash, content, now, expires))
        return {"review": review, "reviewHash": review_hash, "expiresAt": expires}

    def get(self, snapshot_key: str) -> dict[str, Any] | None:
        if not isinstance(snapshot_key, str) or not SNAPSHOT.fullmatch(snapshot_key):
            raise ValueError("The source snapshot key is invalid.")
        with self.connect() as db:
            row = db.execute("SELECT * FROM manufacturing_reviews WHERE snapshot_key=? AND expires>?", (snapshot_key, self.clock())).fetchone()
        if row is None:
            return None
        if "sha256-" + hashlib.sha256(row["review_json"].encode()).hexdigest() != row["review_hash"]:
            raise ValueError("The retained manufacturing review failed its integrity check.")
        return {"review": json.loads(row["review_json"]), "reviewHash": row["review_hash"], "expiresAt": row["expires"]}

    def cleanup(self) -> int:
        with self.connect() as db:
            result = db.execute("DELETE FROM manufacturing_reviews WHERE expires<=?", (self.clock(),))
        return result.rowcount
