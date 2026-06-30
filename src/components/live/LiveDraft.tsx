import type { LiveMatchDraft } from '../../lib/live/types'
import { ChampionIcon } from '../entities'

interface LiveDraftProps {
  draft: LiveMatchDraft | null
  blueLabel: string
  redLabel: string
}

function ChampList({ names, kind }: { names: string[]; kind: 'pick' | 'ban' }) {
  if (!names.length) return <span className="live-draft-empty">—</span>
  return (
    <div className="live-draft-icons">
      {names.map((name, i) => (
        <span key={`${name}-${i}`} className={`live-draft-champ live-draft-${kind}`} title={name}>
          <ChampionIcon name={name} size={kind === 'ban' ? 22 : 30} />
        </span>
      ))}
    </div>
  )
}

export default function LiveDraft({ draft, blueLabel, redLabel }: LiveDraftProps) {
  if (!draft || !draft.hasData) {
    return (
      <div className="empty-state">Draft will appear here once picks and bans are locked in.</div>
    )
  }

  const bluePickNames = draft.blue.picks.map((p) => p.championName)
  const redPickNames = draft.red.picks.map((p) => p.championName)

  return (
    <div className="live-draft">
      <div className="live-draft-col live-draft-col-blue">
        <div className="live-draft-team">
          <span className="live-bar-side live-bar-side-blue">Blue</span>
          <span className="live-draft-team-name">{blueLabel}</span>
        </div>
        <div className="live-draft-section-label">Picks</div>
        <ChampList names={bluePickNames} kind="pick" />
        <div className="live-draft-section-label">Bans</div>
        <ChampList names={draft.blue.bans} kind="ban" />
      </div>

      <div className="live-draft-col live-draft-col-red">
        <div className="live-draft-team live-draft-team-right">
          <span className="live-draft-team-name">{redLabel}</span>
          <span className="live-bar-side live-bar-side-red">Red</span>
        </div>
        <div className="live-draft-section-label live-draft-section-label-right">Picks</div>
        <ChampList names={redPickNames} kind="pick" />
        <div className="live-draft-section-label live-draft-section-label-right">Bans</div>
        <ChampList names={draft.red.bans} kind="ban" />
      </div>
    </div>
  )
}
