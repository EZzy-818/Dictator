import { useEffect, useState } from 'react'
import Indicator from './Indicator.jsx'
import { useDesktopRecorder } from './useDesktopRecorder.js'

export default function App({ bridge = window.dictator }) {
  const [view, setView] = useState({ phase: 'idle' })
  const { stream } = useDesktopRecorder(bridge)
  useEffect(() => bridge.onState(setView), [bridge])
  return <Indicator view={view} stream={stream} />
}
