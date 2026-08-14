import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isCitoRowCompletedForRecap,
  isSeriesReadyForRecap,
  recapHasFullSeriesEvidence,
  liftStaleSweepIfOvermapped,
  type CitoSeriesResult,
  type ResolvedSeriesScore,
} from './citoSeriesVerify.ts'
import { mergeWeeklyRecapLines, reconcileRecapScoreFromNarrative } from './recapMerge.ts'
import type { WeeklyRecapLine } from './weeklyRecap.ts'
import { formUnitTo100, powerScoreTo100, eloTo100 } from './scoreNormalize.ts'
import { championPresenceRates, clampPresencePct, computeRecencyWeightedOpScores } from './championAnalytics.ts'
import type { Champion } from '../hooks/useDashboardData.ts'

function resolved(partial: Partial<ResolvedSeriesScore>): ResolvedSeriesScore {
  return {
    winsA: 2,
    winsB: 0,
    winner: 'Dplus Kia',
    loser: 'T1',
    score: '2-0',
    complete: true,
    source: 'oe',
    blockName: 'Week 12',
    bracket: 'unknown',
    bestOf: null,
    provisional: false,
    skipCompleted: false,
    cito: null,
    ...partial,
  }
}

const citoRow = (over: Partial<CitoSeriesResult> = {}): CitoSeriesResult => ({
  matchId: 'lol-match-dk-t1',
  league: 'LCK',
  tournamentName: 'Week 12',
  blockName: 'Week 12',
  teamA: 'Dplus Kia',
  teamB: 'T1',
  scheduledAt: '2026-08-14T08:00:00Z',
  status: 'completed',
  scoreA: 2,
  scoreB: 1,
  winnerTeam: 'Dplus Kia',
  bestOf: 3,
  ...over,
})

describe('recap readiness', () => {
  it('does not recap OE 2-0 with no schedule confirmation', () => {
    assert.equal(isSeriesReadyForRecap(resolved({ source: 'oe', bestOf: null, cito: null })), false)
  })

  it('recaps a completed Bo3 2-1 from Cito', () => {
    const row = citoRow()
    assert.equal(
      isSeriesReadyForRecap(
        resolved({
          winsA: 2,
          winsB: 1,
          score: '2-1',
          source: 'cito',
          bestOf: 3,
          cito: row,
        }),
      ),
      true,
    )
  })

  it('rejects regular-season 3-0 when best-of is 3', () => {
    assert.equal(
      isSeriesReadyForRecap(
        resolved({
          winsA: 3,
          winsB: 0,
          score: '3-0',
          source: 'cito',
          bestOf: 3,
          cito: citoRow({ scoreA: 3, scoreB: 0, bestOf: 3 }),
        }),
      ),
      false,
    )
  })

  it('does not treat scheduled placeholder scores as completed', () => {
    assert.equal(
      isCitoRowCompletedForRecap(
        citoRow({ status: 'scheduled', scoreA: 2, scoreB: 0 }),
      ),
      false,
    )
    assert.equal(isCitoRowCompletedForRecap(citoRow()), true)
  })

  it('waits when score is 2-0 but three maps already exist', () => {
    assert.equal(
      recapHasFullSeriesEvidence({
        resolved: resolved({ winsA: 2, winsB: 0, score: '2-0', source: 'cito', bestOf: 3 }),
        oeGameCount: 2,
        citoBoxGameCount: 3,
      }),
      false,
    )
    assert.equal(
      recapHasFullSeriesEvidence({
        resolved: resolved({ winsA: 2, winsB: 1, score: '2-1', source: 'cito', bestOf: 3 }),
        oeGameCount: 2,
        citoBoxGameCount: 3,
      }),
      true,
    )
  })
})

describe('recap merge prefers live score', () => {
  it('keeps template 2-1 over cached 3-0', () => {
    const template: WeeklyRecapLine = {
      id: 't',
      seriesId: 'Dplus Kia|T1|2026-08-14',
      date: '2026-08-14',
      dateLabel: 'Aug 14',
      segments: [{ kind: 'text', value: 'DK beat T1 2-1 (LCK)' }],
      score: {
        winner: 'Dplus Kia',
        loser: 'T1',
        winnerAbbr: 'DK',
        loserAbbr: 'T1',
        score: '2-1',
      },
    }
    const cached: WeeklyRecapLine = {
      ...template,
      id: 'c',
      segments: [{ kind: 'text', value: 'DK beat T1 3-0 after dropping game 1' }],
      score: { ...template.score, score: '3-0' },
    }
    const merged = mergeWeeklyRecapLines([cached], [template], 8)
    assert.equal(merged[0]?.score.score, '2-1')
  })

  it('drops cached-only phantom series that are not in the live template', () => {
    const phantom: WeeklyRecapLine = {
      id: 'p',
      seriesId: 'ThunderTalk Gaming|Top Esports|2026-08-14',
      date: '2026-08-14',
      dateLabel: 'Aug 14',
      segments: [{ kind: 'text', value: 'TT beat TES 3-0 (LPL)' }],
      score: {
        winner: 'ThunderTalk Gaming',
        loser: 'Top Esports',
        winnerAbbr: 'TT',
        loserAbbr: 'TES',
        score: '3-0',
      },
    }
    const merged = mergeWeeklyRecapLines([phantom], [], 8)
    assert.equal(merged.length, 0)
  })
})

