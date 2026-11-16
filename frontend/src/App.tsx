import Home from './pages/Home/Home'
import Login from './pages/Login/Login'
import ForgotPassword from './pages/Login/ForgotPassword'
import Register from './pages/Register/Register'
import EditProfilePage from './pages/EditProfile/EditProfilePage'
import RequireAuth from './components/RequireAuth/RequireAuth'
import ProfessionalProfilePage from './pages/ProfessionalProfile/ProfessionalProfilePage'
import RequestsPage from './pages/Requests/RequestsPage'
import TermsPage from './pages/Terms/TermsPage'
import ChatPage from './pages/Chat/ChatPage'
import PayoutsPage from './pages/Admin/PayoutsPage'
import BalancePage from './pages/Balance/BalancePage'

function App() {
    const currentPath = window.location.pathname
    const professionalProfileMatch = currentPath.match(/^\/profesionales\/([^/]+)\/?$/)

    if (professionalProfileMatch) {
        const tradeIdParam = new URLSearchParams(window.location.search).get('tradeId')
        const parsedTradeId = tradeIdParam === null ? null : Number(tradeIdParam)
        const initialTradeId = parsedTradeId !== null && Number.isSafeInteger(parsedTradeId) && parsedTradeId > 0
            ? parsedTradeId
            : null

        return (
            <RequireAuth>
                <ProfessionalProfilePage
                    professionalId={decodeURIComponent(professionalProfileMatch[1])}
                    initialTradeId={initialTradeId}
                />
            </RequireAuth>
        )
    }

    if (currentPath === '/profile/edit') {
        return (
            <RequireAuth>
                <EditProfilePage />
            </RequireAuth>
        )
    }

    if (currentPath === '/mis-solicitudes') {
        return (
            <RequireAuth notForAdmin>
                <RequestsPage />
            </RequireAuth>
        )
    }

    if (currentPath === '/chat') {
        return (
            <RequireAuth notForAdmin>
                <ChatPage />
            </RequireAuth>
        )
    }

    if (currentPath === '/admin/transferencias') {
        return (
            <RequireAuth>
                <PayoutsPage />
            </RequireAuth>
        )
    }

    if (currentPath === '/mi-balance') {
        return (
            <RequireAuth>
                <BalancePage />
            </RequireAuth>
        )
    }

    if (currentPath === '/login') {
        return <Login />
    }

    if (currentPath === '/recuperar-contrasena') {
        return <ForgotPassword />
    }

    if (currentPath === '/register') {
        return <Register />
    }

    if (currentPath === '/terminos') {
        return <TermsPage />
    }

    return <Home />
}

export default App
