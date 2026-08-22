import { isCompareQuestion, isSeriesRecapQuestion } from "./intents.ts";
import {
  extractCareerFactsFromWiki,
  verifyFact,
  type CandidateFact,
} from "./factVerifier.ts";
import { isNuckyTypoGreeting, formatNuckyTypoGreeting } from "./agentIdentity.ts";
import { canonicalTeamName, dedupeByTeamIdentity, teamsAreSame } from "./teamIdentity.ts";
import { filterDisplayScheduleRows, hasUsableOpponentName } from "./tier1Filter.ts";
import {
  isPlayerWorldsTitleQuestion,
  isWorldsHistoryQuestion,
  lookupWorldsHistory,
} from "./worldsHistory.ts";
import {
  dropSeriesNotInWarehouse,
  formatWeeklyWarehouseBlock,
  hasSeriesEvidence,
  hasWeeklyWindowAsk,
  inferLeagueFromMessage,
  isDatedMatchupRecap,
  isKnownLeftoverWeekSeries,
  isWeeklyLeagueRecapQuestion,
  isWhoWinsPrediction,
  keyLaneMatchups,
  isTeamLastSeriesQuestion,
  lastCompletedSeriesForTeam,
  lastMeetingFromWarehouse,
  overlayWarehouseSeasonRecords,
  parseAskedDate,
  pickWarehouseSeries,
  rowsInWeek,
  seasonH2hFromWarehouse,
  seasonRecordsFromWarehouse,
  shouldDrawCompareChart,
  weekContainsPair,
  type WarehouseSeriesRow,
} from "./warehouseFacts.ts";
import { extractTeams, runWarehouseSeriesRecap, runWeeklyWarehouseRecap } from "./analystTools.ts";
import {
  formatGengLckTitlesAnswer,
  formatMsi2026Answer,
  formatEntityClarifyAnswer,
  formatPlayerIdentityAnswer,
  formatPlayerStatAnswer,
  formatWarehouseSeriesAnswer,
  formatWeeklyWarehouseAnswer,
  isSimplePlayerStatAsk,
  toolsFromMatchStats,
  tryDeterministicAnswer,
} from "./deterministicAnswers.ts";
import { scrubLockedLeftovers } from "./responseSanitize.ts";
import {
  gengCollapsesBoth2023s,
  gengLckTitleFact,
  isGengLineageLeak,
  isTeamLckTitleQuestion,
  lookupTeamLckTitles,
  modernGengLckTitles,
  staleGengYearListCannotVeto,
} from "./teamTitles.ts";
import { hasSufficientKnowledge } from "./knowledgeCoverage.ts";
import {
  careerFactKey,
  dropChunksContradictingTools,
  dropLeftoverRecapChunks,
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
const temporalForTitles = buildTemporalContext(WEEK_NOW);

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

Deno.test("GEN LCK titles are 5 modern season titles, not KOO/SSG 2017–2020", () => {
  const genAsk = "How many LCK titles has GEN won?";
  assert(isTeamLckTitleQuestion(genAsk), "GEN LCK titles hit the curated table");
  const table = lookupTeamLckTitles(genAsk);
  assert(table, "curated GEN table answers");
  assertEquals(table!.tool, "team_lck_titles", "team_lck_titles tool");
  assertEquals(table!.data.lckTitles as number, 5, "five modern season titles");
  const labels = (table!.data.titles as Array<{ label: string; labelLong: string }>)
    .map((t) => t.label);
  assert(labels.includes("2022 Sum"), "2022 Sum");
  assert(labels.includes("2023 Spr"), "2023 Spr");
  assert(labels.includes("2023 Sum"), "2023 Sum");
  assert(labels.includes("2024 Spr"), "2024 Spr");
  assert(labels.includes("2025"), "2025");
  assert(
    labels.every((l) => !/\b2017\b|\b2018\b|\b2020\b/.test(l)),
    "no 2017/2018/2020 KOO/SSG-era years",
  );

  const wikiSnippet = {
    title: "Gen.G",
    url: "https://lol.fandom.com/wiki/Gen.G",
    content:
      "Predecessor KOO Tigers / Samsung Galaxy / SSG: 2017 Summer, 2018 Summer, 2020 Summer. " +
      "Modern Gen.G LCK season titles: 2022 Summer, 2023 Spring, 2023 Summer, 2024 Spring, 2025 (5 titles). " +
      "LCK Cup 2026 is a separate cup.",
    score: 1,
  };
  const genFacts = extractCareerFactsFromWiki([wikiSnippet], genAsk);
  assert(genFacts.length >= 1, "wiki yields a GEN title fact");
  const blob = genFacts.map((f) => f.fact).join(" ");
  assert(/2022/.test(blob) && /Summer/.test(blob), "2022 Summer");
  assert(/2023/.test(blob) && /Spring/.test(blob) && /Summer/.test(blob), "both 2023s");
  assert(/2024/.test(blob) && /Spring/.test(blob), "2024 Spring");
  assert(/2025/.test(blob), "2025");
  assert(!/\b2017\b/.test(blob) && !/\b2018\b/.test(blob) && !/\b2020\b/.test(blob), "no predecessor years");
  assert(!/cup 2026/i.test(blob) || /separate/i.test(blob), "Cup 2026 is not a 6th season title");

  const genVerified = verifyFact(genFacts[0]!, [wikiSnippet]);
  assert(genVerified.verified, "one Leaguepedia page verifies modern GEN titles");
  assert(!/not in WORLD_CONTEXT/i.test(genVerified.fact), "fact is the wiki sentence");

  const stale =
    "Gen.G has won 6 LCK titles (2017 Summer, 2018 Summer, 2020 Summer, 2022 Summer, 2024 Spring, 2025 Summer)";
  assert(staleGengYearListCannotVeto(gengLckTitleFact(), stale), "stale 6 cannot veto modern 5");
  assert(staleTitleChunkCannotVeto(gengLckTitleFact(), stale), "stale year list cannot veto");

  const staleChunk: RagFactChunk = {
    content: stale,
    source: "web_verified",
    title: "Gen.G",
    entity_id: "geng",
    metadata: { kind: "career", written_at: "2024-01-01T00:00:00.000Z" },
  };
  const freshChunk: RagFactChunk = {
    content: gengLckTitleFact(),
    source: "web_verified",
    title: "Gen.G",
    entity_id: "geng",
    metadata: { kind: "career", written_at: "2026-08-21T00:00:00.000Z" },
  };
  const won = selectWinningRagChunks([staleChunk, freshChunk]);
  assertEquals(won.length, 1, "one GEN career fact");
  assert(/5/.test(won[0]!.content) && /2023/.test(won[0]!.content), "winner is modern 5");
  assert(!gengPredecessorIn(won[0]!.content), "winner has no 2017/2018/2020");

  const afterTools = dropChunksContradictingTools([staleChunk, freshChunk], {
    tools: [{ tool: "team_lck_titles", lckTitles: 5, years: [2022, 2023, 2023, 2024, 2025] }],
  });
  assert(afterTools.every((c) => !/\b2017\b/.test(c.content)), "tool 5-title drops KOO/SSG list");

  const yearAsk = "GEN title years";
  assert(isTeamLckTitleQuestion(yearAsk), "GEN title years hits curated table");
  const yearTable = lookupTeamLckTitles(yearAsk);
  assert(yearTable && (yearTable.data.lckTitles as number) === 5, "title years still 5 modern");
  const yearFacts = extractCareerFactsFromWiki([wikiSnippet], yearAsk);
  assert(yearFacts.some((f) => /5 modern/.test(f.fact) || /2023/.test(f.fact)), "wiki extract without the word LCK");
  assert(worldContextCoversAsk(yearAsk, temporalForTitles.block), "WORLD_CONTEXT covers GEN titles");
  assert(worldContextCoversAsk(genAsk, temporalForTitles.block), "WORLD_CONTEXT covers how-many LCK");
});

function gengPredecessorIn(text: string): boolean {
  return /\b2017\b/.test(text) || /\b2018\b/.test(text) || /\b2020\b/.test(text);
}

Deno.test("MSI 2026 HLE champ verifies from one wiki page", () => {
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

Deno.test("weekly recap does not invent HLE vs FearX Aug 19", () => {
  const { completed, upcoming } = rowsInWeek(QA_WAREHOUSE, WEEK_NOW, "LCK");
  assert(
    !weekContainsPair(completed, upcoming, "Hanwha Life Esports", "FearX", "2026-08-19"),
    "warehouse week has no HLE vs FearX on Aug 19",
  );
  const leftoverOe = {
    teamA: "Hanwha Life Esports",
    teamB: "FearX",
    scoreA: 0,
    scoreB: 2,
    winner: "FearX",
    loser: "Hanwha Life Esports",
    score: "0-2",
    date: "2026-08-19",
    league: "LCK",
    status: "completed" as const,
  };
  const emitted = dropSeriesNotInWarehouse([...completed, leftoverOe], QA_WAREHOUSE);
  assert(
    !emitted.some((s) =>
      s.date === "2026-08-19" &&
      /hanwha/i.test(`${s.teamA} ${s.teamB}`) &&
      /fearx/i.test(`${s.teamA} ${s.teamB}`)
    ),
    "leftover OE HLE 0-2 FearX is not emitted",
  );
  const block = formatWeeklyWarehouseBlock(emitted, upcoming, "LCK");
  const blob = JSON.stringify(block.completed);
  assert(
    !emitted.some((s) => /hanwha/i.test(s.teamA + s.teamB) && /fearx/i.test(s.teamA + s.teamB)),
    "week block has no invented HLE-FearX",
  );
  assert(!/HLE 0-2 FearX|FearX 2-0 Hanwha/i.test(blob), "no leftover HLE-FearX scoreline");
  assert(
    JSON.stringify(block.note).includes("FAIL-CLOSED") ||
      JSON.stringify(block.note).includes("not listed"),
    "fail-closed note present",
  );
});

/** Pad 2026 LCK so T1 is 17-8 and KT is 15-11 series (QA fixture alone is leftover 3-3). */
function seasonWarehouse(): WarehouseSeriesRow[] {
  const extra: WarehouseSeriesRow[] = [];
  for (let i = 1; i <= 14; i++) {
    extra.push(row(`2026-03-${String(i).padStart(2, "0")}`, "T1", "DRX", 2, 0));
  }
  for (let i = 1; i <= 5; i++) {
    extra.push(row(`2026-02-${String(i).padStart(2, "0")}`, "DRX", "T1", 2, 0));
  }
  for (let i = 1; i <= 15; i++) {
    extra.push(row(`2026-04-${String(i).padStart(2, "0")}`, "KT Rolster", "Nongshim RedForce", 2, 0));
  }
  for (let i = 1; i <= 9; i++) {
    extra.push(row(`2026-05-${String(i).padStart(2, "0")}`, "Nongshim RedForce", "KT Rolster", 2, 0));
  }
  return [...QA_WAREHOUSE, ...extra];
}

Deno.test("dated T1–KT recap uses warehouse series W/L, not leftover OE 3-3 / 1-6", () => {
  const leftoverOe = [
    { team: "T1", seriesWins: 3, seriesLosses: 3, gameWins: 8, gameLosses: 8 },
    { team: "KT Rolster", seriesWins: 1, seriesLosses: 6, gameWins: 4, gameLosses: 14 },
  ];
  const warehouse = [
    { team: "T1", seriesWins: 17, seriesLosses: 8, gameWins: 40, gameLosses: 22 },
    { team: "KT Rolster", seriesWins: 15, seriesLosses: 11, gameWins: 38, gameLosses: 30 },
  ];
  const overlaid = overlayWarehouseSeasonRecords(
    { teamA: "T1", teamB: "KT Rolster", seriesScore: "2-1", date: "2026-08-21", note: "series" },
    warehouse,
    leftoverOe,
  );
  const records = overlaid.seasonRecords as Array<{ team: string; series: string }>;
  assert(records.some((r) => r.team === "T1" && r.series === "17-8"), "T1 warehouse 17-8");
  assert(records.some((r) => r.team === "KT Rolster" && r.series === "15-11"), "KT warehouse 15-11");
  assert(
    records.every((r) => r.series !== "3-3" && r.series !== "1-6"),
    "leftover OE 3-3 / 1-6 must not attach",
  );

  const recap = runWarehouseSeriesRecap("T1 vs KT Aug 21", seasonWarehouse(), [], WEEK_NOW);
  assert(recap, "warehouse series recap fires");
  assertEquals((recap!.data.seriesScore as string), "2-1", "score 2-1 stays");
  const attached = recap!.data.seasonRecords as Array<{ team: string; series: string }>;
  const t1 = attached.find((r) => r.team === "T1");
  const kt = attached.find((r) => r.team === "KT Rolster");
  assert(t1 && t1.series === "17-8", `T1 series W/L is 17-8, got ${t1?.series}`);
  assert(kt && kt.series === "15-11", `KT series W/L is 15-11, got ${kt?.series}`);
  assert(/17-8/.test(String(recap!.data.note)) || /warehouse/.test(String(recap!.data.note)), "note cites warehouse W/L");

  const thin = overlayWarehouseSeasonRecords(
    { teamA: "T1", teamB: "KT Rolster", seriesScore: "2-1", date: "2026-08-21" },
    seasonRecordsFromWarehouse(QA_WAREHOUSE, 2026, "LCK"),
  );
  const thinRecords = (thin.seasonRecords as Array<{ team: string; series: string }>) ?? [];
  assert(
    thinRecords.every((r) => r.series !== "3-3" && r.series !== "1-6"),
    "week-only warehouse 3-3 must not attach as season W/L",
  );
});

Deno.test("asked-date miss does not invent HLE–FearX Aug 19 from another meeting", () => {
  const withOtherDay: WarehouseSeriesRow[] = [
    ...QA_WAREHOUSE,
    row("2026-08-12", "Hanwha Life Esports", "FearX", 2, 0),
  ];
  const asked = "HLE vs FearX around Aug 19";
  assert(isDatedMatchupRecap(asked), "dated pair is a series recap");
  assertEquals(inferLeagueFromMessage(asked), "LCK", "HLE/FearX infer LCK");
  const hit = pickWarehouseSeries(
    withOtherDay,
    "Hanwha Life Esports",
    "FearX",
    asked,
    WEEK_NOW,
  );
  assertEquals(hit, null, "Aug 19 is not in warehouse — do not fall through to Aug 12");
  const recap = runWarehouseSeriesRecap(asked, withOtherDay, [], WEEK_NOW);
  assert(recap, "miss still emits warehouse_series_recap");
  assertEquals(recap!.data.seriesScore as string, "0-0", "no invented score");
  assert(recap!.data.missingAskedSeries === true, "missingAskedSeries flag");
  assert(
    hasSufficientKnowledge({
      chatOnly: false,
      scope: "lolesports_series",
      careerIntent: false,
      hasWebVerifiedChunk: false,
      matchStats: { tools: [{ tool: "warehouse_series_recap", ...recap!.data }] },
      externalContext: "[web_verified] HLE 0-2 FearX on August 19",
      citoContext: "",
      citoHit: false,
      webSearchIntent: "general",
      citoIntent: "general",
      subjectiveIntent: false,
    }),
    "warehouse miss is sufficient — do not Tavily-invent the series",
  );
});

Deno.test("this week + HLE vs FearX Aug 19 still emits warehouse week, not the invented pair", () => {
  const combined = "this week's LCK / HLE vs FearX around Aug 19";
  assert(hasWeeklyWindowAsk(combined), "combined ask keeps the week window");
  const weekly = runWeeklyWarehouseRecap(combined, QA_WAREHOUSE, "LCK", WEEK_NOW);
  assert(weekly, "weekly warehouse still runs");
  const completed = (weekly!.data.completed as Array<{ teamA: string; teamB: string; date: string }>) ?? [];
  assert(
    !completed.some((s) =>
      /hanwha/i.test(`${s.teamA} ${s.teamB}`) && /fearx/i.test(`${s.teamA} ${s.teamB}`)
    ),
    "week block has no HLE–FearX",
  );
  const leftover: RagFactChunk = {
    content: "HLE 0-2 FearX on August 19, 2026",
    source: "web_verified",
    title: "LCK week",
  };
  const leftoverDrx: RagFactChunk = {
    content: "DRX 2-1 BRO on August 20, 2026",
    source: "web_verified",
    title: "gol.gg week",
  };
  const dropped = dropLeftoverRecapChunks([leftover, leftoverDrx], {
    tools: [{ tool: "weekly_warehouse_recap", completed }],
  });
  assertEquals(dropped.length, 0, "leftover HLE–FearX Aug 19 and DRX–BRO Aug 20 RAG is dropped");
});

Deno.test("pass-2 leftover: GEN 2014 Samsung White / 2017 / collapsed 2023 cannot beat the modern 5", () => {
  const leak =
    "Gen.G has 6 LCK titles: 2014 Samsung White, 2017 Samsung, 2022, 2023, 2024–2025";
  assert(isGengLineageLeak(leak), "2014 Samsung White + 2017 is a lineage leak");
  assert(gengCollapsesBoth2023s(leak), "2023 collapsed to one year");
  assert(!isGengLineageLeak(gengLckTitleFact()), "curated 5 is not a leak");
  const collapsedWiki = modernGengLckTitles([{ year: 2023, split: "" }, { year: 2022, split: "Summer" }]);
  assert(
    collapsedWiki.some((t) => t.year === 2023 && t.split === "Spring") &&
      collapsedWiki.some((t) => t.year === 2023 && t.split === "Summer"),
    "year-only 2023 is replaced by both 2023 splits",
  );
  const wiki2014 = extractCareerFactsFromWiki([
    {
      title: "Gen.G",
      url: "https://lol.fandom.com/wiki/Gen.G",
      content: leak,
      score: 1,
    },
  ], "how many LCK titles does GEN have");
  const blob = wiki2014.map((f) => f.fact).join(" ");
  assert(!/\b2014\b/.test(blob) && !/samsung white/i.test(blob), "wiki extract drops 2014 Samsung White");
  assert(/2023 Spring/.test(blob) && /2023 Summer/.test(blob), "both 2023s listed");
  assertEquals(formatGengLckTitlesAnswer().includes("2023 Spring"), true, "deterministic lists 2023 Spring");
  const det = tryDeterministicAnswer("GEN title years", [{
    tool: "team_lck_titles",
    data: lookupTeamLckTitles("GEN title years")!.data,
  }]);
  assert(det && /5 modern/.test(det) && /2023 Spring/.test(det) && /2023 Summer/.test(det), "deterministic 5");
  assert(!/2014|2017|Samsung/i.test(det!), "deterministic has no lineage years");
  const scrubbed = scrubLockedLeftovers(leak, "how many LCK titles does GEN have");
  assert(/5 modern/.test(scrubbed) && !/2014/.test(scrubbed), "sanitize rewrites Leaguepedia lineage");
});

Deno.test("pass-2 leftover: gol.gg week inventions and T1–KT form are not emitted", () => {
  const { completed, upcoming } = rowsInWeek(QA_WAREHOUSE, WEEK_NOW, "LCK");
  const weekText = formatWeeklyWarehouseAnswer(
    formatWeeklyWarehouseBlock(completed, upcoming, "LCK"),
  );
  assert(
    !weekText.split("\n").some((l) => /fearx/i.test(l) && /hanwha|\bhle\b/i.test(l)),
    "week text has no HLE–FearX pair",
  );
  assert(
    !weekText.split("\n").some((l) =>
      /2026-08-20/.test(l) && /\bdrx\b/i.test(l) && /brion|\bbro\b/i.test(l)
    ),
    "week text has no DRX–BRO Aug 20",
  );
  const invented = scrubLockedLeftovers(
    "FearX 2-0 HLE on Aug 19\nDRX 2-1 BRO on Aug 20\nGen.G 2-1 KT on Aug 19",
    "What happened in LCK this week?",
  );
  assert(!/fearx/i.test(invented) || !/hle/i.test(invented), "sanitize drops FearX–HLE Aug 19");
  assert(!/drx 2-1/i.test(invented), "sanitize drops DRX–BRO Aug 20");

  const recap = runWarehouseSeriesRecap("T1 vs KT Aug 21", seasonWarehouse(), [], WEEK_NOW);
  const det = tryDeterministicAnswer(
    "Recap T1 vs KT Aug 21",
    toolsFromMatchStats({ tools: [{ tool: recap!.tool, ...recap!.data }] }),
  );
  assert(det && /2-1/.test(det), "deterministic keeps series 2-1");
  assert(/17-8/.test(det!) && /15-11/.test(det!), "deterministic uses warehouse season W/L");
  assert(!/3-3|1-6|8-7|6-13|54\.5|44%/.test(det!), "no leftover gol.gg form");
  const leftoverWl = formatWarehouseSeriesAnswer({
    teamA: "T1",
    teamB: "KT Rolster",
    seriesScore: "2-1",
    date: "2026-08-21",
    winner: "T1",
    seasonRecords: [
      { team: "T1", series: "3-3", games: "8-7" },
      { team: "KT Rolster", series: "1-6", games: "6-13" },
    ],
  });
  assert(/2-1/.test(leftoverWl), "score stays");
  assert(!/3-3|1-6/.test(leftoverWl), "leftover 3-3 / 1-6 not printed");
  const scrubbedWl = scrubLockedLeftovers(
    "T1 beat KT 2-1. W/L 3-3 / 1-6, games 8-7 / 6-13, 54.5% over 44.",
    "T1 vs KT Aug 21",
  );
  assert(/2-1/.test(scrubbedWl), "sanitize keeps score");
  assert(!/3-3|1-6|8-7|6-13|54\.5|44%/.test(scrubbedWl), "sanitize drops leftover form");
});

Deno.test("hi nucy is a typo greeting, not homework", () => {
  assert(isNuckyTypoGreeting("hi nucy"), "hi nucy is a typo greet");
  assert(!isNuckyTypoGreeting("hey nucky"), "canon greet is not a typo");
  const locked = tryDeterministicAnswer("hi nucy", []);
  assert(locked === formatNuckyTypoGreeting("hi nucy"), "locks who's nucy");
  assert(/i'm nucky/i.test(locked!), "identifies as nucky");
});

Deno.test("MSI 2026 and Worlds 2025 lock curated finals facts", () => {
  const msi = tryDeterministicAnswer("Who won MSI 2026?", []);
  assert(msi === formatMsi2026Answer(), "MSI lock");
  assert(/3-2/.test(msi!) && /bilibili/i.test(msi!) && /zeus/i.test(msi!), "HLE 3-2 BLG Zeus");
  const worlds = tryDeterministicAnswer("Who won Worlds 2025, and who was FMVP?", []);
  assert(worlds && /T1/.test(worlds) && /3-2/.test(worlds) && /KT/i.test(worlds), "T1 3-2 KT");
  assert(/Gumayusi/i.test(worlds!) && /Doran/i.test(worlds!), "Guma FMVP + Doran top");
});

Deno.test("HANJIN BRION aliases to BRO so FearX Aug 21 resolves", () => {
  assert(teamsAreSame("BRO", "HANJIN BRION"), "BRO == HANJIN BRION");
  assert(teamsAreSame("FearX", "BFX"), "BFX == FearX");
  const picked = pickWarehouseSeries(
    [row("2026-08-21", "FearX", "HANJIN BRION", 2, 1)],
    "FearX",
    "OKSavingsBank BRION",
    "Recap FearX vs BRO on August 21.",
    WEEK_NOW,
  );
  assert(picked != null && picked.score === "2-1", "picks BFX 2-1 HANJIN");
  assert(/FearX/i.test(picked!.winner), "FearX won");
});

Deno.test("who-wins future series is not a missing warehouse recap", () => {
  const pred = "Who wins T1 vs HLE on Sunday Aug 23?";
  assert(isWhoWinsPrediction(pred), "who-wins is a prediction");
  assert(!isDatedMatchupRecap(pred), "who-wins is not a recap");
  const locked = tryDeterministicAnswer(pred, [{
    tool: "warehouse_series_recap",
    data: { missingAskedSeries: true, teamA: "T1", teamB: "Hanwha Life Esports", seriesScore: "0-0" },
  }]);
  assert(locked == null, "do not lock 'no warehouse series' on a prediction");
  assert(
    isDatedMatchupRecap("why did T1 lose to HLE on August 8, 2026?"),
    "lose-to + date is a recap",
  );
});

Deno.test("warehouse week drops leftover FearX–HLE Aug 19 and DRX–BRO Aug 20", () => {
  assert(
    isKnownLeftoverWeekSeries({ date: "2026-08-19", teamA: "FearX", teamB: "Hanwha Life Esports" }),
    "HLE–FearX Aug 19 is leftover",
  );
  const { completed } = rowsInWeek(
    [
      ...QA_WAREHOUSE,
      row("2026-08-19", "FearX", "Hanwha Life Esports", 2, 0),
      row("2026-08-20", "DRX", "HANJIN BRION", 2, 1),
    ],
    WEEK_NOW,
    "LCK",
  );
  assert(
    !completed.some((s) => isKnownLeftoverWeekSeries(s)),
    "week completed has no leftover pairs",
  );
  const weekText = formatWeeklyWarehouseAnswer(
    formatWeeklyWarehouseBlock(completed, [], "LCK"),
  );
  assert(
    !weekText.split("\n").some((l) => /fearx/i.test(l) && /hanwha|\bhle\b/i.test(l)),
    "week text has no HLE–FearX",
  );
});

Deno.test("DK last series is warehouse HLE 2-0 Aug 20, not leftover OE vs KT", () => {
  const ask = "what was Dplus Kia last series score?";
  assert(isTeamLastSeriesQuestion(ask), "last series ask");
  assert(!isTeamLastSeriesQuestion("any notable LPL results the last few days?"), "not a week ask");
  const last = lastCompletedSeriesForTeam(QA_WAREHOUSE, "Dplus Kia", "LCK");
  assert(last, "DK has a completed warehouse series");
  assertEquals(last!.date, "2026-08-20", "Aug 20 vs HLE, not an older KT series");
  assertEquals(last!.score, "2-0", "HLE 2-0");
  assert(/Hanwha/i.test(last!.winner), "HLE won");
  const locked = tryDeterministicAnswer(ask, [{
    tool: "warehouse_series_recap",
    data: {
      teamA: "Dplus Kia",
      teamB: "Hanwha Life Esports",
      seriesScore: "0-2",
      winner: "Hanwha Life Esports",
      date: "2026-08-20",
    },
  }]);
  assert(locked && /0-2/.test(locked) && /2026-08-20/.test(locked), "locks warehouse last series");
  assert(!/KT/i.test(locked!), "does not invent KT");
});

Deno.test("lose-to dated ask locks warehouse series, not a Painter invention", () => {
  const ask = "why did T1 lose to HLE on August 8?";
  assert(isDatedMatchupRecap(ask), "dated lose-to is a recap");
  const recap = runWarehouseSeriesRecap(ask, QA_WAREHOUSE, [], WEEK_NOW);
  assert(recap?.tool === "warehouse_series_recap", "lose-to fires warehouse recap");
  assertEquals(String(recap!.data.date), "2026-08-08", "picks Aug 8");
  assert(/1-2|2-1/.test(String(recap!.data.seriesScore)), "has the 2-1 score");
  const locked = tryDeterministicAnswer(ask, [{
    tool: "warehouse_series_recap",
    data: {
      teamA: "T1",
      teamB: "Hanwha Life Esports",
      seriesScore: "1-2",
      winner: "Hanwha Life Esports",
      date: "2026-08-08",
    },
  }]);
  assert(locked && /1-2/.test(locked) && /Hanwha/i.test(locked), "locks HLE 2-1");
  assert(!/Painter/i.test(locked!), "no invented sub");
});

Deno.test("Knight gold-diff ask locks numeric GD@15 from player_stat", () => {
  const ask = "what's Knight's gold diff at 15 this LPL split?";
  assert(isSimplePlayerStatAsk(ask), "gold diff at 15 is a simple stat ask");
  const locked = tryDeterministicAnswer(ask, [{
    tool: "player_stat",
    data: {
      player: { name: "Knight", team: "Bilibili Gaming", league: "LPL", games: 63, gd15: 527.4 },
    },
  }]);
  assert(locked && /527\.4/.test(locked) && /63/.test(locked), "locks Knight +527.4 / 63");
  assert(!/doesn't break down/i.test(locked!), "does not fail-close a present number");
  assertEquals(
    formatPlayerStatAnswer({
      player: { name: "Knight", league: "LPL", games: 63, gd15: 527.4 },
    }, ask).includes("527.4"),
    true,
    "formatter prints GD@15",
  );
});

Deno.test("Ice identity clarify does not invent a no-such-player close", () => {
  const empty = formatEntityClarifyAnswer({
    clarifications: [{ query: "Ice", candidates: [], missingInSlice: true }],
  });
  assert(/which ice/i.test(empty), "asks which Ice");
  assert(!/no verified players named/i.test(empty), "not a hard no");
  const ident = formatPlayerIdentityAnswer({
    players: [{ name: "Ice", team: "Team Heretics", league: "LEC", position: "adc", games: 20 }],
  });
  assert(/Team Heretics/i.test(ident) && /LEC/i.test(ident), "identity names Heretics Ice");
  const locked = tryDeterministicAnswer("who is Ice?", [{
    tool: "entity_clarify",
    data: { clarifications: [{ query: "Ice", candidates: [] }] },
  }]);
  assert(locked && /which ice/i.test(locked), "locks clarify");
});

Deno.test("empty LPL week locks an honest miss, not an MSI pivot", () => {
  const ask = "any notable LPL results the last few days?";
  const locked = tryDeterministicAnswer(ask, [{
    tool: "weekly_warehouse_recap",
    data: { league: "LPL", completed: [], upcoming: [] },
  }]);
  assert(locked && /No warehouse LPL/i.test(locked), "honest empty LPL window");
  assert(!/MSI/i.test(locked!), "does not pivot to MSI");
});
