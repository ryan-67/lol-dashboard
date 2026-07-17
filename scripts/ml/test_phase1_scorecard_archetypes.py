#!/usr/bin/env python3
"""Unit tests for Phase 1 scorecard + archetype validation helpers."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from build_accuracy_scorecard import (  # noqa: E402
    confidence_bucket,
    kalshi_closing_line_benchmark,
    patch_bucket,
    spearman_rank_corr,
)
from validate_champion_archetypes import (  # noqa: E402
    validate_primary_roles,
    validate_scaling_tags,
)


class ScorecardHelpersTest(unittest.TestCase):
    def test_confidence_buckets(self) -> None:
        self.assertEqual(confidence_bucket(0.5), "coin_flip_<8pp")
        self.assertEqual(confidence_bucket(0.6), "lean_8_15pp")
        self.assertEqual(confidence_bucket(0.7), "clear_15_25pp")
        self.assertEqual(confidence_bucket(0.9), "strong_>=25pp")

    def test_patch_bucket(self) -> None:
        self.assertEqual(patch_bucket("16.09"), "16.09")
        self.assertEqual(patch_bucket("15.15.1"), "15.15")
        self.assertEqual(patch_bucket(""), "unknown")

    def test_perfect_spearman(self) -> None:
        self.assertAlmostEqual(spearman_rank_corr([1, 2, 3, 4], [1, 2, 3, 4]), 1.0)

    def test_kalshi_benchmark_is_explicitly_blocked(self) -> None:
        hit = kalshi_closing_line_benchmark()
        self.assertEqual(hit["status"], "blocked_no_historical_archive")


class ArchetypeValidationTest(unittest.TestCase):
    def test_primary_role_agreement(self) -> None:
        archetypes = {
            "Ahri": {"primaryRoles": ["mid"]},
            "Camille": {"primaryRoles": ["top"]},
        }
        profiles = {
            "Ahri": {"totalGames": 40, "primaryRole": "mid", "recentPrimaryRole": "mid"},
            "Camille": {
                "totalGames": 40,
                "primaryRole": "top",
                "recentPrimaryRole": "support",
                "roleShift": True,
            },
        }
        report = validate_primary_roles(archetypes, profiles)
        self.assertEqual(report["checked"], 2)
        self.assertEqual(report["agree"], 1)
        self.assertEqual(report["mismatches"][0]["champion"], "Camille")

    def test_scaling_tag_agreement(self) -> None:
        archetypes = {
            "Caitlyn": {"tags": ["lane_bully"], "scalingCurve": "mid"},
            "Jinx": {"tags": ["scaling_carry"], "scalingCurve": "late"},
        }
        scaling = {
            "Caitlyn": {"games": 40, "laneBully": True, "lateGameScaler": False, "frontLoaded": False},
            "Jinx": {"games": 40, "laneBully": False, "lateGameScaler": True, "frontLoaded": False},
        }
        report = validate_scaling_tags(archetypes, scaling)
        self.assertEqual(report["lane_bully"]["agreementRatePct"], 100.0)
        self.assertEqual(report["late_scaler"]["agreementRatePct"], 100.0)


if __name__ == "__main__":
    unittest.main()
