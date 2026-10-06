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


if __name__ == "__main__":
    unittest.main()
