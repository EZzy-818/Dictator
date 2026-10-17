import { useEffect, useState } from 'react'
import { getHealth } from './services/api.js'

function App() {
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    getHealth()
      .then(() => setBackendStatus('connected'))
      .catch(() => setBackendStatus('unreachable'))
  }, [])

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Dictator</h1>
        <p className="text-slate-600">AI Voice-to-Text</p>
      </header>

      <p className="mt-6 text-sm text-slate-500" data-testid="backend-status">
        Backend: {backendStatus}
      </p>
    </main>
  )
}

export default App
