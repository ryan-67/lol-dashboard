import type { MergedPlayer } from "./oeData.ts";

function normalizeRole(position: string): string | null {
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

/** General composite — lane-agnostic ranking */
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
  if (fraudMode && (roleFilter === "adc" || role === "adc")) {
    return adcCarryScore(p);
  }
  return generalPlayerScore(p);
}

export function scoringNote(roleFilter: string | null, fraudMode: boolean): string {
  if (fraudMode && roleFilter === "adc") {
    return "ADC fraud ranking uses low dmg% + gold% carry impact (not just KDA/GD@15)";
  }
  if (fraudMode) {
    return "ranked by composite underperformance score";
  }
  return "ranked by composite performance score";
}
