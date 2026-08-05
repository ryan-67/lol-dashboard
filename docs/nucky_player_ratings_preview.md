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
| 1 | TheShy | Invictus Gaming | LPL | 149 (7.1) | +0.575 | +0.006 | +0.581 |
| 2 | Kiin | Gen.G | LCK | 256 (41.3) | +0.353 | +0.116 | +0.469 |
| 3 | Zeus | Hanwha Life Esports | LCK | 254 (56.7) | +0.222 | +0.116 | +0.338 |
| 4 | HOYA | Ninjas in Pyjamas | LPL | 169 (22.7) | +0.177 | +0.006 | +0.184 |
| 5 | PerfecT | KT Rolster | LCK | 186 (31.5) | +0.057 | +0.116 | +0.173 |
| 6 | Keshi | THUNDER TALK GAMING | LPL | 57 (28.5) | +0.147 | +0.006 | +0.153 |
| 7 | Siwoo | Dplus Kia | LCK | 245 (50.5) | +0.027 | +0.116 | +0.143 |
| 8 | Doran | T1 | LCK | 286 (65.5) | +0.010 | +0.116 | +0.127 |
| 9 | Thanatos | Cloud9 Kia | LCS | 125 (20.7) | +0.148 | -0.056 | +0.092 |
| 10 | Breathe | Anyone's Legend | LPL | 191 (27.9) | +0.078 | +0.006 | +0.084 |
| 11 | Xiaoxu | JD Gaming | LPL | 220 (51.2) | +0.069 | +0.006 | +0.076 |
| 12 | Naak Nako | Team Vitality | LEC | 117 (26.3) | +0.110 | -0.067 | +0.043 |
| 13 | ZUIAN | Top Esports | LPL | 64 (41.0) | +0.023 | +0.006 | +0.029 |
| 14 | Morgan | Team Liquid Alienware | LCS | 182 (31.4) | +0.071 | -0.056 | +0.015 |
| 15 | Clear | FearX | LCK | 190 (31.2) | -0.105 | +0.116 | +0.012 |

## Jungle

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Lucid | Dplus Kia | LCK | 242 (48.9) | +0.207 | +0.116 | +0.323 |
| 2 | Kanavi | Hanwha Life Esports | LCK | 285 (56.8) | +0.174 | +0.116 | +0.290 |
| 3 | Tarzan | Anyone's Legend | LPL | 287 (45.7) | +0.269 | +0.006 | +0.275 |
| 4 | Xun | Bilibili Gaming | LPL | 291 (72.8) | +0.254 | +0.006 | +0.261 |
| 5 | Canyon | Gen.G | LCK | 256 (41.3) | +0.135 | +0.116 | +0.252 |
| 6 | Cuzz | KT Rolster | LCK | 205 (31.5) | +0.136 | +0.116 | +0.252 |
| 7 | Oner | T1 | LCK | 286 (65.5) | +0.058 | +0.116 | +0.174 |
| 8 | Croco | LNG Esports | LPL | 103 (9.8) | +0.101 | +0.006 | +0.107 |
| 9 | Josedeodo | Team Liquid Alienware | LCS | 84 (31.0) | +0.144 | -0.056 | +0.088 |
| 10 | Raptor | FearX | LCK | 200 (31.3) | -0.037 | +0.116 | +0.080 |
| 11 | Sponge | Nongshim RedForce | LCK | 173 (28.8) | -0.080 | +0.116 | +0.036 |
| 12 | Junhao | THUNDER TALK GAMING | LPL | 127 (28.8) | +0.003 | +0.006 | +0.009 |
| 13 | Monki | Team WE | LPL | 214 (42.1) | +0.003 | +0.006 | +0.009 |
| 14 | SkewMond | G2 Esports | LEC | 222 (53.5) | +0.047 | -0.067 | -0.020 |
| 15 | Wei | Invictus Gaming | LPL | 192 (25.6) | -0.051 | +0.006 | -0.045 |

