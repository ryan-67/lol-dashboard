import type { MergedPlayer } from "./oeData.ts";

interface GameLogRow {
  date: string;
  result: number;
  champion: string;
  kda: number;
  gd15: number;
  opponent?: string;
  gameId?: string;
  kp?: number;
  dmgShare?: number;
  csd15?: number;
  dpm?: number;
}

interface GamePlayer {
  team: string;
  name: string;
  position: string;
  champion: string;
  kda: number;
  gd15: number;
  kp: number;
  dmgShare: number;
  won: boolean;
}

interface ParsedGame {
  id: string;
  date: string;
  teamA: string;
  teamB: string;
  winner: string;
  players: GamePlayer[];
}

interface SeriesBucket {
  teamA: string;
  teamB: string;
  games: ParsedGame[];
}

export interface SeriesPlayerLine {
  name: string;
  team: string;
  position: string;
  games: number;
  wins: number;
  avgKda: number;
  avgGd15: number;
  avgKp: number;
  avgDmgShare: number;
  champions: string[];
  perGame: Array<{
    game: number;
    date: string;
    champion: string;
    kda: number;
    gd15: number;
    kp: number;
    dmgShare: number;
    result: "W" | "L";
  }>;
}

export interface SeriesAnalysisResult {
  teamA: string;
  teamB: string;
  seriesScore: string;
  gameCount: number;
  dates: string[];
  split: string;
  league: string;
  winner?: string;
  gameSequence?: string[];
  gameFlow?: Array<{ game: number; date: string; gameId: string; winner: string; teamAResult: "W" | "L" }>;
  players: SeriesPlayerLine[];
  source: string;
  note?: string;
}

function normalizeTeam(name: string): string {
  return name.trim().toLowerCase();
}

function teamsMatch(a: string, b: string): boolean {
  return normalizeTeam(a) === normalizeTeam(b);
}

function seriesKey(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y)).join("|");
}

function parseDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: string, b: string): number {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 999;
  return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
}

function readLog(row: GameLogRow): GameLogRow {
  return row;
}

/** Match dashboard weeklyRecap / entity match ordering: date then gameId. */
function gameOrdinalFromId(id: string): number {
  const tail = id.match(/[_-](\d+)$/);
  if (tail) return Number(tail[1]);
  const embedded = id.match(/game[_-]?(\d+)/i);
  if (embedded) return Number(embedded[1]);
  return 0;
}

export function compareSeriesGames(
  a: { date: string; id: string },
  b: { date: string; id: string },
): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const byOrd = gameOrdinalFromId(a.id) - gameOrdinalFromId(b.id);
  if (byOrd !== 0) return byOrd;
  return a.id.localeCompare(b.id);
}

function sortSeriesGames(games: ParsedGame[]): ParsedGame[] {
  return [...games].sort(compareSeriesGames);
}

function collectMatchupGames(
  players: MergedPlayer[],
  teamA: string,
  teamB: string,
): ParsedGame[] {
  const gameMap = new Map<string, ParsedGame>();

  for (const player of players) {
    for (const raw of player.gameLog ?? []) {
      const g = readLog(raw as GameLogRow);
      const opponent = g.opponent?.trim();
      if (!opponent) continue;

      const isMatch =
        (teamsMatch(player.team, teamA) && teamsMatch(opponent, teamB)) ||
        (teamsMatch(player.team, teamB) && teamsMatch(opponent, teamA));
      if (!isMatch) continue;

      const id = g.gameId ?? `${g.date}|${player.team}|${opponent}|${g.result}`;
      let game = gameMap.get(id);
      if (!game) {
        const won = g.result === 1;
        game = {
          id,
          date: g.date,
          teamA,
          teamB,
          winner: won ? player.team : opponent,
          players: [],
        };
        gameMap.set(id, game);
      }

      game.players.push({
        team: player.team,
        name: player.name,
        position: player.position,
        champion: g.champion,
        kda: g.kda,
        gd15: g.gd15,
        kp: g.kp ?? 0,
        dmgShare: g.dmgShare ?? 0,
        won: g.result === 1,
      });
    }
  }

  return [...gameMap.values()].sort(compareSeriesGames);
}

