import re, json

with open('src/data/mockData.ts', 'r', encoding='utf-8') as f:
    content = f.read()

def parse_ts_array(content, array_name):
    lines = content.split('\n')
    items = []
    in_array = False
    for line in lines:
        stripped = line.strip()
        if f'export const {array_name}:' in stripped:
            in_array = True
            continue
        if in_array and stripped.startswith('{'):
            obj_str = stripped.rstrip(',')
            obj_str = re.sub(r'(\w+):', r'"\1":', obj_str)
            obj_str = obj_str.replace("'", '"')
            try:
                obj = json.loads(obj_str)
                items.append(obj)
            except:
                pass
        elif in_array and stripped == '];':
            break
    return items

players = parse_ts_array(content, 'players')
teams = parse_ts_array(content, 'teams')
champions = parse_ts_array(content, 'champions')

data = {
    "meta": {
        "source": "Oracle's Elixir",
        "generated_at": "2026-05-27T03:00:00Z",
        "leagues": ["LCK", "LPL", "LEC", "LCS"],
        "splits": ["2025-2026"],
        "schema_version": "1.0"
    },
    "players": players,
    "teams": teams,
    "champions": champions,
}

with open('public/dashboard_data.json', 'w') as f:
    json.dump(data, f, separators=(',', ':'))

print(f"Generated public/dashboard_data.json ({len(json.dumps(data, separators=(',',':')))/1024:.1f} KB)")
print(f"  Players: {len(players)}, Teams: {len(teams)}, Champions: {len(champions)}")
