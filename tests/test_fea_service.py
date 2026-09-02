from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.fea_service import FeaService, FeaServiceError, FeaStore, ServicePaths, sha256_value


ROOT = Path(__file__).resolve().parents[1]


class FakeClock:
    def __init__(self) -> None:
        self.now = 1_800_000_000.0

    def __call__(self) -> float:
        return self.now


class FeaServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.paths = ServicePaths(root / "fea.sqlite3", root / "artifacts")
        self.clock = FakeClock()
        self.service = FeaService(FeaStore(self.paths), clock=self.clock)
        domain = json.loads((ROOT / "web" / "fea-domain.json").read_text(encoding="utf-8"))
        unsigned = {
            "schemaVersion": "fea-study-1.0.0",
            "snapshotKey": "BRKT-001/onshape-a1b2@onshape-1.2.7",
            "analysisType": domain["analysisType"],
            "templateVersion": domain["template"]["templateVersion"],
            "material": {"materialKey": "al-6061-t6-demo", **domain["materials"]["al-6061-t6-demo"]},
            "load": {
                "type": "force", "enteredMagnitude": 441, "enteredUnit": "N",
                "magnitudeN": 441, "direction": [0, -1, 0],
            },
            "selections": domain["selectionContract"],
            "mesh": {"preset": "medium", **domain["meshPresets"]["medium"]},
            "requirements": {"minimumSafetyFactor": 2, "maximumDisplacementMm": 1},
        }
        self.manifest = {**unsigned, "studyHash": sha256_value(unsigned)}

    def tearDown(self) -> None:
        self.temp.cleanup()

    def approve_payload(self) -> dict[str, object]:
        return {
            "expectedSnapshotKey": self.manifest["snapshotKey"],
            "studyHash": self.manifest["studyHash"],
            "cadSharingAcknowledged": True,
            "computeAcknowledged": True,
        }

    def test_study_is_durable_and_creation_is_idempotent(self) -> None:
        created = self.service.create_study(self.manifest)
        repeated = self.service.create_study(self.manifest)
        reopened = FeaService(FeaStore(self.paths), clock=self.clock)
        self.assertTrue(created["created"])
        self.assertFalse(repeated["created"])
        self.assertEqual(created["study"]["studyId"], reopened.get_study(created["study"]["studyId"])["study"]["studyId"])

    def test_manifest_hash_and_selection_contract_fail_closed(self) -> None:
        with self.assertRaisesRegex(FeaServiceError, "hash"):
            self.service.create_study({**self.manifest, "studyHash": "sha256-bad"})
        bad = {**self.manifest, "selections": {**self.manifest["selections"], "load": "guessed-face"}}
        unsigned = {key: value for key, value in bad.items() if key != "studyHash"}
        bad["studyHash"] = sha256_value(unsigned)
        with self.assertRaisesRegex(FeaServiceError, "saved selections"):
            self.service.create_study(bad)

    def test_server_revalidates_every_controlled_manifest_section(self) -> None:
        mutations = (
            ("material", {**self.manifest["material"], "yieldStrengthPa": 999}),
            ("load", {**self.manifest["load"], "magnitudeN": 999}),
            ("load", {**self.manifest["load"], "direction": [0, 0, 0]}),
            ("mesh", {**self.manifest["mesh"], "relativeSizing": 99}),
            ("requirements", {**self.manifest["requirements"], "minimumSafetyFactor": 0.5}),
        )
        for section, value in mutations:
            with self.subTest(section=section, value=value):
                bad = {**self.manifest, section: value}
                unsigned = {key: item for key, item in bad.items() if key != "studyHash"}
                bad["studyHash"] = sha256_value(unsigned)
                with self.assertRaises(FeaServiceError):
                    self.service.create_study(bad)

    def test_human_acknowledgements_and_idempotency_guard_submission(self) -> None:
        study = self.service.create_study(self.manifest)["study"]
        with self.assertRaises(FeaServiceError) as missing:
            self.service.approve_and_submit(study["studyId"], {**self.approve_payload(), "cadSharingAcknowledged": False})
        self.assertEqual("FEA_APPROVAL_REQUIRED", missing.exception.code)
        first = self.service.approve_and_submit(study["studyId"], self.approve_payload())
        second = self.service.approve_and_submit(study["studyId"], self.approve_payload())
        self.assertEqual(first["study"]["runId"], second["study"]["runId"])
        self.assertEqual("human", first["study"]["approval"]["actor"])

    def test_recorded_job_progresses_and_persists_private_expiring_artifact(self) -> None:
        study = self.service.create_study(self.manifest)["study"]
        self.service.approve_and_submit(study["studyId"], self.approve_payload())
        self.clock.now += 0.5
        result = self.service.get_results(study["studyId"])["result"]
        self.assertEqual("recorded", result["solver"]["provider"])
        self.assertFalse(result["solver"]["live"])
        self.assertEqual("indeterminate", result["assessment"]["outcome"])
        self.assertTrue(result["artifacts"][0]["private"])
        self.assertTrue(any(self.paths.artifacts.rglob("normalized-result.json")))
        hash_input = {
            key: value for key, value in result.items() if key not in {"artifacts", "resultHash"}
        }
        self.assertEqual(sha256_value(hash_input), result["resultHash"])

    def test_stale_study_cannot_be_approved(self) -> None:
        study = self.service.create_study(self.manifest)["study"]
        self.service.mark_snapshot_current("new-snapshot")
        with self.assertRaises(FeaServiceError) as stale:
            self.service.approve_and_submit(study["studyId"], self.approve_payload())
        self.assertEqual("FEA_STALE_APPROVAL", stale.exception.code)

    def test_lifecycle_completion_and_currentness_are_independent(self) -> None:
        study = self.service.create_study(self.manifest)["study"]
        self.service.approve_and_submit(study["studyId"], self.approve_payload())
        self.clock.now += 0.5
        self.service.get_results(study["studyId"])
        self.service.mark_snapshot_current("different-snapshot")
        stale = self.service.get_study(study["studyId"])["study"]
        self.assertEqual("COMPLETE", stale["lifecycleState"])
        self.assertEqual("STALE", stale["currentness"])

    def test_expired_artifacts_are_deleted_but_records_remain(self) -> None:
        study = self.service.create_study(self.manifest)["study"]
        self.service.approve_and_submit(study["studyId"], self.approve_payload())
        self.clock.now += 0.5
        self.service.get_results(study["studyId"])
        self.clock.now += 8 * 86400
        self.assertEqual(1, self.service.store.cleanup_expired(self.clock.now))
        self.assertFalse(any(self.paths.artifacts.rglob("normalized-result.json")))
        self.assertEqual("COMPLETE", self.service.get_study(study["studyId"])["study"]["lifecycleState"])


if __name__ == "__main__":
    unittest.main()
