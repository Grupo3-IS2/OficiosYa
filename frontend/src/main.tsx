import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppToaster from './components/AppToaster/AppToaster'
import { watchSessionFromOtherTabs } from './services/authService'
import SessionProvider from './components/SessionProvider/SessionProvider'

watchSessionFromOtherTabs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider><App /></SessionProvider>
    <AppToaster />
  </StrictMode>,
)
