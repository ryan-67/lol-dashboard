interface SortableThProps<T extends string> {
  label: string
  columnKey: T
  sortKey: T
  sortDesc: boolean
  onSort: (key: T) => void
}

export default function SortableTh<T extends string>({
  label,
  columnKey,
  sortKey,
  sortDesc,
  onSort,
}: SortableThProps<T>) {
  return (
    <th onClick={() => onSort(columnKey)} className="sortable">
      {label} {sortKey === columnKey ? (sortDesc ? '↓' : '↑') : ''}
    </th>
  )
}
