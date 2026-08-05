# nucky accuracy scorecard

> Generated `2026-08-05T09:04:49.551100+00:00` · algo `xgboost` · 932 holdout rows (2026-03-16 → 2026-08-03)

## Aggregate (walk-forward)

| | log-loss | Brier | accuracy |
| --- | --- | --- | --- |
| **nucky model** | 0.5999 | 0.2080 | 0.672 |
| naive baseline | 0.6956 | 0.2431 | 0.601 |

Ship gate (beats baseline on log-loss): **PASS**

## By league

| League | n | Model LL | Baseline LL | Acc | Beats baseline |
| --- | --- | --- | --- | --- | --- |
| LPL | 228 | 0.5933 | 0.6827 | 0.656 | yes |
| LCK | 210 | 0.6185 | 0.7376 | 0.669 | yes |
| EWC | 204 | 0.6471 | 0.7323 | 0.659 | yes |
| LEC | 134 | 0.5331 | 0.6381 | 0.706 | yes |
| LCS | 90 | 0.6010 | 0.6181 | 0.637 | yes |
| MSI | 40 | 0.5599 | 0.7270 | 0.745 | yes |

## By confidence bucket

| Bucket | n | Model LL | Acc | Beats baseline |
| --- | --- | --- | --- | --- |
| strong_>=25pp | 490 | 0.4979 | 0.786 | yes |
| clear_15_25pp | 199 | 0.7201 | 0.572 | yes |
| coin_flip_<8pp | 122 | 0.6952 | 0.511 | yes |
| lean_8_15pp | 121 | 0.6767 | 0.584 | yes |

## By patch bucket (top by n)

| Patch | n | Model LL | Acc | Beats baseline |
| --- | --- | --- | --- | --- |
| 16.09 | 184 | 0.6518 | 0.631 | yes |
| 16.08 | 162 | 0.4978 | 0.781 | yes |
| 16.07 | 146 | 0.6643 | 0.664 | yes |
| 16.1 | 122 | 0.5832 | 0.733 | yes |
| 16.13 | 94 | 0.5662 | 0.707 | yes |
| 16.14 | 94 | 0.6457 | 0.585 | yes |
| 16.11 | 46 | 0.7739 | 0.615 | yes |

## Offline GPR rank benchmark

- Status: `ok`
- Shared teams: 37
- Spearman ρ: 0.745
- Top-10 overlap: 9
- Note: Comparison benchmark only — GPR has 0% weight in live scoring.

## Kalshi closing-line benchmark

- Status: `blocked_no_historical_archive`
- No settled Kalshi closing-line archive is stored yet. Live markets remain comparison-only (0% model weight). Revisit once enough settled series markets are archived for offline CLV.

## Calibration

| Bin | n | Predicted mean | Actual rate |
| --- | --- | --- | --- |
| 0.0-0.1 | 74 | 0.069 | 0.135 |
| 0.1-0.2 | 110 | 0.151 | 0.182 |
| 0.2-0.3 | 119 | 0.251 | 0.403 |
| 0.3-0.4 | 84 | 0.348 | 0.369 |
| 0.4-0.5 | 82 | 0.446 | 0.463 |
| 0.5-0.6 | 75 | 0.547 | 0.573 |
| 0.6-0.7 | 92 | 0.649 | 0.565 |
| 0.7-0.8 | 108 | 0.751 | 0.657 |
| 0.8-0.9 | 115 | 0.847 | 0.748 |
| 0.9-1.0 | 73 | 0.930 | 0.890 |
