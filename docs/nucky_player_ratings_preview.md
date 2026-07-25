# Player power ratings preview (v0.6)

> `scripts/ml/build_player_ratings.py` — **current** active tier-1 players only.
> Current team = most recent game. Active = majority of current team's last
> 8 games (by count, not a day window) + not in roster_overrides.json.
> Role-specific stat weights mirror src/lib/playerRadar.ts's role-based radar
> philosophy (laning/efficiency-heavy for top/mid, kill-participation-heavy for
> jungle/support). Includes matchup-pair laning baselines, a gd_trajectory
> (golddiffat25-golddiffat15) phase-transition stat, playmaking/roam-context
> dampening for jungle/mid/support, an asymmetric opponent-quality adjustment,
> a standout-performance bonus in both wins and losses, and a support-only
> bot-lane duo-partner credit. A team-dependency ('impact') signal was tested
> for 'eye-test greats whose stats undersell them' but rejected — see
> `docs/nucky_v2.md` Component 3 v0.6 for why. See that doc for full methodology.

## Top

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Kiin | Gen.G | LCK | 253 (46.0) | +0.357 | +0.115 | +0.471 |
| 2 | Zeus | Hanwha Life Esports | LCK | 250 (63.0) | +0.218 | +0.115 | +0.332 |
| 3 | Naak Nako | Team Vitality | LEC | 108 (18.9) | +0.290 | -0.066 | +0.224 |
| 4 | Bin | Bilibili Gaming | LPL | 311 (67.7) | +0.206 | +0.009 | +0.215 |
| 5 | Siwoo | Dplus Kia | LCK | 242 (57.4) | +0.044 | +0.115 | +0.159 |
| 6 | PerfecT | KT Rolster | LCK | 181 (30.8) | +0.038 | +0.115 | +0.152 |
| 7 | Thanatos | Cloud9 | LCS | 118 (20.8) | +0.195 | -0.058 | +0.138 |
| 8 | Zika | Weibo Gaming | LPL | 134 (24.7) | +0.087 | +0.009 | +0.096 |
| 9 | HOYA | Ninjas in Pyjamas | LPL | 165 (21.9) | +0.083 | +0.009 | +0.092 |
| 10 | Doran | T1 | LCK | 280 (71.7) | -0.024 | +0.115 | +0.091 |
| 11 | Rooster | Shifters | LEC | 52 (13.6) | +0.149 | -0.066 | +0.083 |
| 12 | Gakgos | FlyQuest | LCS | 65 (24.6) | +0.129 | -0.058 | +0.071 |
| 13 | Xiaoxu | JD Gaming | LPL | 208 (44.5) | +0.047 | +0.009 | +0.056 |
| 14 | Morgan | Team Liquid | LCS | 176 (40.6) | +0.106 | -0.058 | +0.048 |
| 15 | sheer | LNG Esports | LPL | 154 (12.1) | +0.026 | +0.009 | +0.035 |

## Jungle

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Kanavi | Hanwha Life Esports | LCK | 281 (63.2) | +0.263 | +0.115 | +0.377 |
| 2 | Canyon | Gen.G | LCK | 253 (46.0) | +0.202 | +0.115 | +0.316 |
| 3 | Xun | Bilibili Gaming | LPL | 276 (67.1) | +0.238 | +0.009 | +0.247 |
| 4 | Lucid | Dplus Kia | LCK | 239 (55.4) | +0.124 | +0.115 | +0.239 |
| 5 | Oner | T1 | LCK | 280 (71.7) | +0.059 | +0.115 | +0.173 |
| 6 | Tarzan | Anyone's Legend | LPL | 272 (33.8) | +0.096 | +0.009 | +0.105 |
| 7 | Croco | LNG Esports | LPL | 103 (12.1) | +0.076 | +0.009 | +0.086 |
| 8 | Raptor | FearX | LCK | 195 (30.5) | -0.084 | +0.115 | +0.031 |
| 9 | Cuzz | KT Rolster | LCK | 200 (30.8) | -0.089 | +0.115 | +0.025 |
| 10 | Josedeodo | Team Liquid | LCS | 78 (40.1) | +0.056 | -0.058 | -0.002 |
| 11 | Razork | Fnatic | LEC | 130 (14.5) | +0.051 | -0.066 | -0.015 |
| 12 | Sponge | Nongshim RedForce | LCK | 168 (27.5) | -0.129 | +0.115 | -0.015 |
| 13 | SkewMond | G2 Esports | LEC | 213 (52.2) | +0.045 | -0.066 | -0.021 |
| 14 | Willer | DRX | LCK | 80 (26.9) | -0.148 | +0.115 | -0.033 |
| 15 | JunJia | JD Gaming | LPL | 156 (43.9) | -0.061 | +0.009 | -0.051 |