describe('score scale', () => {
  it('does not map Rookie-level power to 100', () => {
    const score = powerScoreTo100(0.665, { effGames: 10.8 })
    assert.ok(score < 90, `expected < 90, got ${score}`)
  })

  it('does not map Gen.G Elo 1850 to 100', () => {
    const score = eloTo100(1850.9)
    assert.ok(score < 90, `expected < 90, got ${score}`)
  })

  it('caps weekly form below 100', () => {
    assert.ok(formUnitTo100(1, 8) <= 96)
  })
})

describe('recap score vs narrative', () => {
  it('lifts a 2-0 header when the recap text says they dropped game 1', () => {
    const line: WeeklyRecapLine = {
      id: 'dk-t1',
      seriesId: 'Dplus Kia|T1|2026-08-14',
      date: '2026-08-14',
      dateLabel: 'Aug 14',
      segments: [
        { kind: 'text', value: 'after dropping game 1, DK rallied to take down T1 2-0' },
      ],
      score: {
        winner: 'Dplus Kia',
        loser: 'T1',
        winnerAbbr: 'DK',
        loserAbbr: 'T1',
        score: '2-0',
      },
    }
    assert.equal(reconcileRecapScoreFromNarrative(line).score.score, '2-1')
  })

  it('lifts cached 2-0 when merged with a template that still shows a sweep', () => {
    const template: WeeklyRecapLine = {
      id: 't',
      seriesId: 'LGD GAMING|EDward Gaming|2026-08-14',
      date: '2026-08-14',
      dateLabel: 'Aug 14',
      segments: [{ kind: 'text', value: 'LGD beat EDG 2-0 (LPL)' }],
      score: {
        winner: 'LGD GAMING',
        loser: 'EDward Gaming',
        winnerAbbr: 'LGD',
        loserAbbr: 'EDG',
        score: '2-0',
      },
    }
    const cached: WeeklyRecapLine = {
      ...template,
      id: 'c',
      segments: [
        { kind: 'text', value: 'LGD edge out EDG 2-0, despite EDG taking game 1 (sequence WL)' },
      ],
    }
    const merged = mergeWeeklyRecapLines([cached], [template], 8)
    assert.equal(merged[0]?.score.score, '2-1')
  })

  it('lifts a completed 2-0 when three maps already exist', () => {
    const lifted = liftStaleSweepIfOvermapped(
      resolved({
        winsA: 2,
        winsB: 0,
        score: '2-0',
        source: 'cito',
        bestOf: 3,
        complete: true,
        provisional: false,
        skipCompleted: false,
      }),
      3,
    )
    assert.equal(lifted.score, '2-1')
    assert.equal(lifted.winsA, 2)
    assert.equal(lifted.winsB, 1)
  })
})

describe('champion presence', () => {
  it('caps pick+ban presence at 100%', () => {
    const rates = championPresenceRates(
      { picks: 40, bans: 35 } as Champion,
      40,
    )
    assert.equal(rates.pickRate, 100)
    assert.ok(rates.banRate <= 100)
    assert.ok(rates.presence <= 100)
    assert.equal(clampPresencePct({ presence: 199.2, pickRate: 100, banRate: 99.2 }), 100)
  })

  it('does not emit 199% presence from recency-weighted weekly buckets', () => {
    const champ = {
      name: 'Akali',
      positions: ['mid'],
      picks: 12,
      bans: 12,
      presence: 199.2,
      pickRate: 100,
      banRate: 99.2,
      winrate: 80,
      avgKda: 4,
      weeklyStats: [
        {
          weekStart: '2026-08-10',
          picks: 8,
          bans: 7,
          wins: 6,
          winrate: 75,
          presence: 199.2,
          games: 20,
        },
      ],
    } as Champion
    const scored = computeRecencyWeightedOpScores([champ], {
      asOf: new Date('2026-08-14T12:00:00Z'),
      minPresence: 1,
      minWeightedPicks: 1,
    })
    const presence = scored.all[0]?.champion.presence ?? 0
    assert.ok(presence <= 100, `expected presence <= 100, got ${presence}`)
  })
})

