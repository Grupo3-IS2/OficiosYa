import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppToaster from './components/AppToaster/AppToaster'
import { watchSessionFromOtherTabs } from './services/authService'
import { resumeSession } from './services/sessionRenewal'

void resumeSession()
watchSessionFromOtherTabs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <AppToaster />
  </StrictMode>,
)
