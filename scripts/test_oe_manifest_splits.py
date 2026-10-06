#!/usr/bin/env python3
"""Manifest split hygiene: ghosts drop, one-league splits stay."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from ingest_csv import canonical_split_key  # noqa: E402
from oe_manifest import apply_manifest_split_hygiene, audit_manifest_splits  # noqa: E402
from publish_oe_cdn_to_git import filter_year_files_for_publish  # noqa: E402


class CanonicalSplitKeyTest(unittest.TestCase):
    def test_year_column_plus_empty_split_date_fallback(self) -> None:
        # Riot supplement rows leave split blank. The label is Spring/Summer
        # from the date month, but the year prefix is the row year, not the date.
        self.assertEqual(
            canonical_split_key("LCS", "2027", "", "0", "2027-08-01"),
            "2027 Summer",
        )
        self.assertEqual(
            canonical_split_key("LCS", "2026", "", "0", "2026-08-12"),
            "2026 Summer",
        )
        self.assertEqual(
            canonical_split_key("LCS", "2027", "Summer", "0", "2026-09-01"),
            "2027 Summer",
        )

    def test_partial_international_labels_stay_distinct(self) -> None:
        self.assertEqual(
            canonical_split_key("WLDs", "2026", "Worlds", "0", "2026-09-19"),
            "2026 Worlds",
        )


class ManifestSplitHygieneTest(unittest.TestCase):
    def test_ghost_dropped_partial_leagues_kept(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            shard = data / "oe_slices_2026_p03.json"
            shard.write_text(
                json.dumps(
                    {
                        "slices": {
                            "2026 Summer|LCS": {"teams": [{"name": "A"}]},
                            "2026 Worlds|LPL": {"teams": [{"name": "B"}]},
                            "2026 Split 1|INT": {"teams": [{"name": "C"}]},
                        }
                    }
                ),
                encoding="utf-8",
            )
            payload = {
                "meta": {
                    "splits": [
                        "2026 Summer",
                        "2026 Worlds",
                        "2026 Split 1",
                        "2027 Summer",
                    ]
                },
                "year_files": {"2026": ["oe_slices_2026_p03.json"]},
            }
            referenced, ghosts, omitted = audit_manifest_splits(payload, data)
            self.assertEqual(ghosts, ["2027 Summer"])
            self.assertEqual(omitted, [])
            self.assertEqual(
                referenced,
                ["2026 Summer", "2026 Worlds", "2026 Split 1"],
            )

            dropped = apply_manifest_split_hygiene(payload, data)
            self.assertEqual(dropped, ["2027 Summer"])
            self.assertEqual(payload["meta"]["splits"], referenced)

            referenced, ghosts, omitted = audit_manifest_splits(payload, data)
            self.assertEqual(ghosts, [])
            self.assertEqual(omitted, [])

    def test_split_outside_published_year_files_is_a_ghost(self) -> None:
        """CDN publish keeps current-year shards only; the omitted year's split must go."""
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            (data / "oe_slices_2026.json").write_text(
                json.dumps({"slices": {"2026 Summer|LCK": {}}}),
                encoding="utf-8",
            )
            (data / "oe_slices_2027.json").write_text(
                json.dumps({"slices": {"2027 Summer|LCS": {}}}),
                encoding="utf-8",
            )
            payload = {
                "meta": {"splits": ["2026 Summer", "2027 Summer"]},
                "year_files": {"2026": "oe_slices_2026.json"},
            }
            dropped = apply_manifest_split_hygiene(payload, data)
            self.assertEqual(dropped, ["2027 Summer"])
            self.assertEqual(payload["meta"]["splits"], ["2026 Summer"])


class PublishScopeWarningTest(unittest.TestCase):
    def test_skipping_year_outside_publish_scope_names_files_and_splits(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            (data / "oe_slices_2026_p03.json").write_text(
                json.dumps(
                    {
                        "slices": {
                            "2026 Summer|LCS": {},
                            "2026 Worlds|LPL": {},
                        }
                    }
                ),
                encoding="utf-8",
            )
            (data / "oe_slices_2027_p01.json").write_text(
                json.dumps({"slices": {"2027 Summer|LCS": {}}}),
                encoding="utf-8",
            )
            (data / "oe_slices_2027_p02.json").write_text(
                json.dumps({"slices": {"2027 Winter|LCS": {}}}),
                encoding="utf-8",
            )
            year_files = {
                "2026": ["oe_slices_2026_p03.json"],
                "2027": ["oe_slices_2027_p01.json", "oe_slices_2027_p02.json"],
            }
            manifest_splits = ["2026 Summer", "2026 Worlds", "2027 Summer", "2027 Winter"]
            kept, warnings = filter_year_files_for_publish(
                year_files,
                {"2026"},
                data,
                manifest_splits,
            )
            self.assertEqual(list(kept), ["2026"])
            self.assertEqual(len(warnings), 1)
            warning = warnings[0]
            self.assertTrue(warning.startswith("WARNING:"))
            self.assertIn("skipping year 2027", warning)
            self.assertIn("OE_CDN_PUBLISH_YEARS", warning)
            self.assertIn("oe_slices_2027_p01.json", warning)
            self.assertIn("oe_slices_2027_p02.json", warning)
            self.assertIn("'2027 Summer'", warning)
            self.assertIn("'2027 Winter'", warning)
            self.assertNotIn("2026 Summer", warning)
            self.assertNotIn("2026 Worlds", warning)

    def test_publish_all_years_is_silent(self) -> None:
        kept, warnings = filter_year_files_for_publish(
            {"2026": "oe_slices_2026.json", "2027": "oe_slices_2027.json"},
            None,
            Path("."),
            ["2026 Summer", "2027 Summer"],
        )
        self.assertEqual(warnings, [])
        self.assertEqual(set(kept), {"2026", "2027"})


if __name__ == "__main__":
    unittest.main()
