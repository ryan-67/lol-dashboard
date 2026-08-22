import { isCompareQuestion, isSeriesRecapQuestion } from "./intents.ts";
import {
  extractCareerFactsFromWiki,
  verifyFact,
  type CandidateFact,
} from "./factVerifier.ts";
import { canonicalTeamName, dedupeByTeamIdentity } from "./teamIdentity.ts";
import { filterDisplayScheduleRows, hasUsableOpponentName } from "./tier1Filter.ts";
import {
  isPlayerWorldsTitleQuestion,
  isWorldsHistoryQuestion,
  lookupWorldsHistory,
} from "./worldsHistory.ts";
import {
  formatWeeklyWarehouseBlock,
  hasSeriesEvidence,
  isDatedMatchupRecap,
  isWeeklyLeagueRecapQuestion,
  keyLaneMatchups,
  lastMeetingFromWarehouse,
  parseAskedDate,
  pickWarehouseSeries,
  rowsInWeek,
  seasonH2hFromWarehouse,
  seasonRecordsFromWarehouse,
  shouldDrawCompareChart,
  type WarehouseSeriesRow,
} from "./warehouseFacts.ts";
import { extractTeams } from "./analystTools.ts";
import { hasSufficientKnowledge } from "./knowledgeCoverage.ts";
import {
  careerFactKey,
  dropChunksContradictingTools,
  selectWinningRagChunks,
  staleTitleChunkCannotVeto,
  type RagFactChunk,
} from "./ragFacts.ts";
import { factHash } from "./ragWriteback.ts";
import { buildTemporalContext, worldContextCoversAsk } from "./worldContext.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const QA = {
  week: "What happened in LCK this week?",
  faker: "How many World Championships has Faker won, and which years?",
  compare: "Compare T1 and Gen.G this LCK 2026 season.",
  recap: "Recap the KT Rolster vs T1 series from August 21, 2026.",
  predict: "Who wins T1 vs HLE on Sunday Aug 23?",
  followUp: "T1 beat KT 2-1 today; what's the key matchup vs HLE?",
};

const WEEK_NOW = "2026-08-22T12:00:00.000Z";

function row(
  date: string,
  teamA: string,
  teamB: string,
  scoreA: number | null,
  scoreB: number | null,
  extra: Partial<WarehouseSeriesRow> = {},
): WarehouseSeriesRow {
  const completed = scoreA != null && scoreB != null;
  return {
    league: extra.league ?? "LCK",
    tournament_name: extra.tournament_name ?? "LCK 2026",
    block_name: extra.block_name ?? "Week 13",
    team_a: teamA,
    team_b: teamB,
    scheduled_at: `${date}T09:00:00.000Z`,
    status: extra.status ?? (completed ? "completed" : "scheduled"),
    team_a_score: scoreA,
    team_b_score: scoreB,
    winner_team: extra.winner_team ??
      (completed && scoreA! > scoreB! ? teamA : completed ? teamB : null),
    best_of: 3,
  };
}

/** gol.gg LCK 2026 Week 13 + season H2H + academy leak + ??? opponent + KT case dup. */
const QA_WAREHOUSE: WarehouseSeriesRow[] = [
  row("2026-04-08", "Gen.G", "T1", 2, 0),
  row("2026-05-16", "T1", "Gen.G", 2, 1),
  row("2026-07-31", "T1", "Gen.G", 2, 0),
  row("2026-08-08", "Hanwha Life Esports", "T1", 2, 1),
  row("2026-08-16", "Gen.G", "T1", 2, 0),
  row("2026-08-19", "Gen.G", "KT Rolster", 2, 1),
  row("2026-08-19", "OKSavingsBank BRION", "DN Freecs", 2, 0),
  row("2026-08-20", "Hanwha Life Esports", "Dplus Kia", 2, 0),
  row("2026-08-20", "Nongshim RedForce", "DRX", 2, 0),
  row("2026-08-21", "T1", "kt Rolster", 2, 1),
  row("2026-08-21", "FearX", "OKSavingsBank BRION", 2, 1),
  row("2026-08-22", "Dplus Kia", "Gen.G", null, null),
  row("2026-08-22", "DN Freecs", "DRX", null, null),
  row("2026-08-23", "Hanwha Life Esports", "T1", null, null),
  row("2026-08-23", "FearX", "Nongshim RedForce", null, null),
  // Pollution that previously leaked into "LCK this week"
  row("2026-08-19", "DNS Challengers", "GEN Challengers", 3, 2, {
    league: "LCK",
    tournament_name: "LCK Challengers",
    block_name: "CL Week",
  }),
  row("2026-08-19", "Gen.G", "???", 4, 1, { league: "LCK" }),
];

