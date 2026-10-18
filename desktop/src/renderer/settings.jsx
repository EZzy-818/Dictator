import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Settings from './Settings.jsx'
import './settings.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Settings />
  </StrictMode>,
)
