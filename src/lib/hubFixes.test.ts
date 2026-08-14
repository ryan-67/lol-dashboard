import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isCitoRowCompletedForRecap,
  isSeriesReadyForRecap,
  recapHasFullSeriesEvidence,
  type CitoSeriesResult,
  type ResolvedSeriesScore,
} from './citoSeriesVerify.ts'
import { mergeWeeklyRecapLines } from './recapMerge.ts'
import type { WeeklyRecapLine } from './weeklyRecap.ts'
import { formUnitTo100, powerScoreTo100, eloTo100 } from './scoreNormalize.ts'

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
