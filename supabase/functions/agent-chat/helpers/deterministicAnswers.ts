interface ToolResultLike {
  tool: string;
  data: Record<string, unknown>;
}

export function formatTeamStatAnswer(data: Record<string, unknown>): string {
  const team = String(data.team ?? "that team");
  const split = String(data.split ?? "this split");
  const games = Number(data.games ?? 0);
  if (games <= 0) {
    return `no ${team} games indexed for ${split} yet.`;
  }
  const wins = Number(data.wins ?? 0);
  const losses = Number(data.losses ?? 0);
  const wr = Number(data.winrate ?? 0);
  return `${team} at ${wr}% wr (${wins}-${losses}, ${games} games) in ${split}.`;
}

export function tryDeterministicAnswer(
  message: string,
  tools: ToolResultLike[],
): string | null {
  const lower = message.toLowerCase();

  if (isSimpleTeamStatAsk(lower)) {
    const stat = tools.find((t) => t.tool === "team_stat");
    if (stat) return formatTeamStatAnswer(stat.data);
  }

  return null;
}

function isSimpleTeamStatAsk(lower: string): boolean {
  return (
    /\b(win\s*rate|winrate|record)\b/i.test(lower) &&
    !/\b(chart|graph|line|plot|compare|vs\.?|versus)\b/i.test(lower)
  );
}