## Mid

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Chovy | Gen.G | LCK | 253 (46.0) | +0.396 | +0.115 | +0.511 |
| 2 | Zeka | Hanwha Life Esports | LCK | 250 (63.0) | +0.278 | +0.115 | +0.393 |
| 3 | Knight | Bilibili Gaming | LPL | 311 (67.7) | +0.347 | +0.009 | +0.356 |
| 4 | ShowMaker | Dplus Kia | LCK | 242 (57.4) | +0.161 | +0.115 | +0.276 |
| 5 | Bdd | KT Rolster | LCK | 200 (30.8) | +0.109 | +0.115 | +0.223 |
| 6 | Caps | G2 Esports | LEC | 213 (52.2) | +0.258 | -0.066 | +0.191 |
| 7 | Creme | Top Esports | LPL | 278 (40.0) | +0.177 | +0.009 | +0.186 |
| 8 | Quid | Team Liquid | LCS | 149 (40.7) | +0.243 | -0.058 | +0.185 |
| 9 | HongQ | JD Gaming | LPL | 156 (43.9) | +0.157 | +0.009 | +0.166 |
| 10 | Heru | ThunderTalk Gaming | LPL | 42 (16.3) | +0.114 | +0.009 | +0.123 |
| 11 | BuLLDoG | LNG Esports | LPL | 115 (12.0) | +0.081 | +0.009 | +0.090 |
| 12 | DARKWINGS | Sentinels | LCS | 84 (22.6) | +0.140 | -0.058 | +0.083 |
| 13 | Saint | Lyon Gaming | LCS | 124 (49.2) | +0.133 | -0.058 | +0.075 |
| 14 | Shanks | Anyone's Legend | LPL | 273 (34.8) | +0.061 | +0.009 | +0.070 |
| 15 | Scout | Nongshim RedForce | LCK | 216 (27.9) | -0.044 | +0.115 | +0.070 |

## Adc

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Peyz | T1 | LCK | 256 (70.6) | +0.238 | +0.115 | +0.353 |
| 2 | Gumayusi | Hanwha Life Esports | LCK | 243 (63.3) | +0.103 | +0.115 | +0.217 |
| 3 | Smash | Dplus Kia | LCK | 135 (56.4) | +0.070 | +0.115 | +0.185 |
| 4 | 1xn | LNG Esports | LPL | 137 (11.9) | +0.140 | +0.009 | +0.149 |
| 5 | Taeyoon | FearX | LCK | 195 (23.1) | +0.005 | +0.115 | +0.120 |
| 6 | Viper | Bilibili Gaming | LPL | 283 (67.1) | +0.101 | +0.009 | +0.111 |
| 7 | Ruler | Gen.G | LCK | 253 (46.0) | -0.028 | +0.115 | +0.087 |
| 8 | Berserker | Lyon Gaming | LCS | 179 (49.4) | +0.083 | -0.058 | +0.025 |
| 9 | Zven | Cloud9 | LCS | 118 (20.8) | +0.079 | -0.058 | +0.021 |
| 10 | Elk | Weibo Gaming | LPL | 264 (25.5) | -0.001 | +0.009 | +0.008 |
| 11 | Aiming | KT Rolster | LCK | 198 (28.4) | -0.120 | +0.115 | -0.005 |
| 12 | JackeyLove | Top Esports | LPL | 235 (33.8) | -0.040 | +0.009 | -0.031 |
| 13 | Leave | EDward Gaming | LPL | 155 (16.5) | -0.041 | +0.009 | -0.032 |
| 14 | Ahn | ThunderTalk Gaming | LPL | 84 (14.6) | -0.048 | +0.009 | -0.039 |
| 15 | Assum | Ninjas in Pyjamas | LPL | 145 (21.7) | -0.053 | +0.009 | -0.044 |

## Support

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Career | Dplus Kia | LCK | 111 (56.4) | +0.367 | +0.115 | +0.482 |
| 2 | Delight | Hanwha Life Esports | LCK | 247 (61.2) | +0.360 | +0.115 | +0.474 |
| 3 | Duro | Gen.G | LCK | 253 (46.0) | +0.335 | +0.115 | +0.450 |
| 4 | Keria | T1 | LCK | 280 (71.7) | +0.211 | +0.115 | +0.326 |
| 5 | ON | Bilibili Gaming | LPL | 311 (67.7) | +0.308 | +0.009 | +0.317 |
| 6 | Effort | KT Rolster | LCK | 53 (27.4) | +0.089 | +0.115 | +0.204 |
| 7 | Zhuo | Ninjas in Pyjamas | LPL | 152 (22.2) | +0.178 | +0.009 | +0.187 |
| 8 | Vampire | JD Gaming | LPL | 242 (44.1) | +0.174 | +0.009 | +0.183 |
| 9 | Kael | Anyone's Legend | LPL | 272 (33.8) | +0.155 | +0.009 | +0.164 |
| 10 | Ackerman | LØS | LCS | 22 (17.6) | +0.205 | -0.058 | +0.147 |
| 11 | Fleshy | Team Vitality | LEC | 73 (18.9) | +0.190 | -0.066 | +0.124 |
| 12 | Isles | Lyon Gaming | LCS | 130 (49.2) | +0.147 | -0.058 | +0.090 |
| 13 | MISSING | LNG Esports | LPL | 122 (11.8) | +0.077 | +0.009 | +0.086 |
| 14 | Cryogen | FlyQuest | LCS | 60 (24.5) | +0.132 | -0.058 | +0.074 |
| 15 | CoreJJ | Team Liquid | LCS | 141 (40.4) | +0.118 | -0.058 | +0.060 |