function countSeriesWins(games: ParsedGame[], team: string): number {
  return games.filter((g) => g.winner === team).length;
}

function isValidSeriesScore(wA: number, wB: number): boolean {
  const max = Math.max(wA, wB);
  const min = Math.min(wA, wB);
  if (max >= 3) return max === 3 && min <= 2;
  if (max === 2) return min <= 1;
  return false;
}

function isSeriesComplete(
  games: ParsedGame[],
  teamA: string,
  teamB: string,
  nextGame?: ParsedGame,
): boolean {
  const wA = countSeriesWins(games, teamA);
  const wB = countSeriesWins(games, teamB);
  const max = Math.max(wA, wB);
  const min = Math.min(wA, wB);
  const total = wA + wB;

  if (max === 3) return true;
  if (max !== 2 || !isValidSeriesScore(wA, wB)) return false;

  const bo5InProgress = (total === 2 && min === 0) || (total === 3 && min === 1);
  if (!bo5InProgress) return true;
  if (!nextGame) return true;

  if (daysBetween(games[games.length - 1]!.date, nextGame.date) > 5) return true;

  const dayGap = daysBetween(games[games.length - 1]!.date, nextGame.date);
  if (dayGap >= 1 && total === 3 && min === 1) return true;

  return false;
}

function shouldBreakSeries(
  bucketGames: ParsedGame[],
  newGame: ParsedGame,
  teamA: string,
  teamB: string,
): boolean {
  if (!bucketGames.length) return false;
  const last = bucketGames[bucketGames.length - 1]!;
  if (daysBetween(last.date, newGame.date) > 5) return true;
  return isSeriesComplete(bucketGames, teamA, teamB, newGame);
}

function isValidGameOrder(games: ParsedGame[], teamA: string, teamB: string): boolean {
  let wA = 0;
  let wB = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i]!;
    if (g.winner === teamA) wA++;
    else if (g.winner === teamB) wB++;
    else return false;
    if (wA === 3 || wB === 3) return i === games.length - 1;
  }
  return isValidSeriesScore(wA, wB);
}

function permuteGames(games: ParsedGame[]): ParsedGame[][] {
  if (games.length <= 1) return [games];
  if (games.length > 7) return [games];
  const out: ParsedGame[][] = [];
  const arr = [...games];
  const walk = (k: number) => {
    if (out.length >= 5040) return;
    if (k === 1) {
      out.push([...arr]);
      return;
    }
    for (let i = 0; i < k; i++) {
      walk(k - 1);
      if (k % 2 === 0) [arr[i], arr[k - 1]] = [arr[k - 1]!, arr[i]!];
      else [arr[0], arr[k - 1]] = [arr[k - 1]!, arr[0]!];
    }
  };
  walk(arr.length);
  return out;
}

function orderDistance(a: ParsedGame[], b: ParsedGame[]): number {
  const indexB = new Map(b.map((g, i) => [g.id, i]));
  let dist = 0;
  for (let i = 0; i < a.length; i++) dist += Math.abs(i - (indexB.get(a[i]!.id) ?? i));
  return dist;
}

function orderSeriesGames(games: ParsedGame[], teamA: string, teamB: string): ParsedGame[] {
  if (games.length <= 1) return games;
  const byId = sortSeriesGames(games);
  if (isValidGameOrder(byId, teamA, teamB)) return byId;
  const valid = permuteGames(byId).filter((order) => isValidGameOrder(order, teamA, teamB));
  if (!valid.length) return byId;
  valid.sort((a, b) => orderDistance(a, byId) - orderDistance(b, byId));
  return valid[0]!;
}

