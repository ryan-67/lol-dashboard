import { createContext, useContext, ReactNode } from 'react'
import { useDashboardData, DashboardData } from '../hooks/useDashboardData'

interface DataContextType {
  data: DashboardData | null
  loading: boolean
  error: string | null
  refresh: () => void
  lastUpdated: Date | null
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh, lastUpdated } = useDashboardData()
  return (
    <DataContext.Provider value={{ data, loading, error, refresh, lastUpdated }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