Deno.test("weekly LCK recap routes to warehouse, not series/compare", () => {
  assert(isWeeklyLeagueRecapQuestion(QA.week), "week ask is a weekly recap");
  assert(!isDatedMatchupRecap(QA.week), "week ask is not a two-team series");
  assert(!isSeriesRecapQuestion(QA.week), "week ask is not a series recap");
  assert(!isCompareQuestion(QA.week), "week ask is not a compare");
  assertEquals(
    shouldDrawCompareChart(QA.week, "lolesports_general"),
    false,
    "week ask must not draw a radar",
  );
});

Deno.test("dated KT vs T1 recap is series, never a compare card", () => {
  assert(isDatedMatchupRecap(QA.recap), "dated recap detected");
  assert(isSeriesRecapQuestion(QA.recap), "dated recap is a series question");
  assert(!isCompareQuestion(QA.recap), "vs in a recap is not compare");
  assertEquals(
    shouldDrawCompareChart(QA.recap, "lolesports_series"),
    false,
    "series scope never draws compare",
  );
  assertEquals(
    shouldDrawCompareChart(QA.recap, "lolesports_compare"),
    false,
    "recap wording blocks compare even if scope is wrong",
  );
});

Deno.test("explicit season compare still draws a chart", () => {
  assert(isCompareQuestion(QA.compare), "compare ask stays compare");
  assert(!isSeriesRecapQuestion(QA.compare), "compare is not a recap");
  assertEquals(
    shouldDrawCompareChart(QA.compare, "lolesports_compare"),
    true,
    "explicit compare may chart",
  );
});

Deno.test("who-wins prediction does not emit a compare card", () => {
  assertEquals(
    shouldDrawCompareChart(QA.predict, "lolesports_compare"),
    false,
    "who wins must not radar",
  );
});

Deno.test("academy + ??? rows are stripped from LCK display", () => {
  const kept = filterDisplayScheduleRows(QA_WAREHOUSE);
  assert(
    kept.every((r) => !/challenger/i.test(`${r.team_a} ${r.team_b} ${r.tournament_name}`)),
    "no Challengers-as-LCK",
  );
  assert(
    kept.every((r) => hasUsableOpponentName(r.team_a) && hasUsableOpponentName(r.team_b)),
    "no ??? opponents",
  );
  assert(!hasUsableOpponentName("???"), "??? is unusable");
  assert(!hasUsableOpponentName("TBD"), "TBD is unusable");
});

Deno.test("LCK this week uses week-13 warehouse scores and upcoming names", () => {
  const { completed, upcoming } = rowsInWeek(QA_WAREHOUSE, WEEK_NOW, "LCK");
  const labels = completed.map((s) => `${s.date} ${s.teamA} ${s.score} ${s.teamB}`);
  assert(labels.some((l) => l.includes("2026-08-19") && l.includes("Gen.G") && l.includes("KT")), "GEN 2-1 KT");
  assert(labels.some((l) => l.includes("2026-08-19") && l.includes("BRION") && l.includes("DN")), "BRO 2-0 DNS");
  assert(labels.some((l) => l.includes("2026-08-20") && l.includes("Hanwha") && l.includes("Dplus")), "HLE 2-0 DK");
  assert(labels.some((l) => l.includes("2026-08-21") && l.includes("T1") && l.includes("KT")), "T1 2-1 KT");
  assert(labels.every((l) => !l.includes("???") && !/challenger/i.test(l)), "no academy/??? in completed");
  const up = upcoming.map((s) => `${s.date} ${s.teamA} vs ${s.teamB}`);
  assert(up.some((l) => l.includes("2026-08-22") && l.includes("Dplus") && l.includes("Gen.G")), "DK vs GEN");
  assert(up.some((l) => l.includes("2026-08-23") && l.includes("Hanwha") && l.includes("T1")), "HLE vs T1");
});