function clusterByDate(games: ParsedGame[]): ParsedGame[][] {
  const sorted = sortSeriesGames(games);
  const clusters: ParsedGame[][] = [];
  let current: ParsedGame[] = [];
  for (const g of sorted) {
    if (!current.length || current[current.length - 1]!.date === g.date) current.push(g);
    else {
      clusters.push(current);
      current = [g];
    }
  }
  if (current.length) clusters.push(current);
  return clusters;
}

function splitPairGamesIntoSeries(games: ParsedGame[]): SeriesBucket[] {
  if (!games.length) return [];

  const sorted = sortSeriesGames(games);
  const teamA = sorted[0]!.teamA;
  const teamB = sorted[0]!.teamB;
  const orderedGames = clusterByDate(sorted).flatMap((cluster) =>
    orderSeriesGames(cluster, teamA, teamB),
  );
  const buckets: SeriesBucket[] = [];
  let current: ParsedGame[] = [];

  for (let i = 0; i < orderedGames.length; i++) {
    const g = orderedGames[i]!;
    if (!current.length) {
      current = [g];
      continue;
    }

    if (shouldBreakSeries(current, g, teamA, teamB)) {
      buckets.push({ teamA, teamB, games: current });
      current = [g];
    } else {
      current.push(g);
    }
  }

  if (current.length) buckets.push({ teamA, teamB, games: current });
  return buckets;
}

function groupIntoSeries(games: ParsedGame[]): SeriesBucket[] {
  if (!games.length) return [];
  const sorted = sortSeriesGames(games);
  const buckets: SeriesBucket[] = [];

  for (const bucket of splitPairGamesIntoSeries(sorted)) {
    buckets.push(bucket);
  }

  return buckets.sort((a, b) => {
    const aFirst = a.games[0]!;
    const bFirst = b.games[0]!;
    return compareSeriesGames(aFirst, bFirst);
  });
}

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function pickSeries(
  buckets: SeriesBucket[],
  message: string,
): SeriesBucket | null {
  if (!buckets.length) return null;

  const lower = message.toLowerCase();
  const wantYesterday = /\b(yesterday|last night)\b/i.test(lower);
  const gameCountMatch = lower.match(/\b(\d)\s*[- ]?\s*game\b/);
  const wantCount = gameCountMatch ? Number(gameCountMatch[1]) : null;

  if (wantYesterday) {
    const y = yesterdayIso();
    const hit = buckets.find((b) => b.games.some((g) => g.date.startsWith(y)));
    if (hit) return { ...hit, games: sortSeriesGames(hit.games) };
  }

  if (wantCount) {
    const exact = buckets.filter((b) => b.games.length === wantCount);
    if (exact.length) {
      const picked = exact[exact.length - 1]!;
      return { ...picked, games: sortSeriesGames(picked.games) };
    }
    const closest = [...buckets].sort(
      (a, b) => Math.abs(b.games.length - wantCount) - Math.abs(a.games.length - wantCount),
    )[0];
    if (closest) return { ...closest, games: sortSeriesGames(closest.games) };
  }

  const latest = buckets.reduce((best, cur) => {
    const bestGames = sortSeriesGames(best.games);
    const curGames = sortSeriesGames(cur.games);
    const bestLast = bestGames[bestGames.length - 1]?.date ?? "";
    const curLast = curGames[curGames.length - 1]?.date ?? "";
    if (curLast.localeCompare(bestLast) > 0) return { ...cur, games: curGames };
    if (curLast === bestLast) {
      const bestId = bestGames[bestGames.length - 1]?.id ?? "";
      const curId = curGames[curGames.length - 1]?.id ?? "";
      if (curId.localeCompare(bestId) > 0) return { ...cur, games: curGames };
    }
    return { ...best, games: bestGames };
  });
  return latest;
}

