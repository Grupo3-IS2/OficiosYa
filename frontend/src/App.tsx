import Home from './pages/Home/Home'
import Login from './pages/LogIn/Login'
import Register from './pages/Register/Register'
import EditProfilePage from './pages/EditProfile/EditProfilePage'

function App() {
    const currentPath = window.location.pathname

    if (currentPath === '/profile/edit') {
        return <EditProfilePage />
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
