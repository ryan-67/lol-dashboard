import type { MergedPlayer } from "./oeData.ts";

export type RoleKey = "top" | "jungle" | "mid" | "adc" | "support";

function normalizeRole(position: string): RoleKey | null {
  const pos = position.toLowerCase();
  if (pos === "top") return "top";
  if (pos === "jungle" || pos === "jng") return "jungle";
  if (pos === "mid") return "mid";
  if (pos === "adc" || pos === "bot") return "adc";
  if (pos === "support" || pos === "sup") return "support";
  return null;
}

function norm(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

/**
 * Role-aware composite scores.
 *
 * Support/jungle MUST NOT be graded on damage share / dpm / dmg-gold — those
 * metrics are carry-role signals and produce nonsense fraud labels (e.g. ON).
 *
 * Approximate alignment with src/lib/playerRadar.ts ROLE_PERFORMANCE_SCORE_WEIGHTS,
 * using fields available on MergedPlayer in agent-chat.
 */
export function rolePlayerScore(p: MergedPlayer): number {
  const role = normalizeRole(p.position);
  switch (role) {
    case "top":
      // Isolated lane — laning diffs matter most.
      return (
        norm(p.gd15, -500, 500) * 0.3 +
        norm(p.csd15, -20, 20) * 0.25 +
        norm(p.xpd15, -400, 400) * 0.15 +
        norm(p.kda, 1, 6) * 0.2 +
        norm(p.dmgGoldRatio || p.dmgShare / Math.max(p.goldShare, 1), 0.8, 1.4) * 0.1
      );
    case "jungle":
      // Facilitating / early-impact role — KP + early influence, not DPM.
      return (
        norm(p.kp, 50, 80) * 0.3 +
        norm(p.kda, 1, 6) * 0.25 +
        norm(p.gd15, -400, 400) * 0.2 +
        norm(p.firstBloodRate, 0, 40) * 0.15 +
        norm(p.objControl, 0, 3) * 0.1
      );
    case "mid":
      // 1v1 + roam/carry hybrid — laning + damage.
      return (
        norm(p.gd15, -500, 500) * 0.25 +
        norm(p.csd15, -20, 20) * 0.15 +
        norm(p.dpm, 400, 800) * 0.2 +
        norm(p.dmgShare, 18, 32) * 0.2 +
        norm(p.kda, 1, 6) * 0.2
      );
    case "adc":
      // THE carry role — damage efficiency + resource share.
      return (
        norm(p.dpm, 450, 900) * 0.25 +
        norm(p.dmgShare, 18, 35) * 0.25 +
        norm(p.goldShare, 18, 30) * 0.15 +
        norm(p.dmgGoldRatio || p.dmgShare / Math.max(p.goldShare, 1), 0.9, 1.5) * 0.2 +
        norm(p.gd15, -400, 400) * 0.15
      );
    case "support":
      // Dynamic utility role — KP / involvement. Damage is irrelevant.
      return (
        norm(p.kp, 55, 85) * 0.4 +
        norm(p.kda, 1.5, 7) * 0.3 +
        norm(p.visionScore, 20, 80) * 0.2 +
        norm(p.gd15, -200, 200) * 0.1
      );
    default:
      return generalPlayerScore(p);
  }
}

/** General composite — lane-agnostic ranking fallback */
export function generalPlayerScore(p: MergedPlayer): number {
  return (
    norm(p.kda, 1, 6) * 0.35 +
    norm(p.gd15, -500, 500) * 0.25 +
    norm(p.dpm, 300, 700) * 0.15 +
    norm(p.dmgShare, 15, 35) * 0.15 +
    norm(p.kp, 50, 80) * 0.1
  );
}

/** ADC carry impact — dmg% + gold% (how much they actually shoulder the game) */
export function adcCarryScore(p: MergedPlayer): number {
  return norm(p.dmgShare, 18, 32) * 0.55 + norm(p.goldShare, 18, 28) * 0.45;
}

export function playerScoreForRanking(
  p: MergedPlayer,
  roleFilter: string | null,
  fraudMode: boolean,
): number {
  const role = normalizeRole(p.position);
  // ADC fraud/worst: prefer carry-impact when ranking ADCs specifically.
  if (fraudMode && (roleFilter === "adc" || role === "adc")) {
    return adcCarryScore(p);
  }
  return rolePlayerScore(p);
}

export function scoringNote(roleFilter: string | null, fraudMode: boolean): string {
  if (fraudMode && roleFilter === "adc") {
    return "ADC fraud ranking uses low dmg% + gold% carry impact (not just KDA/GD@15)";
  }
  if (fraudMode) {
    return "role-aware underperformance vs role peers (support≠dmg; jungle=KP/early; adc=carry dmg; top=laning)";
  }
  if (roleFilter === "support") {
    return "support ranked by KP / KDA / vision — damage metrics ignored";
  }
  if (roleFilter === "jungle") {
    return "jungle ranked by KP / KDA / early influence — not DPM";
  }
  if (roleFilter === "adc") {
    return "ADC ranked by DPM / dmg% / gold% / dmg-gold efficiency";
  }
  if (roleFilter === "top") {
    return "top ranked primarily by laning diffs (GD/CSD/XPD@15)";
  }
  if (roleFilter === "mid") {
    return "mid ranked by laning + damage output";
  }
  return "ranked by role-aware composite performance score";
}

/** Role-appropriate highlight stats for tool payloads / LLM grounding. */
export function roleRelevantStats(p: MergedPlayer): Record<string, number | string> {
  const role = normalizeRole(p.position);
  const base = {
    name: p.name,
    team: p.team,
    league: p.league,
    position: p.position,
    games: p.games,
    kda: p.kda,
  };
  switch (role) {
    case "support":
      return {
        ...base,
        kp: p.kp,
        visionScore: p.visionScore,
        gd15: p.gd15,
        scoringLens: "support: KP + KDA + vision (ignore dmg/dpm)",
      };
    case "jungle":
      return {
        ...base,
        kp: p.kp,
        gd15: p.gd15,
        firstBloodRate: p.firstBloodRate,
        objControl: p.objControl,
        scoringLens: "jungle: KP + early influence (ignore raw DPM)",
      };
    case "adc":
      return {
        ...base,
        dpm: p.dpm,
        dmgShare: p.dmgShare,
        goldShare: p.goldShare,
        dmgGoldRatio: p.dmgGoldRatio,
        gd15: p.gd15,
        scoringLens: "adc: DPM / dmg% / gold% / dmg-gold",
      };
    case "top":
      return {
        ...base,
        gd15: p.gd15,
        csd15: p.csd15,
        xpd15: p.xpd15,
        scoringLens: "top: laning diffs (GD/CSD/XPD@15)",
      };
    case "mid":
      return {
        ...base,
        gd15: p.gd15,
        csd15: p.csd15,
        dpm: p.dpm,
        dmgShare: p.dmgShare,
        scoringLens: "mid: laning + damage",
      };
    default:
      return { ...base, gd15: p.gd15, dpm: p.dpm, dmgShare: p.dmgShare, kp: p.kp };
  }
}

export { normalizeRole };
