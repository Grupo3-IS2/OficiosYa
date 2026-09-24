import Home from './pages/Home/Home'
import Login from './pages/Login/Login'
import Register from './pages/Register/Register'
import EditProfilePage from './pages/EditProfile/EditProfilePage'
import RequireAuth from './components/RequireAuth/RequireAuth'
import ProfessionalProfilePage from './pages/ProfessionalProfile/ProfessionalProfilePage'

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
            <ProfessionalProfilePage
                professionalId={decodeURIComponent(professionalProfileMatch[1])}
                initialTradeId={initialTradeId}
            />
        )
    }

    if (currentPath === '/profile/edit') {
        return (
            <RequireAuth>
                <EditProfilePage />
            </RequireAuth>
        )
    }

    if (currentPath === '/login') {
        return <Login />
    }

    if (currentPath === '/register') {
        return <Register />
    }

    return <Home />
}

export default App