Deno.test("Aug 21 KT vs T1 warehouse series is T1 2-1, not May fail-close", () => {
  const hit = pickWarehouseSeries(QA_WAREHOUSE, "KT Rolster", "T1", QA.recap, WEEK_NOW);
  assert(hit, "warehouse must find the dated series");
  assertEquals(hit!.date, "2026-08-21", "must pick Aug 21, not an older meeting");
  assertEquals(hit!.score, "2-1", "T1 2-1");
  assertEquals(hit!.winner, "T1", "T1 won");
  assert(
    hasSeriesEvidence({
      tools: [{ tool: "warehouse_series_recap", seriesScore: "2-1", gamesFound: 3 }],
    }),
    "warehouse score is series evidence — do not fail-close",
  );
  assert(
    !hasSeriesEvidence({ tools: [{ tool: "series_recap", gamesFound: 0, seriesScore: "0-0" }] }),
    "empty OE recap is not evidence",
  );
});

Deno.test("team-id dedupe collapses KT Rolster vs kt Rolster", () => {
  const dup = [
    { name: "KT Rolster", games: 10 },
    { name: "kt Rolster", games: 8 },
    { name: "T1", games: 12 },
  ];
  const out = dedupeByTeamIdentity(dup, (t) => t.name, (a, b) => (b.games > a.games ? b : a));
  assertEquals(out.length, 2, "KT case variants collapse to one team");
  assert(
    out.some((t) => t.name === "KT Rolster") && out.some((t) => t.name === "T1"),
    "keeps canonical KT + T1",
  );

});

Deno.test("2026 LCK T1 vs GEN H2H is 2-2 series, not multi-year 9-8", () => {
  const h2h = seasonH2hFromWarehouse(QA_WAREHOUSE, "T1", "Gen.G", 2026, "LCK");
  assertEquals(h2h.meetings.length, 4, "four 2026 meetings");
  assertEquals(h2h.seriesWinsA + h2h.seriesWinsB, 4, "all four counted");
  assertEquals(h2h.seriesWinsA, 2, "T1 2 series wins");
  assertEquals(h2h.seriesWinsB, 2, "GEN 2 series wins");
  assert(h2h.note.includes("not a multi-year"), "note forbids decayed H2H as this split");
});

Deno.test("Faker Worlds years include 2024 and 2025 when curated/wiki evidence exists", () => {
  assert(isPlayerWorldsTitleQuestion(QA.faker), "player title question");
  assert(isWorldsHistoryQuestion(QA.faker), "worlds history must fire for World Championships");
  const hit = lookupWorldsHistory(QA.faker);
  assertEquals(hit.tool, "player_worlds_titles", "curated player table");
  const years = hit.data.years as number[];
  assert(years.includes(2024) && years.includes(2025), "2024 and 2025 present");
  assertEquals(hit.data.worldsTitles as number, 6, "six cups");
  assert(!years.includes(2026), "2026 Worlds not played");

  const wikiFact: CandidateFact = {
    fact: "Faker has won 6 League of Legends World Championships (2013, 2015, 2016, 2023, 2024, 2025)",
    entityType: "player",
    entityId: "faker",
    factKind: "career",
  };
  const verified = verifyFact(wikiFact, [
    {
      title: "Faker",
      url: "https://lol.fandom.com/wiki/Faker",
      content: "Lee Sang-hyeok (Faker) has won 6 World Championships in 2013, 2015, 2016, 2023, 2024 and 2025.",
      score: 1,
    },
    {
      title: "stale blog",
      url: "https://reddit.com/r/leagueoflegends/faker",
      content: "Faker has 4 world titles and nothing verified after 2023.",
      score: 0.4,
    },
  ]);
  assert(verified.verified, "one Leaguepedia page is enough; stale 4-title snippet must not veto");
});

Deno.test("last HLE vs T1 meeting is Aug 8 HLE 2-1; key matchup is jungle/adc", () => {
  const last = lastMeetingFromWarehouse(QA_WAREHOUSE, "T1", "Hanwha Life Esports", "LCK");
  assert(last, "last meeting exists");
  assertEquals(last!.date, "2026-08-08", "Aug 8 last LCK meeting");
  assertEquals(last!.winner, "Hanwha Life Esports", "HLE won 2-1");
  const keys = keyLaneMatchups(
    "T1",
    "Hanwha Life Esports",
    { jungle: "Oner", adc: "Peyz", mid: "Faker" },
    { jungle: "Kanavi", adc: "Gumayusi", mid: "Zeka" },
  );
  assert(keys.some((k) => /Oner vs Kanavi/i.test(k)), "Oner vs Kanavi");
  assert(keys.some((k) => /Peyz vs Gumayusi/i.test(k)), "Peyz vs Guma");
});