function aggregatePlayers(bucket: SeriesBucket): SeriesPlayerLine[] {
  const map = new Map<string, SeriesPlayerLine>();

  bucket.games.forEach((g, gameIdx) => {
    for (const p of g.players) {
      const key = `${p.team}|${p.name}`;
      const cur = map.get(key) ?? {
        name: p.name,
        team: p.team,
        position: p.position,
        games: 0,
        wins: 0,
        avgKda: 0,
        avgGd15: 0,
        avgKp: 0,
        avgDmgShare: 0,
        champions: [] as string[],
        perGame: [],
      };
      cur.games++;
      if (p.won) cur.wins++;
      cur.avgKda += p.kda;
      cur.avgGd15 += p.gd15;
      cur.avgKp += p.kp;
      cur.avgDmgShare += p.dmgShare;
      if (p.champion && !cur.champions.includes(p.champion)) {
        cur.champions.push(p.champion);
      }
      cur.perGame.push({
        game: gameIdx + 1,
        date: g.date,
        champion: p.champion,
        kda: p.kda,
        gd15: p.gd15,
        kp: p.kp,
        dmgShare: p.dmgShare,
        result: p.won ? "W" : "L",
      });
      map.set(key, cur);
    }
  });

  return [...map.values()]
    .map((s) => ({
      ...s,
      avgKda: Math.round((s.avgKda / s.games) * 100) / 100,
      avgGd15: Math.round((s.avgGd15 / s.games) * 10) / 10,
      avgKp: Math.round((s.avgKp / s.games) * 10) / 10,
      avgDmgShare: Math.round((s.avgDmgShare / s.games) * 10) / 10,
    }))
    .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
}

function seriesScore(bucket: SeriesBucket, teamA: string): string {
  let winsA = 0;
  let winsB = 0;
  for (const g of bucket.games) {
    if (teamsMatch(g.winner, teamA)) winsA++;
    else winsB++;
  }
  return `${winsA}-${winsB}`;
}

export function analyzeSeriesMatchup(
  players: MergedPlayer[],
  teamA: string,
  teamB: string,
  message: string,
  split: string,
  league: string,
): SeriesAnalysisResult | null {
  const games = collectMatchupGames(players, teamA, teamB);
  if (!games.length) {
    return {
      teamA,
      teamB,
      seriesScore: "0-0",
      gameCount: 0,
      dates: [],
      split,
      league,
      players: [],
      source: "oe_slices.players.gameLog",
      note: `no games found between ${teamA} and ${teamB} for the current filter`,
    };
  }

  const buckets = groupIntoSeries(games);
  const bucket = pickSeries(buckets, message);
  if (!bucket || !bucket.games.length) return null;

  const orderedGames = sortSeriesGames(bucket.games);
  const playerLines = aggregatePlayers({ ...bucket, games: orderedGames });
  const dates = [...new Set(orderedGames.map((g) => g.date))].sort();
  const score = seriesScore({ ...bucket, games: orderedGames }, teamA);
  const [winsA, winsB] = score.split("-").map(Number);
  const winner = winsA > winsB ? teamA : winsB > winsA ? teamB : "draw";
  const gameSequence = orderedGames.map((g) => (teamsMatch(g.winner, teamA) ? "W" : "L"));
  const gameFlow = orderedGames.map((g, idx) => ({
    game: idx + 1,
    date: g.date,
    gameId: g.id,
    winner: g.winner,
    teamAResult: (teamsMatch(g.winner, teamA) ? "W" : "L") as "W" | "L",
  }));

  return {
    teamA,
    teamB,
    seriesScore: score,
    gameCount: orderedGames.length,
    dates,
    split,
    league,
    winner,
    gameSequence,
    gameFlow,
    players: playerLines,
    source: "oe_slices.players.gameLog",
  };
}

export function isSeriesPlayerQuestion(message: string): boolean {
  const hasMatchup =
    /\b(vs\.?|versus|against)\b/i.test(message) ||
    (/\b(geng|gen\.?g)\b/i.test(message) && /\b(t1)\b/i.test(message));
  if (!hasMatchup) return false;

  return /\b(series|analyze|analysis|performance|per game|each game|all \d+ players|\d+ players|player.?level|game \d|bo[135]|yesterday|most recent|last (?:\w+\s+){0,5}(?:match|series)|last (match|series|night)|\d\s*[- ]?\s*game|reddit)\b/i
    .test(message);
}
