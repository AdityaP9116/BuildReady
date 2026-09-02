from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterator


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RUNTIME_ROOT = ROOT / ".runtime" / "fea"
DOMAIN_PATH = ROOT / "web" / "fea-domain.json"
RECORDED_RESULT_PATH = ROOT / "web" / "fea-recorded-result.json"
TERMINAL_STATES = frozenset({"COMPLETE", "FAILED", "CANCELED"})
RECORDED_TIMELINE = (
    (0.0, "QUEUED"),
    (0.15, "RUNNING"),
    (0.30, "POSTPROCESSING"),
    (0.45, "COMPLETE"),
)


def utc_iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_value(value: Any) -> str:
    return "sha256-" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


class FeaServiceError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 400, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


@dataclass(frozen=True)
class ServicePaths:
    database: Path
    artifacts: Path


class FeaStore:
    """Small durable local store implementing the provider-neutral FEA record contract."""

    def __init__(self, paths: ServicePaths) -> None:
        self.paths = paths
        self.paths.database.parent.mkdir(parents=True, exist_ok=True)
        self.paths.artifacts.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._initialize()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.paths.database)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS fea_studies (
                  study_id TEXT PRIMARY KEY,
                  snapshot_key TEXT NOT NULL,
                  study_hash TEXT NOT NULL UNIQUE,
                  lifecycle_state TEXT NOT NULL,
                  currentness TEXT NOT NULL,
                  manifest_json TEXT NOT NULL,
                  approval_json TEXT,
                  run_id TEXT,
                  result_json TEXT,
                  created_at REAL NOT NULL,
                  updated_at REAL NOT NULL,
                  approved_at REAL
                );
                CREATE TABLE IF NOT EXISTS artifacts (
                  artifact_id TEXT PRIMARY KEY,
                  study_id TEXT NOT NULL,
                  kind TEXT NOT NULL,
                  storage_path TEXT NOT NULL,
                  sha256 TEXT NOT NULL,
                  byte_size INTEGER NOT NULL,
                  created_at REAL NOT NULL,
                  expires_at REAL NOT NULL,
                  deleted_at REAL,
                  FOREIGN KEY(study_id) REFERENCES fea_studies(study_id)
                );
                """
            )

    def put_study(self, record: dict[str, Any]) -> dict[str, Any]:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO fea_studies (
                  study_id, snapshot_key, study_hash, lifecycle_state, currentness,
                  manifest_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["studyId"], record["snapshotKey"], record["studyHash"],
                    record["lifecycleState"], record["currentness"],
                    canonical_json(record["manifest"]), record["createdAtEpoch"],
                    record["updatedAtEpoch"],
                ),
            )
        return self.get_study(record["studyId"])

    def get_study(self, study_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM fea_studies WHERE study_id = ?", (study_id,)
            ).fetchone()
        if row is None:
            raise FeaServiceError("FEA_STUDY_NOT_FOUND", "The requested FEA study does not exist.", 404)
        return self._public_record(row)

    def get_by_hash(self, study_hash: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM fea_studies WHERE study_hash = ?", (study_hash,)
            ).fetchone()
        return self._public_record(row) if row else None

    def approve(self, study_id: str, approval: dict[str, Any], now: float) -> dict[str, Any]:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM fea_studies WHERE study_id = ?", (study_id,)
            ).fetchone()
            if row is None:
                raise FeaServiceError("FEA_STUDY_NOT_FOUND", "The requested FEA study does not exist.", 404)
            if row["approval_json"]:
                return self._public_record(row)
            connection.execute(
                """
                UPDATE fea_studies
                SET lifecycle_state = 'QUEUED', approval_json = ?, run_id = ?,
                    approved_at = ?, updated_at = ?
                WHERE study_id = ? AND lifecycle_state = 'VALIDATED'
                """,
                (canonical_json(approval), approval["runId"], now, now, study_id),
            )
        return self.get_study(study_id)

    def set_progress(
        self,
        study_id: str,
        lifecycle_state: str,
        now: float,
        result: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE fea_studies
                SET lifecycle_state = ?, result_json = COALESCE(?, result_json), updated_at = ?
                WHERE study_id = ?
                """,
                (lifecycle_state, canonical_json(result) if result else None, now, study_id),
            )
        return self.get_study(study_id)

    def mark_other_snapshots_stale(self, active_snapshot_key: str, now: float) -> int:
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE fea_studies SET currentness = 'STALE', updated_at = ?
                WHERE snapshot_key <> ? AND currentness = 'CURRENT'
                """,
                (now, active_snapshot_key),
            )
            return cursor.rowcount

    def put_artifact(
        self,
        study_id: str,
        run_id: str,
        kind: str,
        content: bytes,
        now: float,
        retention_days: int,
    ) -> dict[str, Any]:
        digest = hashlib.sha256(content).hexdigest()
        artifact_id = f"artifact-{digest[:16]}"
        relative = Path(study_id) / run_id / f"{kind}.json"
        destination = self.paths.artifacts / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        expires_at = now + retention_days * 86400
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO artifacts (
                  artifact_id, study_id, kind, storage_path, sha256, byte_size,
                  created_at, expires_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    artifact_id, study_id, kind, str(relative).replace("\\", "/"),
                    f"sha256-{digest}", len(content), now, expires_at,
                ),
            )
        return {
            "artifactId": artifact_id,
            "kind": kind,
            "sha256": f"sha256-{digest}",
            "byteSize": len(content),
            "expiresAt": utc_iso(expires_at),
            "private": True,
        }

    def cleanup_expired(self, now: float) -> int:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                "SELECT artifact_id, storage_path FROM artifacts WHERE deleted_at IS NULL AND expires_at <= ?",
                (now,),
            ).fetchall()
            for row in rows:
                path = (self.paths.artifacts / row["storage_path"]).resolve()
                if self.paths.artifacts.resolve() in path.parents:
                    path.unlink(missing_ok=True)
                connection.execute(
                    "UPDATE artifacts SET deleted_at = ? WHERE artifact_id = ?",
                    (now, row["artifact_id"]),
                )
        return len(rows)

    @staticmethod
    def _public_record(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "studyId": row["study_id"],
            "snapshotKey": row["snapshot_key"],
            "studyHash": row["study_hash"],
            "lifecycleState": row["lifecycle_state"],
            "currentness": row["currentness"],
            "manifest": json.loads(row["manifest_json"]),
            "approval": json.loads(row["approval_json"]) if row["approval_json"] else None,
            "runId": row["run_id"],
            "result": json.loads(row["result_json"]) if row["result_json"] else None,
            "createdAt": utc_iso(row["created_at"]),
            "updatedAt": utc_iso(row["updated_at"]),
            "approvedAt": utc_iso(row["approved_at"]) if row["approved_at"] else None,
        }


class FeaService:
    def __init__(
        self,
        store: FeaStore,
        *,
        provider: str = "recorded",
        clock: Callable[[], float] = time.time,
    ) -> None:
        if provider not in {"disabled", "recorded"}:
            raise FeaServiceError(
                "FEA_PROVIDER_NOT_IMPLEMENTED",
                "Live SimScale mode remains disabled until the account verification gate passes.",
                503,
            )
        self.store = store
        self.provider = provider
        self.clock = clock
        self.domain = json.loads(DOMAIN_PATH.read_text(encoding="utf-8"))
        self.recorded_result = json.loads(RECORDED_RESULT_PATH.read_text(encoding="utf-8"))

    @classmethod
    def from_environment(cls) -> "FeaService":
        runtime_root = Path(os.environ.get("FEA_RUNTIME_DIR", DEFAULT_RUNTIME_ROOT))
        paths = ServicePaths(runtime_root / "fea.sqlite3", runtime_root / "artifacts")
        return cls(FeaStore(paths), provider=os.environ.get("SIMULATION_PROVIDER", "recorded"))

    def capabilities(self) -> dict[str, Any]:
        return {
            "ok": True,
            "provider": self.provider,
            "live": False,
            "analysisTypes": [self.domain["analysisType"]],
            "loadTypes": [self.domain["loadPolicy"]["supportedType"]],
            "artifactRetentionDays": self.domain["artifactPolicy"]["retentionDays"],
            "authenticationRequiredForLive": True,
            "note": "Recorded mode exercises orchestration only; it is not live or numerically verified.",
        }

    def create_study(self, manifest: dict[str, Any]) -> dict[str, Any]:
        self._validate_manifest(manifest)
        existing = self.store.get_by_hash(manifest["studyHash"])
        if existing:
            return {"ok": True, "created": False, "study": existing}
        now = self.clock()
        self.store.mark_other_snapshots_stale(manifest["snapshotKey"], now)
        study_id = f"study-{manifest['studyHash'][7:23]}"
        record = self.store.put_study(
            {
                "studyId": study_id,
                "snapshotKey": manifest["snapshotKey"],
                "studyHash": manifest["studyHash"],
                "lifecycleState": "VALIDATED",
                "currentness": "CURRENT",
                "manifest": manifest,
                "createdAtEpoch": now,
                "updatedAtEpoch": now,
            }
        )
        return {"ok": True, "created": True, "study": record}

    def approve_and_submit(self, study_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if self.provider == "disabled":
            raise FeaServiceError("FEA_PROVIDER_DISABLED", "The FEA provider is disabled.", 503)
        required = {"expectedSnapshotKey", "studyHash", "cadSharingAcknowledged", "computeAcknowledged"}
        if set(payload) != required or payload["cadSharingAcknowledged"] is not True or payload["computeAcknowledged"] is not True:
            raise FeaServiceError(
                "FEA_APPROVAL_REQUIRED",
                "Visible human approval must acknowledge CAD sharing and compute use.",
            )
        study = self.store.get_study(study_id)
        if payload["expectedSnapshotKey"] != study["snapshotKey"] or payload["studyHash"] != study["studyHash"]:
            raise FeaServiceError("FEA_STALE_APPROVAL", "The approval does not match the frozen study.", 409, True)
        now = self.clock()
        run_id = f"run-{study['studyHash'][7:19]}"
        approval = {
            "approvalId": f"approval-{study['studyHash'][7:19]}",
            "actor": "human",
            "studyHash": study["studyHash"],
            "snapshotKey": study["snapshotKey"],
            "cadSharingAcknowledged": True,
            "computeAcknowledged": True,
            "approvedAt": utc_iso(now),
            "runId": run_id,
        }
        return {"ok": True, "study": self.store.approve(study_id, approval, now)}

    def get_study(self, study_id: str, *, advance: bool = False) -> dict[str, Any]:
        study = self.store.get_study(study_id)
        if advance:
            study = self._advance_recorded(study)
        return {"ok": True, "study": study}

    def get_results(self, study_id: str) -> dict[str, Any]:
        study = self._advance_recorded(self.store.get_study(study_id))
        if study["lifecycleState"] != "COMPLETE" or not study["result"]:
            raise FeaServiceError("FEA_RESULT_NOT_READY", "The FEA result is not ready.", 409, True)
        return {"ok": True, "result": study["result"]}

    def mark_snapshot_current(self, active_snapshot_key: str) -> int:
        return self.store.mark_other_snapshots_stale(active_snapshot_key, self.clock())

    def _advance_recorded(self, study: dict[str, Any]) -> dict[str, Any]:
        if self.provider != "recorded" or study["lifecycleState"] in TERMINAL_STATES or not study["approval"]:
            return study
        now = self.clock()
        approved_at = datetime.fromisoformat(study["approvedAt"].replace("Z", "+00:00")).timestamp()
        elapsed = now - approved_at
        next_state = next(state for minimum, state in reversed(RECORDED_TIMELINE) if elapsed >= minimum)
        result = None
        if next_state == "COMPLETE":
            result = json.loads(canonical_json(self.recorded_result))
            result.update(
                {
                    "studyId": study["studyId"],
                    "runId": study["runId"],
                    "currentness": study["currentness"].lower(),
                    "completedAt": utc_iso(now),
                }
            )
            result["source"]["snapshotKey"] = study["snapshotKey"]
            result["inputs"] = study["manifest"]
            artifact = self.store.put_artifact(
                study["studyId"],
                study["runId"],
                "normalized-result",
                canonical_json(result).encode("utf-8"),
                now,
                self.domain["artifactPolicy"]["retentionDays"],
            )
            result["artifacts"] = [artifact]
        if next_state != study["lifecycleState"] or result:
            return self.store.set_progress(study["studyId"], next_state, now, result)
        return study

    def _validate_manifest(self, manifest: dict[str, Any]) -> None:
        required = {
            "schemaVersion", "snapshotKey", "analysisType", "templateVersion", "material",
            "load", "selections", "mesh", "requirements", "studyHash",
        }
        if not isinstance(manifest, dict) or set(manifest) != required:
            raise FeaServiceError("FEA_INVALID_MANIFEST", "The study manifest has an invalid shape.")
        if manifest["analysisType"] != self.domain["analysisType"]:
            raise FeaServiceError("FEA_INVALID_MANIFEST", "The analysis type is not supported.")
        if manifest["templateVersion"] != self.domain["template"]["templateVersion"]:
            raise FeaServiceError("FEA_INVALID_MANIFEST", "The template version is not supported.")
        unsigned = {key: value for key, value in manifest.items() if key != "studyHash"}
        if manifest["studyHash"] != sha256_value(unsigned):
            raise FeaServiceError("FEA_HASH_MISMATCH", "The study hash does not match its canonical manifest.")
        if manifest["selections"] != self.domain["selectionContract"]:
            raise FeaServiceError("FEA_INVALID_SELECTION", "The required saved selections are not exact.")


def error_payload(error: FeaServiceError) -> tuple[int, dict[str, Any]]:
    return error.status, {
        "ok": False,
        "error": {
            "code": error.code,
            "message": error.message[:240],
            "retryable": error.retryable,
        },
    }
