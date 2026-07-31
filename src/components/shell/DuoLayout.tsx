import ChatPane from './ChatPane'
import DashboardFrame from './DashboardFrame'

export default function DuoLayout() {
  return (
    <div className="duo-layout">
      <div className="duo-chat" data-lenis-prevent>
        <ChatPane embedded />
      </div>
      <div className="duo-dashboard">
        <DashboardFrame />
      </div>
    </div>
  )
}
