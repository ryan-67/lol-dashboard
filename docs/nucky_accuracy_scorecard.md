# nucky accuracy scorecard

> Generated `2026-07-17T07:02:08.535837+00:00` · algo `xgboost` · 718 holdout rows (2026-02-09 → 2026-07-11)

## Aggregate (walk-forward)

| | log-loss | Brier | accuracy |
| --- | --- | --- | --- |
| **nucky model** | 0.5648 | 0.1907 | 0.715 |
| naive baseline | 0.7031 | 0.2440 | 0.621 |

Ship gate (beats baseline on log-loss): **PASS**

## By league

| League | n | Model LL | Baseline LL | Acc | Beats baseline |
| --- | --- | --- | --- | --- | --- |
| LPL | 216 | 0.6702 | 0.7431 | 0.621 | yes |
| LCK | 210 | 0.4931 | 0.6609 | 0.786 | yes |
| LEC | 134 | 0.5266 | 0.6959 | 0.726 | yes |
| LCS | 94 | 0.5296 | 0.6791 | 0.707 | yes |

## By confidence bucket

| Bucket | n | Model LL | Acc | Beats baseline |
| --- | --- | --- | --- | --- |
| strong_>=25pp | 368 | 0.4812 | 0.807 | yes |
| clear_15_25pp | 127 | 0.6771 | 0.625 | yes |
| lean_8_15pp | 112 | 0.6419 | 0.669 | yes |
| coin_flip_<8pp | 111 | 0.7004 | 0.483 | yes |

## By patch bucket (top by n)

| Patch | n | Model LL | Acc | Beats baseline |
| --- | --- | --- | --- | --- |
| 16.07 | 134 | 0.6821 | 0.633 | yes |
| 16.09 | 128 | 0.5916 | 0.690 | yes |
| 16.08 | 122 | 0.4470 | 0.811 | yes |
| 16.1 | 104 | 0.4878 | 0.765 | yes |
| 16.03 | 82 | 0.6436 | 0.664 | yes |

## Offline GPR rank benchmark

- Status: `ok`
- Shared teams: 36
- Spearman ρ: 0.645
- Top-10 overlap: 9
- Note: Comparison benchmark only — GPR has 0% weight in live scoring.

## Kalshi closing-line benchmark

- Status: `blocked_no_historical_archive`
- No settled Kalshi closing-line archive is stored yet. Live markets remain comparison-only (0% model weight). Revisit once enough settled series markets are archived for offline CLV.

## Calibration

| Bin | n | Predicted mean | Actual rate |
| --- | --- | --- | --- |
| 0.0-0.1 | 70 | 0.063 | 0.100 |
| 0.1-0.2 | 74 | 0.152 | 0.203 |
| 0.2-0.3 | 74 | 0.248 | 0.338 |
| 0.3-0.4 | 70 | 0.352 | 0.371 |
| 0.4-0.5 | 62 | 0.445 | 0.452 |
| 0.5-0.6 | 77 | 0.548 | 0.584 |
| 0.6-0.7 | 82 | 0.645 | 0.585 |
| 0.7-0.8 | 60 | 0.753 | 0.650 |
| 0.8-0.9 | 82 | 0.848 | 0.768 |
| 0.9-1.0 | 67 | 0.936 | 0.910 |