## Mid

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Knight | Bilibili Gaming | LPL | 326 (73.3) | +0.494 | +0.006 | +0.500 |
| 2 | Chovy | Gen.G | LCK | 256 (41.3) | +0.373 | +0.116 | +0.489 |
| 3 | Zeka | Hanwha Life Esports | LCK | 254 (56.7) | +0.295 | +0.116 | +0.411 |
| 4 | ShowMaker | Dplus Kia | LCK | 245 (50.5) | +0.225 | +0.116 | +0.342 |
| 5 | Creme | Top Esports | LPL | 290 (47.4) | +0.313 | +0.006 | +0.320 |
| 6 | HongQ | JD Gaming | LPL | 168 (50.8) | +0.269 | +0.006 | +0.275 |
| 7 | Quid | Team Liquid Alienware | LCS | 155 (31.5) | +0.312 | -0.056 | +0.256 |
| 8 | Rookie | Invictus Gaming | LPL | 192 (12.1) | +0.230 | +0.006 | +0.236 |
| 9 | Bdd | KT Rolster | LCK | 205 (31.5) | +0.102 | +0.116 | +0.219 |
| 10 | Scout | Nongshim RedForce | LCK | 221 (29.1) | +0.080 | +0.116 | +0.197 |
| 11 | Caps | G2 Esports | LEC | 222 (53.5) | +0.242 | -0.067 | +0.175 |
| 12 | Shanks | Anyone's Legend | LPL | 287 (45.7) | +0.155 | +0.006 | +0.162 |
| 13 | Saint | Lyon Gaming | LCS | 128 (45.0) | +0.163 | -0.056 | +0.107 |
| 14 | Faker | T1 | LCK | 286 (65.5) | -0.055 | +0.116 | +0.061 |
| 15 | Quad | FlyQuest | LCS | 155 (25.6) | +0.091 | -0.056 | +0.035 |

## Adc

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Peyz | T1 | LCK | 262 (64.6) | +0.281 | +0.116 | +0.398 |
| 2 | Smash | Dplus Kia | LCK | 138 (49.7) | +0.131 | +0.116 | +0.248 |
| 3 | Gumayusi | Hanwha Life Esports | LCK | 247 (56.9) | +0.105 | +0.116 | +0.221 |
| 4 | Viper | Bilibili Gaming | LPL | 298 (72.8) | +0.206 | +0.006 | +0.212 |
| 5 | Taeyoon | FearX | LCK | 200 (25.3) | +0.071 | +0.116 | +0.188 |
| 6 | Berserker | Lyon Gaming | LCS | 183 (45.2) | +0.153 | -0.056 | +0.097 |
| 7 | Yeon | Team Liquid Alienware | LCS | 147 (31.2) | +0.147 | -0.056 | +0.091 |
| 8 | JackeyLove | Top Esports | LPL | 247 (42.4) | +0.081 | +0.006 | +0.087 |
| 9 | Hope | Anyone's Legend | LPL | 287 (45.7) | +0.056 | +0.006 | +0.063 |
| 10 | FenRir | KT Rolster | LCK | 8 (7.9) | -0.055 | +0.116 | +0.062 |
| 11 | Zven | Cloud9 | LCS | 118 (16.9) | +0.091 | -0.056 | +0.035 |
| 12 | 1xn | LNG Esports | LPL | 141 (14.8) | +0.010 | +0.006 | +0.017 |
| 13 | Diable | Nongshim RedForce | LCK | 201 (29.0) | -0.111 | +0.116 | +0.005 |
| 14 | Ruler | Gen.G | LCK | 256 (41.3) | -0.112 | +0.116 | +0.004 |
| 15 | Elk | Weibo Gaming | LPL | 269 (26.9) | -0.031 | +0.006 | -0.024 |

## Support

| # | Player | Team | Region | Games (eff) | Box-score z | Region shift | Power score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Career | Dplus Kia | LCK | 114 (49.7) | +0.412 | +0.116 | +0.528 |
| 2 | Delight | Hanwha Life Esports | LCK | 251 (55.2) | +0.340 | +0.116 | +0.457 |
| 3 | ON | Bilibili Gaming | LPL | 326 (73.3) | +0.379 | +0.006 | +0.386 |
| 4 | Keria | T1 | LCK | 286 (65.5) | +0.233 | +0.116 | +0.350 |
| 5 | Effort | KT Rolster | LCK | 58 (28.8) | +0.227 | +0.116 | +0.344 |
| 6 | Duro | Gen.G | LCK | 256 (41.3) | +0.214 | +0.116 | +0.331 |
| 7 | Kael | Anyone's Legend | LPL | 287 (45.7) | +0.299 | +0.006 | +0.305 |
| 8 | CoreJJ | Team Liquid Alienware | LCS | 147 (31.2) | +0.249 | -0.056 | +0.193 |
| 9 | Isles | Lyon Gaming | LCS | 134 (45.0) | +0.199 | -0.056 | +0.143 |
| 10 | Zhuo | Top Esports | LPL | 164 (28.5) | +0.131 | +0.006 | +0.137 |
| 11 | Vampire | JD Gaming | LPL | 254 (50.9) | +0.127 | +0.006 | +0.134 |
| 12 | Erha | Team WE | LPL | 158 (43.4) | +0.111 | +0.006 | +0.117 |
| 13 | Cryogen | FlyQuest | LCS | 64 (24.9) | +0.158 | -0.056 | +0.102 |
| 14 | Fleshy | Team Vitality | LEC | 82 (26.3) | +0.156 | -0.067 | +0.090 |
| 15 | MISSING | LNG Esports | LPL | 124 (12.2) | +0.057 | +0.006 | +0.063 |
