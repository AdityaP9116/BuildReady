"""Canonical, provider-neutral simulation evidence records.

The record is deliberately compact and contains no credentials, signed URLs, or
raw provider payloads.  It binds metrics to immutable CAD bytes and a reviewed
solver setup while keeping engineering verification separate from data capture.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any


SCHEMA_VERSION = "buildready-simulation-evidence-2.0.0"
SHA256 = re.compile(r"^sha256-[0-9a-f]{64}$")


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def digest(value: Any) -> str:
    return "sha256-" + hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_evidence(record: dict[str, Any]) -> dict[str, Any]:
    """Reject incomplete, ambiguous, or potentially secret-bearing records."""
    required = {
        "schemaVersion", "evidenceId", "evidenceMode", "sourceKind", "provider",
        "live", "binding", "lifecycleState", "currentness", "setup", "result",
        "review", "retention",
    }
    _require(isinstance(record, dict) and set(record) == required, "Simulation evidence fields are incomplete or unsupported.")
    _require(record["schemaVersion"] == SCHEMA_VERSION, "Unsupported simulation evidence schema.")
    _require(record["evidenceMode"] in {"live", "recorded"}, "Unknown simulation evidence mode.")
    _require(record["sourceKind"] in {"authorized_api", "recorded_fixture"}, "Unknown simulation source kind.")
    _require(record["provider"] in {"simscale", "recorded-local"}, "Unsupported simulation provider.")
    _require(type(record["live"]) is bool and record["live"] == (record["evidenceMode"] == "live"), "Live evidence flag is inconsistent.")
    _require(record["lifecycleState"] in {"COMPLETE", "FAILED", "CANCELED"}, "Evidence cannot be published from an unfinished run.")
    _require(record["currentness"] in {"CURRENT", "STALE", "UNRESOLVED", "EXPIRED"}, "Unknown evidence currentness.")
    binding = record["binding"]
    _require(isinstance(binding, dict) and set(binding) == {"preparationId", "snapshotKey", "source", "stepSha256", "geometrySha256"}, "Evidence binding is incomplete.")
    _require(all(SHA256.fullmatch(binding[key] or "") for key in ("preparationId", "stepSha256", "geometrySha256")), "Evidence binding fingerprints are invalid.")
    source = binding["source"]
    _require(isinstance(source, dict) and set(source) == {"documentId", "elementId", "microversionId", "versionId", "partId", "configuration"}, "Frozen CAD source is incomplete.")
    _require(all(isinstance(value, str) and len(value) <= 100 for value in source.values()), "Frozen CAD source identifiers are invalid.")
    _require(binding["snapshotKey"] == f"{source['documentId']}:{source['microversionId']}:{source['elementId']}:{source['partId']}:{source['configuration']}", "Snapshot key does not match the frozen CAD source.")
    _require(SHA256.fullmatch(record["evidenceId"] or "") is not None, "Evidence identity is invalid.")
    _require(isinstance(record["setup"], dict) and SHA256.fullmatch(record["setup"].get("setupHash", "")), "Reviewed setup fingerprint is missing.")
    result = record["result"]
    _require(isinstance(result, dict) and SHA256.fullmatch(result.get("resultHash", "")), "Result fingerprint is missing.")
    metrics = result.get("metrics")
    _require(isinstance(metrics, dict) and metrics, "Simulation metrics are missing.")
    _require(all(type(value) in (int, float) and math.isfinite(value) for value in metrics.values() if not isinstance(value, list)), "Simulation metrics must be finite numbers.")
    _require(all(type(item) in (int, float) and math.isfinite(item) for value in metrics.values() if isinstance(value, list) for item in value), "Simulation vector metrics must be finite numbers.")
    _require(isinstance(record["review"], dict) and set(record["review"]) == {"columnReview", "engineeringVerification"}, "Review fields are unsupported.")
    _require(record["review"]["engineeringVerification"] in {"pending", "verified", "rejected"}, "Engineering verification state is invalid.")
    _require(isinstance(record["retention"], dict) and set(record["retention"]) == {"expiresAt", "artifactsAvailable"}, "Retention state is incomplete.")
    _require(type(record["retention"]["artifactsAvailable"]) is bool, "Artifact availability must be explicit.")
    # Defense in depth: these names should never appear anywhere in a portable record.
    lowered = _canonical(record).lower()
    _require(not any(token in lowered for token in ("api_key", "secret_key", "authorization", "signedurl", "signed_url")), "Evidence contains a prohibited credential or transient URL field.")
    return record


def build_live_evidence(*, preparation_id: str, draft: dict[str, Any], project_id: str,
                        simulation_id: str, run_id: str, run_spec_hash: str,
                        resources: list[dict[str, Any]], metrics: dict[str, Any],
                        reviewer: str, topology_mapping: dict[str, Any],
                        mapping_hash: str, mesh_level: int, expires_at: float) -> dict[str, Any]:
    source = draft["source"]
    portable_source = {
        "documentId": source["document_id"], "elementId": source["element_id"],
        "microversionId": source["microversion_id"], "versionId": source["version_id"],
        "partId": source["part_id"], "configuration": source["configuration"],
    }
    snapshot_key = ":".join(portable_source[key] for key in ("documentId", "microversionId", "elementId", "partId", "configuration"))
    result_body = {
        "projectId": project_id, "simulationId": simulation_id, "runId": run_id, "runSpecHash": run_spec_hash,
        "resources": resources, "metrics": metrics,
    }
    result = {**result_body, "resultHash": digest(result_body)}
    basis = {
        "preparationId": preparation_id, "projectId": project_id,
        "setupHash": draft["setupHash"], "resultHash": result["resultHash"],
    }
    record = {
        "schemaVersion": SCHEMA_VERSION,
        "evidenceId": digest(basis),
        "evidenceMode": "live",
        "sourceKind": "authorized_api",
        "provider": "simscale",
        "live": True,
        "binding": {
            "preparationId": "sha256-" + preparation_id,
            "snapshotKey": snapshot_key,
            "source": portable_source,
            "stepSha256": draft["stepSha256"],
            "geometrySha256": draft["geometrySha256"],
        },
        "lifecycleState": "COMPLETE",
        "currentness": "CURRENT",
        "setup": {
            "setupHash": draft["setupHash"], "runSpecHash": run_spec_hash,
            "material": draft["material"], "support": draft["support"],
            "load": draft["load"], "assumptions": draft["assumptions"],
            "topologyMapping": {
                "mappingHash": mapping_hash, "meshLevel": mesh_level,
                "body": topology_mapping["body"], "supports": topology_mapping["supports"],
                "loads": topology_mapping["loads"], "reviewer": topology_mapping["reviewer"],
                "geometryParityChecked": topology_mapping["geometryParityChecked"],
            },
        },
        "result": result,
        "review": {"columnReview": reviewer.strip(), "engineeringVerification": "pending"},
        "retention": {"expiresAt": expires_at, "artifactsAvailable": True},
    }
    return validate_evidence(record)
