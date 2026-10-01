import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { scheduleSessionExpiry, watchSessionFromOtherTabs } from './services/authService'

scheduleSessionExpiry()
watchSessionFromOtherTabs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
