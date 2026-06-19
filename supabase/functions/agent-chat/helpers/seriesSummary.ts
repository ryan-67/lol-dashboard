export interface GameRow {
  date: string;
  team: string;
  opponent: string;
  result: "W" | "L";
  gameId: string;
}

export interface SeriesOutcome {
  teamA: string;
  teamB: string;
  seriesScore: string;
  gameCount: number;
  dates: string[];
  lastDate: string;
  winner: string;
  /** Chronological W/L from teamA's perspective (ordered by date + gameId). */
  gameSequence: string[];
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 999;
  return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
}

function dedupeAndSortGames(
  rows: Array<{ date: string; team: string; opponent: string; result: "W" | "L"; gameId?: string }>,
): GameRow[] {
  const map = new Map<string, GameRow>();
  for (const r of rows) {
    const gameId = r.gameId?.trim() || `${r.date}|${r.team}|${r.opponent}`;
    if (map.has(gameId)) continue;
    map.set(gameId, {
      date: r.date,
      team: r.team,
      opponent: r.opponent,
      result: r.result,
      gameId,
    });
  }
  return [...map.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId),
  );
}

function outcomeForBucket(bucket: GameRow[]): SeriesOutcome | null {
  if (!bucket.length) return null;

  const ordered = [...bucket].sort(
    (a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId),
  );
  const teamA = ordered[0]!.team;
  const teamB = ordered[0]!.opponent;

  let winsA = 0;
  let winsB = 0;
  const gameSequence: string[] = [];

  for (const g of ordered) {
    const aWon = g.team === teamA ? g.result === "W" : g.result === "L";
    gameSequence.push(aWon ? "W" : "L");
    if (aWon) winsA++;
    else winsB++;
  }

  const dates = [...new Set(ordered.map((g) => g.date))].sort();
  return {
    teamA,
    teamB,
    seriesScore: `${winsA}-${winsB}`,
    gameCount: ordered.length,
    dates,
    lastDate: dates[dates.length - 1] ?? ordered[ordered.length - 1]!.date,
    winner: winsA > winsB ? teamA : winsB,
    gameSequence,
  };
}

/** Group oe games into series using gameId order within date windows. */
export function summarizeRecentSeries(
  rows: Array<{ date: string; team: string; opponent: string; result: "W" | "L"; gameId?: string }>,
  limit = 8,
): SeriesOutcome[] {
  const games = dedupeAndSortGames(rows);
  const byPair = new Map<string, GameRow[]>();

  for (const g of games) {
    const key = [g.team, g.opponent].sort().join("|");
    const list = byPair.get(key) ?? [];
    list.push(g);
    byPair.set(key, list);
  }

  const allSeries: SeriesOutcome[] = [];

  for (const pairGames of byPair.values()) {
    const sorted = [...pairGames].sort(
      (a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId),
    );
    let bucket: GameRow[] = [];

    for (const g of sorted) {
      if (!bucket.length) {
        bucket.push(g);
        continue;
      }
      const last = bucket[bucket.length - 1]!;
      if (daysBetween(last.date, g.date) <= 5) {
        bucket.push(g);
      } else {
        const outcome = outcomeForBucket(bucket);
        if (outcome) allSeries.push(outcome);
        bucket = [g];
      }
    }

    if (bucket.length) {
      const outcome = outcomeForBucket(bucket);
      if (outcome) allSeries.push(outcome);
    }
  }

  return allSeries
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.gameCount - a.gameCount)
    .slice(0, limit);
}
