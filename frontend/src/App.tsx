import Home from './pages/Home/Home'
import Login from './pages/Login/Login'
import Register from './pages/Register/Register'
import EditProfilePage from './pages/EditProfile/EditProfilePage'
import RequireAuth from './components/RequireAuth/RequireAuth'

function App() {
    const currentPath = window.location.pathname

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
