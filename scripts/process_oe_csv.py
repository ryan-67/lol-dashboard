#!/usr/bin/env python3
"""
Oracle's Elixir CSV → Dashboard JSON processor.

Usage:
    python scripts/process_oe_csv.py path/to/2025_LoL_esports_match_data.csv

Output:
    public/dashboard_data.json

This script aggregates OE match-level data into the compact dashboard format:
- players: aggregated stats by player (kda, kp, dmgShare, gd15, etc.)
- teams: aggregated stats by team (wins, losses, winrate, objectives)
- champions: pick/ban rates, presence, winrate by champion
"""

import sys
import json
import csv
from collections import defaultdict
from datetime import datetime, timezone

# Leagues we care about
TARGET_LEAGUES = {"LCK", "LPL", "LEC", "LCS"}

def safe_float(val, default=0.0):
    try:
        return float(val) if val else default
    except ValueError:
        return default

def safe_int(val, default=0):
    try:
        return int(float(val)) if val else default
    except ValueError:
        return default

def process_csv(csv_path):
    players = defaultdict(lambda: {
        "games": 0, "kills": 0, "deaths": 0, "assists": 0,
        "kp": [], "dmgShare": [], "gd15": [], "csd15": [], "xpd15": [],
        "team": "", "league": "", "position": ""
    })
    teams = defaultdict(lambda: {
        "games": 0, "wins": 0, "losses": 0,
        "kills": 0, "deaths": 0, "assists": 0,
        "towers": 0, "dragons": 0, "barons": 0, "heralds": 0,
        "gd15": [], "league": ""
    })
    champions = defaultdict(lambda: {
        "picks": 0, "bans": 0, "wins": 0,
        "games": 0, "kills": 0, "deaths": 0, "assists": 0,
        "positions": set()
    })

    total_rows = 0
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_rows += 1
            league = row.get('league', '')
            if league not in TARGET_LEAGUES:
                continue

            position = row.get('position', '')
            team_name = row.get('teamname', '')
            player_name = row.get('name', '')
            champion = row.get('champion', '')
            result = row.get('result', '')
            side = row.get('side', '')  # blue/red
            gamelength = safe_float(row.get('gamelength', 0))

            # Team stats (side-level rows have position == 'team')
            if position == 'team':
                teams[team_name]['games'] += 1
                teams[team_name]['league'] = league
                if result == '1':
                    teams[team_name]['wins'] += 1
                else:
                    teams[team_name]['losses'] += 1
                teams[team_name]['towers'] += safe_int(row.get('towers', 0))
                teams[team_name]['dragons'] += safe_int(row.get('dragons', 0))
                teams[team_name]['barons'] += safe_int(row.get('barons', 0))
                teams[team_name]['heralds'] += safe_int(row.get('heralds', 0))
                teams[team_name]['kills'] += safe_int(row.get('kills', 0))
                teams[team_name]['deaths'] += safe_int(row.get('deaths', 0))
                teams[team_name]['assists'] += safe_int(row.get('assists', 0))
                teams[team_name]['gd15'].append(safe_float(row.get('golddiffat15', 0)))
                continue

            # Player stats
            if player_name:
                p = players[player_name]
                p['games'] += 1
                p['team'] = team_name
                p['league'] = league
                p['position'] = position
                p['kills'] += safe_int(row.get('kills', 0))
                p['deaths'] += safe_int(row.get('deaths', 0))
                p['assists'] += safe_int(row.get('assists', 0))
                p['kp'].append(safe_float(row.get('killparticipation', 0)) * 100)
                p['dmgShare'].append(safe_float(row.get('damageshare', 0)) * 100)
                p['gd15'].append(safe_float(row.get('golddiffat15', 0)))
                p['csd15'].append(safe_float(row.get('csdiffat15', 0)))
                p['xpd15'].append(safe_float(row.get('xpdiffat15', 0)))

            # Champion stats (pick)
            if champion:
                c = champions[champion]
                c['picks'] += 1
                c['games'] += 1
                c['positions'].add(position)
                c['kills'] += safe_int(row.get('kills', 0))
                c['deaths'] += safe_int(row.get('deaths', 0))
                c['assists'] += safe_int(row.get('assists', 0))
                if result == '1':
                    c['wins'] += 1

            # Champion bans (stored in ban1-5 columns on team rows)
            # We'll handle bans in a second pass or by checking team row ban columns

    # Second pass for bans (simpler: just scan for ban columns)
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            league = row.get('league', '')
            if league not in TARGET_LEAGUES:
                continue
            position = row.get('position', '')
            if position == 'team':
                for i in range(1, 6):
                    ban = row.get(f'ban{i}', '')
                    if ban:
                        champions[ban]['bans'] += 1

    # Compile player output
    player_list = []
    for name, p in players.items():
        games = p['games']
        if games < 5:
            continue
        deaths = max(p['deaths'], 1)
        player_list.append({
            "name": name,
            "team": p['team'],
            "league": p['league'],
            "position": p['position'],
            "games": games,
            "kda": round((p['kills'] + p['assists']) / deaths, 2),
            "kp": round(sum(p['kp']) / len(p['kp']), 1) if p['kp'] else 0,
            "dmgShare": round(sum(p['dmgShare']) / len(p['dmgShare']), 1) if p['dmgShare'] else 0,
            "gd15": round(sum(p['gd15']) / len(p['gd15']), 1) if p['gd15'] else 0,
            "csd15": round(sum(p['csd15']) / len(p['csd15']), 1) if p['csd15'] else 0,
            "xpd15": round(sum(p['xpd15']) / len(p['xpd15']), 1) if p['xpd15'] else 0,
        })

    # Compile team output
    team_list = []
    for name, t in teams.items():
        games = t['games']
        if games < 3:
            continue
        deaths = max(t['deaths'], 1)
        team_list.append({
            "name": name,
            "league": t['league'],
            "games": games,
            "wins": t['wins'],
            "losses": t['losses'],
            "winrate": round(t['wins'] / games * 100, 1),
            "avgKda": round((t['kills'] + t['assists']) / deaths, 2),
            "avgGd15": round(sum(t['gd15']) / len(t['gd15']), 1) if t['gd15'] else 0,
            "towers": t['towers'],
            "dragons": t['dragons'],
            "barons": t['barons'],
            "heralds": t['heralds'],
        })

    # Compile champion output
    champ_list = []
    for name, c in champions.items():
        picks = c['picks']
        if picks < 3:
            continue
        total_games = picks + c['bans']
        deaths = max(c['deaths'], 1)
        champ_list.append({
            "name": name,
            "positions": sorted(list(c['positions'])),
            "picks": picks,
            "bans": c['bans'],
            "presence": round(total_games / max(total_rows / 12, 1) * 100, 1),  # rough estimate
            "winrate": round(c['wins'] / picks * 100, 1) if picks else 0,
            "avgKda": round((c['kills'] + c['assists']) / deaths, 2),
        })

    # Sort by relevance
    player_list.sort(key=lambda x: x['kda'], reverse=True)
    team_list.sort(key=lambda x: x['winrate'], reverse=True)
    champ_list.sort(key=lambda x: x['presence'], reverse=True)

    return {
        "meta": {
            "source": "Oracle's Elixir",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "leagues": sorted(list(TARGET_LEAGUES)),
            "schema_version": "1.0"
        },
        "players": player_list,
        "teams": team_list,
        "champions": champ_list,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/process_oe_csv.py <path/to/oe.csv>")
        sys.exit(1)

    csv_path = sys.argv[1]
    print(f"Processing {csv_path}...")
    data = process_csv(csv_path)

    out_path = "public/dashboard_data.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    size_kb = len(json.dumps(data)) / 1024
    print(f"Wrote {out_path} ({size_kb:.1f} KB)")
    print(f"  Players: {len(data['players'])}")
    print(f"  Teams: {len(data['teams'])}")
    print(f"  Champions: {len(data['champions'])}")


if __name__ == "__main__":
    main()
