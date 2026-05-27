import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Players from './pages/Players'
import Teams from './pages/Teams'
import Champions from './pages/Champions'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/players" element={<Players />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/champions" element={<Champions />} />
      </Routes>
    </Layout>
  )
}

export default App
