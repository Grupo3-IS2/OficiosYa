// Development-only manual fixture; not imported by the production entry point.
import { createRoot } from 'react-dom/client'
import EditProfilePage from '../src/pages/EditProfile/EditProfilePage'
import '../src/index.css'

createRoot(document.getElementById('root')!).render(
    <EditProfilePage isProfessional={new URLSearchParams(location.search).get('professional') === 'true'} />,
)
