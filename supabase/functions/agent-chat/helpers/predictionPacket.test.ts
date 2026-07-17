import { teamStrengthRating } from "./mlArtifacts.ts";
import { buildPredictionPacket } from "./predictionPacket.ts";
import type { DraftExtraction } from "./draftTypes.ts";
import type { KalshiMarketQuote } from "./kalshi.ts";
import regionStrength from "../ml/region_strength.json" with { type: "json" };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function draft(teamA: string, picksA: string[], teamB: string, picksB: string[]): DraftExtraction {
  const side = (team: string, picks: string[], position: "left" | "right") => ({
    team,
    side: position,
    champions: picks.map((name, slot) => ({
      name,
      ddragonKey: name,
      confidence: 1,
      slot: slot + 1,
    })),
  });
  return {
    method: "text_input",
    confidence: 1,
    teams: [side(teamA, picksA, "left"), side(teamB, picksB, "right")],
    extractedAt: new Date(0).toISOString(),
  };
}

Deno.test("team strength uses nucky's internal Elo before external GPR", () => {
  const internal = (regionStrength as { teams?: Record<string, { rating: number }> }).teams?.["T1"]?.rating;
  assert(internal != null, "fixture must contain T1 internal Elo");
  assertEquals(teamStrengthRating("T1"), internal, "teamStrengthRating should use internal Elo");
});

Deno.test("prematch packet includes current role-based player power context", async () => {
  const { packet, block } = await buildPredictionPacket({ message: "T1 vs Gen.G — who wins?" });
  assert(packet != null, "expected a prediction packet");
  assert(packet.playerPower?.teamA?.length, "expected T1 player power entries");
  assert(packet.playerPower?.teamB?.length, "expected Gen.G player power entries");
  assertEquals(
    packet.playerPower?.teamA?.map((entry) => entry.role).join(","),
    "top,jungle,mid,adc,support",
    "player power should follow standard role order",
  );
  assert(block.includes("player_power:"), "formatted block should expose player power");
  assert(block.includes("Faker"), "T1 player power should include Faker");
  assert(block.includes("Chovy"), "Gen.G player power should include Chovy");
});

Deno.test("draft packet includes empirical same-role matchup evidence", async () => {
  const { packet, block } = await buildPredictionPacket({
    message: "analyze this draft",
    draft: draft("Blue comp", ["K'Sante"], "Red comp", ["Gnar"]),
  });
  assert(packet != null, "expected a draft packet");
  assert(packet.directMatchups?.length, "expected a direct matchup entry");
  assertEquals(packet.directMatchups?.[0]?.role, "top", "expected top-lane matchup");
  assert(block.includes("direct_matchups:"), "formatted block should expose direct matchups");
  assert(block.includes("K'Sante vs Gnar"), "expected the known K'Sante/Gnar matchup");
});

Deno.test("draft slots override a champion's usual role for direct matchup lookup", async () => {
  const unusual = draft("Blue comp", ["K'Sante"], "Red comp", ["Gnar"]);
  unusual.teams[0].champions[0]!.slot = 3;
  unusual.teams[1].champions[0]!.slot = 3;
  const { packet } = await buildPredictionPacket({ message: "analyze this draft", draft: unusual });
  assert(packet != null, "expected a draft packet");
  assertEquals(packet.directMatchups?.length ?? 0, 0, "top matchup data must not be used for mid slots");
});

Deno.test("Kalshi is comparison context and never changes nucky's probability", async () => {
  const opts = { message: "T1 vs Gen.G — who wins?" };
  const own = await buildPredictionPacket(opts);
  assert(own.packet != null, "expected own-model packet");

  const market: KalshiMarketQuote = {
    ticker: "KXLOL-T1-GENG",
    title: "T1 vs Gen.G",
    subtitle: "Will T1 win?",
    yesPercent: 5,
    eventTicker: "KXLOL",
    url: "https://kalshi.com/markets/KXLOL-T1-GENG",
    priceSource: "market",
  };
  const compared = await buildPredictionPacket({ ...opts, kalshiMarkets: [market] });
  assert(compared.packet != null, "expected packet with market comparison");
  assertEquals(
    compared.packet.winProbA,
    own.packet.winProbA,
    "external market must not alter nucky's probability",
  );
  assert(compared.packet.kalshiEdge != null, "market comparison should still be exposed");
  assert(
    !compared.packet.drivers.some((driver) => driver.includes("market blend")),
    "market blend must not appear as a model driver",
  );
});
