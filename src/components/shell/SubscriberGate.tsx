import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useChatSession } from '../../context/ChatSessionContext'
import SignalLoader from '../ui/SignalLoader'

/**
 * Duo and full-chat require an active subscription.
 * Guests and free users are sent to the dashboard.
 */
export default function SubscriberGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { isSubscribed, subscriptionReady } = useChatSession()
  const location = useLocation()

  if (authLoading || (user && !subscriptionReady)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <SignalLoader label="loading…" />
      </div>
    )
  }

  if (!user || !isSubscribed) {
    return <Navigate to="/dashboard" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
