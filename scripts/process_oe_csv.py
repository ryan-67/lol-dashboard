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
- champions: pick/ban rates, presence, winrate by champion (all leagues)
- championsByLeague: same stats scoped per league
- teamChampions: pick counts and winrate per team/champion
- matchups: head-to-head records between teams
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

def champ_bucket():
    return {
        "picks": 0, "bans": 0, "wins": 0,
        "games": 0, "kills": 0, "deaths": 0, "assists": 0,
        "positions": set()
    }

def compile_champion_list(champions_dict, league_game_rows):
    champ_list = []
    denom = max(league_game_rows / 12, 1)
    for name, c in champions_dict.items():
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
            "presence": round(total_games / denom * 100, 1),
            "winrate": round(c['wins'] / picks * 100, 1) if picks else 0,
            "avgKda": round((c['kills'] + c['assists']) / deaths, 2),
        })
    champ_list.sort(key=lambda x: x['presence'], reverse=True)
    return champ_list

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
    champions = defaultdict(champ_bucket)
    champions_by_league = defaultdict(lambda: defaultdict(champ_bucket))
    team_champions = defaultdict(lambda: {"picks": 0, "wins": 0})
    games_by_league = defaultdict(int)

    # gameid -> list of {team, result, league}
    game_teams = defaultdict(list)

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
            player_name = row.get('playername') or row.get('name', '')
            champion = row.get('champion', '')
            result = row.get('result', '')
            game_id = row.get('gameid', '')

            if position == 'team':
                teams[team_name]['games'] += 1
                teams[team_name]['league'] = league
                games_by_league[league] += 1
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
                if game_id and team_name:
                    game_teams[game_id].append({
                        "team": team_name,
                        "result": result,
                        "league": league,
                    })
                continue

            if player_name:
                p = players[player_name]
                p['games'] += 1
                p['team'] = team_name
                p['league'] = league
                p['position'] = position
                p['kills'] += safe_int(row.get('kills', 0))
                p['deaths'] += safe_int(row.get('deaths', 0))
                p['assists'] += safe_int(row.get('assists', 0))
                team_kills = safe_float(row.get('teamkills', 0))
                if team_kills > 0:
                    kp_val = (safe_int(row.get('kills', 0)) + safe_int(row.get('assists', 0))) / team_kills * 100
                else:
                    kp_val = safe_float(row.get('killparticipation', 0)) * 100
                p['kp'].append(kp_val)
                p['dmgShare'].append(safe_float(row.get('damageshare', 0)) * 100)
                p['gd15'].append(safe_float(row.get('golddiffat15', 0)))
                p['csd15'].append(safe_float(row.get('csdiffat15', 0)))
                p['xpd15'].append(safe_float(row.get('xpdiffat15', 0)))

            if champion and team_name:
                for bucket in (champions[champion], champions_by_league[league][champion]):
                    bucket['picks'] += 1
                    bucket['games'] += 1
                    bucket['positions'].add(position)
                    bucket['kills'] += safe_int(row.get('kills', 0))
                    bucket['deaths'] += safe_int(row.get('deaths', 0))
                    bucket['assists'] += safe_int(row.get('assists', 0))
                    if result == '1':
                        bucket['wins'] += 1

                tc = team_champions[(team_name, champion)]
                tc['picks'] += 1
                if result == '1':
                    tc['wins'] += 1

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
                        champions_by_league[league][ban]['bans'] += 1

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

    champ_list = compile_champion_list(champions, total_rows)
    champs_by_league_out = {
        league: compile_champion_list(champions_by_league[league], games_by_league[league])
        for league in TARGET_LEAGUES
        if league in champions_by_league
    }

    team_champion_list = []
    for (team, champion), stats in team_champions.items():
        picks = stats['picks']
        if picks < 1:
            continue
        team_champion_list.append({
            "team": team,
            "champion": champion,
            "picks": picks,
            "winrate": round(stats['wins'] / picks * 100, 1) if picks else 0,
        })

    matchup_counts = defaultdict(lambda: {"games": 0, "winsA": 0, "winsB": 0})
    for sides in game_teams.values():
        if len(sides) != 2:
            continue
        a, b = sides[0], sides[1]
        if a['league'] != b['league']:
            continue
        key = tuple(sorted([a['team'], b['team']]))
        matchup_counts[key]['games'] += 1
        if a['team'] == key[0]:
            if a['result'] == '1':
                matchup_counts[key]['winsA'] += 1
            else:
                matchup_counts[key]['winsB'] += 1
        else:
            if b['result'] == '1':
                matchup_counts[key]['winsA'] += 1
            else:
                matchup_counts[key]['winsB'] += 1

    matchup_list = [
        {
            "teamA": key[0],
            "teamB": key[1],
            "games": v['games'],
            "winsA": v['winsA'],
            "winsB": v['winsB'],
        }
        for key, v in matchup_counts.items()
        if v['games'] > 0
    ]

    player_list.sort(key=lambda x: x['kda'], reverse=True)
    team_list.sort(key=lambda x: x['winrate'], reverse=True)

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
        "championsByLeague": champs_by_league_out,
        "teamChampions": team_champion_list,
        "matchups": matchup_list,
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
        json.dump(data, f, separators=(',', ':'))

    size_kb = len(json.dumps(data, separators=(',', ':'))) / 1024
    print(f"Wrote {out_path} ({size_kb:.1f} KB)")
    print(f"  Players: {len(data['players'])}")
    print(f"  Teams: {len(data['teams'])}")
    print(f"  Champions: {len(data['champions'])}")
    print(f"  Matchups: {len(data['matchups'])}")
    print(f"  Team-champion rows: {len(data['teamChampions'])}")


if __name__ == "__main__":
    main()