Deno.test("parseAskedDate handles August 21, 2026 and today", () => {
  assertEquals(parseAskedDate(QA.recap, WEEK_NOW), "2026-08-21", "named date");
  assertEquals(parseAskedDate("T1 beat KT 2-1 today", WEEK_NOW), "2026-08-22", "today vs client_now");
});

Deno.test("follow-up today T1 2-1 KT is not inverted as a loss", () => {
  const hit = pickWarehouseSeries(
    QA_WAREHOUSE,
    "T1",
    "KT Rolster",
    "T1 beat KT 2-1 today",
    WEEK_NOW,
  );
  assert(hit, "today's series present");
  assertEquals(hit!.winner, "T1", "T1 won — do not invert");
  assertEquals(hit!.score, "2-1", "2-1");
});

Deno.test("season records prefer warehouse game W/L over leftover OE 10-5 / 8-9", () => {
  const records = seasonRecordsFromWarehouse(QA_WAREHOUSE, 2026, "LCK");
  const t1 = records.find((r) => r.team === "T1");
  const gen = records.find((r) => r.team === "Gen.G");
  assert(t1 && gen, "both teams recorded");
  assert(t1!.gameWins !== 8 || t1!.gameLosses !== 7, "must not stay on stub OE 8-7");
  assert(gen!.gameWins >= 6, "GEN has 2026 warehouse games");
});

Deno.test("stale 4-title RAG chunk cannot veto a newer verified Faker 6-title fact", () => {
  const stale: RagFactChunk = {
    content: "Faker has won 4 World Championships (2013, 2015, 2016, 2023).",
    source: "web_verified",
    title: "Faker",
    entity_id: "faker",
    metadata: { kind: "career", written_at: "2024-01-01T00:00:00.000Z" },
  };
  const fresh: RagFactChunk = {
    content: "Faker has won 6 League of Legends World Championships (2013, 2015, 2016, 2023, 2024, 2025).",
    source: "web_verified",
    title: "Faker",
    entity_id: "faker",
    metadata: { kind: "career", written_at: "2026-08-21T00:00:00.000Z" },
  };
  const won = selectWinningRagChunks([stale, fresh]);
  assertEquals(won.length, 1, "one career fact per entity+factKind");
  assert(won[0]!.content.includes("2024") && won[0]!.content.includes("2025"), "winner has 2024+2025");
  assert(won[0]!.content.includes("6"), "winner is 6 titles");
  assert(staleTitleChunkCannotVeto(fresh.content, stale.content), "stale 4 cannot veto");
  assertEquals(careerFactKey("Faker", "career"), careerFactKey("faker", "career"), "entity key ignores case");

  const afterTools = dropChunksContradictingTools([stale, fresh], {
    tools: [{ tool: "player_worlds_titles", worldsTitles: 6, years: [2013, 2015, 2016, 2023, 2024, 2025] }],
  });
  assert(afterTools.every((c) => !/won 4/.test(c.content)), "tool 6-title drops stale 4");
});

Deno.test("career fact_hash is stable across splits so upsert replaces the stale row", async () => {
  const a = await factHash("faker", "career", "2025 Summer");
  const b = await factHash("faker", "career", "2026 Summer");
  assertEquals(a, b, "career hash ignores split");
  const other = await factHash("chovy", "career", "2026 Summer");
  assert(a !== other, "different entity is a different key");
});

Deno.test("GEN LCK titles and MSI 2026 HLE champ verify from one wiki page", () => {
  const genAsk = "How many LCK titles has GEN won?";
  const genFacts = extractCareerFactsFromWiki([
    {
      title: "Gen.G",
      url: "https://lol.fandom.com/wiki/Gen.G",
      content:
        "Gen.G has won 8 LCK titles (2016, 2017, 2022, 2023, 2024, 2025). The organization is the most decorated LCK champion.",
      score: 1,
    },
  ], genAsk);
  assert(genFacts.length >= 1, "wiki yields a GEN title fact");
  const genVerified = verifyFact(genFacts[0]!, [
    {
      title: "Gen.G",
      url: "https://lol.fandom.com/wiki/Gen.G",
      content:
        "Gen.G has won 8 LCK titles (2016, 2017, 2022, 2023, 2024, 2025). The organization is the most decorated LCK champion.",
      score: 1,
    },
  ]);
  assert(genVerified.verified, "one Leaguepedia page verifies GEN titles");
  assert(!/not in WORLD_CONTEXT/i.test(genVerified.fact), "fact is the wiki sentence");

  const msiAsk = "Who won MSI 2026?";
  const msiFacts = extractCareerFactsFromWiki([
    {
      title: "2026 Mid-Season Invitational",
      url: "https://lol.fandom.com/wiki/2026_Mid-Season_Invitational",
      content:
        "Hanwha Life Esports defeated Bilibili Gaming 3-2 on July 12, 2026 to win MSI 2026. Zeus was Finals MVP.",
      score: 1,
    },
  ], msiAsk);
  assert(msiFacts.some((f) => /hanwha life/i.test(f.fact) && /2026/.test(f.fact)), "HLE MSI 2026 fact");
  const msiVerified = verifyFact(msiFacts[0]!, [
    {
      title: "2026 Mid-Season Invitational",
      url: "https://lol.fandom.com/wiki/2026_Mid-Season_Invitational",
      content:
        "Hanwha Life Esports defeated Bilibili Gaming 3-2 on July 12, 2026 to win MSI 2026. Zeus was Finals MVP.",
      score: 1,
    },
  ]);
  assert(msiVerified.verified, "wiki MSI champ is verified");

  const temporal = buildTemporalContext(WEEK_NOW);
  assert(worldContextCoversAsk(msiAsk, temporal.block), "WORLD_CONTEXT already names HLE");
  assert(/hanwha life esports/i.test(temporal.block), "msi_2026_champion present");
});

