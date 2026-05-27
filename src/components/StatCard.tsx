interface StatCardProps {
  title: string
  value: string | number
  sub?: string
}

export default function StatCard({ title, value, sub }: StatCardProps) {
  return (
    <div className="bg-slate-850 border border-slate-800 rounded-lg p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{title}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}
