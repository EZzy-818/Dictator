import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Indicator from './Indicator.jsx'
import './indicator.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Indicator />
  </StrictMode>,
)
