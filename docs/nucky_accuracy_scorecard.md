# nucky accuracy scorecard

> Generated `2026-07-25T06:58:20.231135+00:00` · algo `xgboost` · 898 holdout rows (2026-02-16 → 2026-07-19)

## Aggregate (walk-forward)

| | log-loss | Brier | accuracy |
| --- | --- | --- | --- |
| **nucky model** | 0.6086 | 0.2097 | 0.678 |
| naive baseline | 0.7068 | 0.2474 | 0.604 |

Ship gate (beats baseline on log-loss): **PASS**

## By league

| League | n | Model LL | Baseline LL | Acc | Beats baseline |
| --- | --- | --- | --- | --- | --- |
| EWC | 204 | 0.6601 | 0.7336 | 0.614 | yes |
| LPL | 204 | 0.6631 | 0.7427 | 0.650 | yes |
| LCK | 202 | 0.5107 | 0.6510 | 0.765 | yes |
| LEC | 134 | 0.5875 | 0.6716 | 0.714 | yes |
| LCS | 88 | 0.6355 | 0.6644 | 0.635 | yes |
| MSI | 40 | 0.5428 | 0.7270 | 0.749 | yes |

## By confidence bucket

| Bucket | n | Model LL | Acc | Beats baseline |
| --- | --- | --- | --- | --- |
| strong_>=25pp | 443 | 0.5224 | 0.783 | yes |
| clear_15_25pp | 197 | 0.7167 | 0.569 | yes |
| lean_8_15pp | 132 | 0.6515 | 0.637 | yes |
| coin_flip_<8pp | 126 | 0.6936 | 0.528 | yes |

## By patch bucket (top by n)

| Patch | n | Model LL | Acc | Beats baseline |
| --- | --- | --- | --- | --- |
| 16.09 | 184 | 0.6592 | 0.641 | yes |
| 16.08 | 162 | 0.4936 | 0.793 | yes |
| 16.07 | 146 | 0.6684 | 0.650 | yes |
| 16.1 | 122 | 0.5793 | 0.740 | yes |
| 16.13 | 94 | 0.5709 | 0.651 | yes |
| 16.03 | 68 | 0.6339 | 0.641 | yes |
| 16.11 | 46 | 0.7995 | 0.569 | yes |

## Offline GPR rank benchmark

- Status: `ok`
- Shared teams: 33
- Spearman ρ: 0.643
- Top-10 overlap: 8
- Note: Comparison benchmark only — GPR has 0% weight in live scoring.

## Kalshi closing-line benchmark

- Status: `blocked_no_historical_archive`
- No settled Kalshi closing-line archive is stored yet. Live markets remain comparison-only (0% model weight). Revisit once enough settled series markets are archived for offline CLV.

## Calibration

| Bin | n | Predicted mean | Actual rate |
| --- | --- | --- | --- |
| 0.0-0.1 | 65 | 0.067 | 0.123 |
| 0.1-0.2 | 116 | 0.150 | 0.224 |
| 0.2-0.3 | 102 | 0.258 | 0.392 |
| 0.3-0.4 | 89 | 0.353 | 0.382 |
| 0.4-0.5 | 88 | 0.449 | 0.443 |
| 0.5-0.6 | 82 | 0.556 | 0.573 |
| 0.6-0.7 | 84 | 0.649 | 0.595 |
| 0.7-0.8 | 104 | 0.751 | 0.654 |
| 0.8-0.9 | 97 | 0.848 | 0.742 |
| 0.9-1.0 | 71 | 0.931 | 0.887 |
