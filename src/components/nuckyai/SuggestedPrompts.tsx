const PROMPTS = [
  'analyze the next lck matchup',
  'compare T1 vs Gen.G stats',
  "who's the most overrated player this split?",
  'draft analysis for latest patch',
] as const

interface SuggestedPromptsProps {
  onPick: (prompt: string) => void
}

export default function SuggestedPrompts({ onPick }: SuggestedPromptsProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
          onClick={() => onPick(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}
