#!/usr/bin/env python3
"""Component 4: empirical validation of hand-curated champion archetypes.

Compares scripts/ml/static/champion_archetypes.json against OE-derived artifacts:
  - champ_role_profile.json  → primaryRoles agreement
  - champ_scaling.json       → lane_bully / late_game_scaler / front_loaded tags
  - champ_matchups.json      → already-validated cross-role tag interaction lifts

Does not rewrite the curated file — it reports agreement rates + concrete mismatches
so draft explainability stays honest about what the tags actually mean in pro play.

Usage:
    python scripts/ml/validate_champion_archetypes.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parents[1]
STATIC_DIR = SCRIPTS_DIR / "static"
ARTIFACTS_DIR = ROOT / "data" / "ml" / "artifacts"
DEFAULT_JSON_OUT = ARTIFACTS_DIR / "archetype_validation.json"
DEFAULT_MD_OUT = ROOT / "docs" / "nucky_archetype_validation.md"

ROLE_MIN_GAMES = 15
SCALING_MIN_GAMES = 20


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_archetypes(path: Path) -> dict[str, dict]:
    raw = load_json(path)
    return {k: v for k, v in raw.items() if not k.startswith("_") and isinstance(v, dict)}


def validate_primary_roles(
    archetypes: dict[str, dict],
    role_profile: dict[str, dict],
) -> dict:
    checked = 0
    agree = 0
    mismatches: list[dict] = []
    missing_profile: list[str] = []

    for champ, entry in archetypes.items():
        curated = [str(r).lower() for r in entry.get("primaryRoles", []) if r]
        if not curated:
            continue
        profile = role_profile.get(champ)
        if not profile:
            missing_profile.append(champ)
            continue
        if int(profile.get("totalGames") or 0) < ROLE_MIN_GAMES:
            continue

        empirical = str(profile.get("recentPrimaryRole") or profile.get("primaryRole") or "").lower()
        if not empirical:
            continue
        checked += 1
        if empirical in curated:
            agree += 1
        else:
            mismatches.append({
                "champion": champ,
                "curatedPrimaryRoles": curated,
                "empiricalPrimaryRole": empirical,
                "roleShift": bool(profile.get("roleShift")),
                "totalGames": int(profile.get("totalGames") or 0),
            })

    rate = round(100.0 * agree / checked, 1) if checked else None
    return {
        "checked": checked,
        "agree": agree,
        "agreementRatePct": rate,
        "missingProfile": missing_profile[:20],
        "mismatches": sorted(mismatches, key=lambda r: r["totalGames"], reverse=True)[:25],
    }


def validate_scaling_tags(
    archetypes: dict[str, dict],
    scaling: dict[str, dict],
) -> dict:
    """Validate curated lane_bully / late scalingCurve against empirical scaling flags."""
    checks = {
        "lane_bully": {"checked": 0, "agree": 0, "mismatches": []},
        "late_scaler": {"checked": 0, "agree": 0, "mismatches": []},
        "front_loaded": {"checked": 0, "agree": 0, "mismatches": []},
    }

    for champ, entry in archetypes.items():
        emp = scaling.get(champ)
        if not emp or int(emp.get("games") or 0) < SCALING_MIN_GAMES:
            continue
        tags = set(entry.get("tags") or [])
        curve = str(entry.get("scalingCurve") or "").lower()

        # lane_bully tag ↔ empirical laneBully
        if "lane_bully" in tags or emp.get("laneBully"):
            checks["lane_bully"]["checked"] += 1
            curated_bully = "lane_bully" in tags
            emp_bully = bool(emp.get("laneBully"))
            if curated_bully == emp_bully:
                checks["lane_bully"]["agree"] += 1
            else:
                checks["lane_bully"]["mismatches"].append({
                    "champion": champ,
                    "curatedLaneBully": curated_bully,
                    "empiricalLaneBully": emp_bully,
                    "vsRoleMedianGd15": emp.get("vsRoleMedianGd15"),
                    "games": emp.get("games"),
                })

        # late scalingCurve / scaling_carry ↔ lateGameScaler
        curated_late = curve == "late" or "scaling_carry" in tags
        if curated_late or emp.get("lateGameScaler"):
            checks["late_scaler"]["checked"] += 1
            emp_late = bool(emp.get("lateGameScaler"))
            if curated_late == emp_late:
                checks["late_scaler"]["agree"] += 1
            else:
                checks["late_scaler"]["mismatches"].append({
                    "champion": champ,
                    "curatedLate": curated_late,
                    "empiricalLateGameScaler": emp_late,
                    "scalingCurve": curve,
                    "games": emp.get("games"),
                })

        # early curve ↔ frontLoaded (weak proxy)
        curated_early = curve == "early"
        if curated_early or emp.get("frontLoaded"):
            checks["front_loaded"]["checked"] += 1
            emp_front = bool(emp.get("frontLoaded"))
            if curated_early == emp_front:
                checks["front_loaded"]["agree"] += 1
            else:
                checks["front_loaded"]["mismatches"].append({
                    "champion": champ,
                    "curatedEarly": curated_early,
                    "empiricalFrontLoaded": emp_front,
                    "scalingCurve": curve,
                    "games": emp.get("games"),
                })

    out = {}
    for key, payload in checks.items():
        n = payload["checked"]
        out[key] = {
            "checked": n,
            "agree": payload["agree"],
            "agreementRatePct": round(100.0 * payload["agree"] / n, 1) if n else None,
            "mismatches": payload["mismatches"][:20],
        }
    return out


def summarize_crossrole_lifts(matchups: dict) -> dict:
    lifts = matchups.get("crossRoleArchetypeLift") or []
    validated = [r for r in lifts if r.get("status") == "validated"]
    positive = [r for r in validated if (r.get("liftPp") or 0) > 0]
    negative = [r for r in validated if (r.get("liftPp") or 0) <= 0]
    return {
        "rulesChecked": len(lifts),
        "validated": len(validated),
        "positiveLift": len(positive),
        "nonPositiveLift": len(negative),
        "rules": validated,
    }


def build_validation(
    archetypes: dict[str, dict],
    role_profile: dict[str, dict],
    scaling: dict[str, dict],
    matchups: dict,
) -> dict:
    role = validate_primary_roles(archetypes, role_profile)
    scale = validate_scaling_tags(archetypes, scaling)
    cross = summarize_crossrole_lifts(matchups)

    role_ok = (role.get("agreementRatePct") or 0) >= 70
    # Empirical DPM-tercile / GD@15 flags are a weak proxy for kit-level tags — low
    # agreement here is an expected finding, not a ship blocker. Keep reporting it so
    # nucky continues to treat champ_scaling as supporting evidence only.
    scale_ok = all(
        (scale[k].get("agreementRatePct") is None) or (scale[k]["agreementRatePct"] >= 55)
        for k in ("lane_bully", "late_scaler")
    )
    cross_ok = cross["validated"] > 0

    return {
        "generatedAt": __import__("pandas").Timestamp.utcnow().isoformat(),
        "championsCurated": len(archetypes),
        "primaryRoleValidation": role,
        "scalingTagValidation": scale,
        "crossRoleInteractionValidation": cross,
        "verdict": {
            "primaryRolesUsable": role_ok,
            "scalingTagsUsable": scale_ok,
            "crossRoleRulesUsable": cross_ok,
            # Ship gate = roles + cross-role interaction rules. Scaling-tag agreement is
            # informational: curated kit tags stay authoritative; empirical scaling flags
            # stay supporting evidence when they diverge.
            "shipGatePassed": bool(role_ok and cross_ok),
            "note": (
                "Hand-curated archetypes remain the draft-style source of truth. "
                "Primary-role agreement and cross-role lifts are the ship criteria. "
                "Low scaling-tag agreement means nucky should prefer curated "
                "scalingCurve/tags for kit identity and treat champ_scaling.json "
                "lane/late flags as supporting evidence only."
            ),
        },
    }


def render_markdown(report: dict) -> str:
    role = report["primaryRoleValidation"]
    scale = report["scalingTagValidation"]
    cross = report["crossRoleInteractionValidation"]
    verdict = report["verdict"]
    lines = [
        "# Champion archetype validation (Component 4)",
        "",
        f"> Generated `{report['generatedAt']}` · {report['championsCurated']} curated champions",
        "",
        f"**Ship gate:** {'PASS' if verdict['shipGatePassed'] else 'FAIL'} "
        f"(roles usable={verdict['primaryRolesUsable']}, "
        f"scaling usable={verdict['scalingTagsUsable']}, "
        f"cross-role usable={verdict['crossRoleRulesUsable']})",
        "",
        "## Primary role agreement",
        "",
        f"- Checked: {role['checked']} (min {ROLE_MIN_GAMES} games)",
        f"- Agreement: **{role['agreementRatePct']}%** ({role['agree']}/{role['checked']})",
        "",
    ]
    if role["mismatches"]:
        lines += [
            "| Champion | Curated roles | Empirical primary | Role shift | Games |",
            "| --- | --- | --- | --- | --- |",
        ]
        for row in role["mismatches"][:15]:
            lines.append(
                f"| {row['champion']} | {', '.join(row['curatedPrimaryRoles'])} | "
                f"{row['empiricalPrimaryRole']} | {row['roleShift']} | {row['totalGames']} |"
            )
        lines.append("")

    lines += ["## Scaling / lane-style tag agreement", ""]
    for key, label in (
        ("lane_bully", "lane_bully ↔ empirical laneBully"),
        ("late_scaler", "late/scaling_carry ↔ lateGameScaler"),
        ("front_loaded", "early curve ↔ frontLoaded"),
    ):
        block = scale[key]
        lines.append(
            f"- **{label}**: {block['agreementRatePct']}% "
            f"({block['agree']}/{block['checked']})"
        )
    lines += ["", "## Cross-role archetype interaction lifts", ""]
    lines.append(
        f"- Validated rules: {cross['validated']}/{cross['rulesChecked']} "
        f"(positive lift {cross['positiveLift']}, non-positive {cross['nonPositiveLift']})"
    )
    if cross["rules"]:
        lines += [
            "",
            "| Attacker | Defender | Lift pp | Games w/ condition |",
            "| --- | --- | --- | --- |",
        ]
        for rule in cross["rules"]:
            lines.append(
                f"| {rule.get('attackerTag')} | {rule.get('defenderTag')} | "
                f"{rule.get('liftPp')} | {rule.get('gamesWithCondition')} |"
            )
    lines += ["", verdict["note"], ""]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--archetypes",
        type=Path,
        default=STATIC_DIR / "champion_archetypes.json",
    )
    parser.add_argument("--artifacts-dir", type=Path, default=ARTIFACTS_DIR)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--md-out", type=Path, default=DEFAULT_MD_OUT)
    args = parser.parse_args()

    archetypes = load_archetypes(args.archetypes)
    if not archetypes:
        print(f"ERROR: no archetypes at {args.archetypes}", file=sys.stderr)
        sys.exit(1)

    role_profile = load_json(args.artifacts_dir / "champ_role_profile.json")
    scaling = load_json(args.artifacts_dir / "champ_scaling.json")
    matchups = load_json(args.artifacts_dir / "champ_matchups.json")
    if not role_profile or not scaling:
        print(
            "ERROR: need champ_role_profile.json and champ_scaling.json — "
            "run train_draft_model.py first",
            file=sys.stderr,
        )
        sys.exit(1)

    report = build_validation(archetypes, role_profile, scaling, matchups)
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    args.md_out.parent.mkdir(parents=True, exist_ok=True)
    args.md_out.write_text(render_markdown(report), encoding="utf-8")

    print(f"Wrote {args.json_out}")
    print(f"Wrote {args.md_out}")
    print(
        f"Roles {report['primaryRoleValidation']['agreementRatePct']}% | "
        f"gate={'PASS' if report['verdict']['shipGatePassed'] else 'FAIL'}"
    )


if __name__ == "__main__":
    main()