Deno.test("stale web_verified chunk is not sufficient career knowledge", () => {
  const covered = hasSufficientKnowledge({
    chatOnly: false,
    scope: "lolesports_general",
    careerIntent: true,
    hasWebVerifiedChunk: true,
    matchStats: {},
    externalContext: "[web_verified — Faker] Faker has won 4 World Championships.",
    citoContext: "",
    citoHit: false,
    webSearchIntent: "career",
    citoIntent: "general",
    subjectiveIntent: false,
    hasFreshCareerFact: false,
  });
  assertEquals(covered, false, "must look up Leaguepedia; stale 4-title chunk is not enough");
});

Deno.test("T1 vs KT Aug 21 and recap-vs prompts never draw a compare card", () => {
  const dated = "T1 vs KT Aug 21";
  assert(isDatedMatchupRecap(dated), "dated vs is a series recap");
  assert(isSeriesRecapQuestion(dated), "dated vs routes as series");
  assert(!isCompareQuestion(dated), "dated vs is not compare");
  assertEquals(shouldDrawCompareChart(dated, "lolesports_compare"), false, "no radar");

  const recapVs = "Recap BFX vs BRO from August 21, 2026";
  assert(isDatedMatchupRecap(recapVs), "recap vs is dated");
  assert(!isCompareQuestion(recapVs), "recap vs is not compare");
  assertEquals(shouldDrawCompareChart(recapVs, "lolesports_series"), false, "series scope no chart");
  assertEquals(shouldDrawCompareChart(recapVs, "lolesports_compare"), false, "recap wording blocks chart");
});

Deno.test("team slug extract resolves BFX vs BRO without an OE row", () => {
  const teams = extractTeams("Recap BFX vs BRO from August 21, 2026", []);
  const names = teams.map((t) => canonicalTeamName(t.name));
  assert(names.includes("FearX"), "BFX → FearX");
  assert(names.includes("OKSavingsBank BRION"), "BRO → BRION");
  const hit = pickWarehouseSeries(QA_WAREHOUSE, "BFX", "BRO", "Recap BFX vs BRO from August 21, 2026", WEEK_NOW);
  assert(hit, "warehouse finds FearX vs BRION");
  assertEquals(hit!.date, "2026-08-21", "Aug 21");
  assertEquals(hit!.score, "2-1", "BFX 2-1 BRO");
});

Deno.test("weekly warehouse block keeps real opponents and standings", () => {
  const { completed, upcoming } = rowsInWeek(QA_WAREHOUSE, WEEK_NOW, "LCK");
  const standings = seasonRecordsFromWarehouse(QA_WAREHOUSE, 2026, "LCK");
  const block = formatWeeklyWarehouseBlock(completed, upcoming, "LCK", standings);
  const teams = [
    ...completed.map((s) => `${s.teamA} ${s.teamB}`),
    ...upcoming.map((s) => `${s.teamA} ${s.teamB}`),
  ].join(" ");
  assert(!teams.includes("???"), "no unknown opponents");
  assert(!/challenger/i.test(teams), "no academy");
  assert(Array.isArray(block.standings) && (block.standings as unknown[]).length > 0, "standings attached");
  assert(teams.includes("Gen.G") && teams.includes("KT Rolster"), "GEN vs KT present");
});
