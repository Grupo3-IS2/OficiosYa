import { Toaster } from 'sonner'
import './AppToaster.css'

/** Where every toast of the app shows up, with its colors. Show one with `toast` from 'sonner'. */
export default function AppToaster() {
    return <Toaster className="app-toaster" position="bottom-center" duration={4000} closeButton
        toastOptions={{ closeButtonAriaLabel: 'Cerrar aviso' }} />
}
