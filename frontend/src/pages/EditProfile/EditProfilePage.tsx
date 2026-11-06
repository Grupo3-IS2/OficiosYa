import { useState } from 'react'
import Icon from '../../components/Icon/Icon'
import PersonalDataSection from './components/PersonalDataSection'
import SecuritySection from './components/SecuritySection'
import GoogleAccountSection from './components/GoogleAccountSection'
import ProfessionalProfileSection from './components/ProfessionalProfileSection'
import ScheduleSection from './components/ScheduleSection'
import PayoutSection from './components/PayoutSection'
import BecomeProfessionalCard from './components/BecomeProfessionalCard'
import TermsSection from './components/TermsSection'
import DeleteAccountSection from './components/DeleteAccountSection'
import UnsavedChangesModal from './components/UnsavedChangesModal'
import useProfileEditor from './useProfileEditor'
import { startMercadoPagoLink } from '../../services/userService'
import useUnsavedNavigation from './useUnsavedNavigation'
import { useSession } from '../../components/SessionProvider/useSession'
import { MERCADO_PAGO_LINK_CHANNEL } from './payoutAccount'
import './EditProfile.css'

/** How linking Mercado Pago went, as it comes back in ?mercadopago= */
const linkOutcomes: Record<string, { message?: string; error?: string }> = {
    linked: { message: 'Vinculaste tu cuenta de Mercado Pago.' },
    cancelled: { error: 'No se vinculó la cuenta: no autorizaste a OficiosYa en Mercado Pago.' },
    error: { error: 'No pudimos vincular tu cuenta de Mercado Pago. Intentá nuevamente.' },
    busy: { error: 'Tenés trabajos en curso cobrados en otra cuenta de Mercado Pago: terminalos o cancelalos antes de cambiarla.' },
}

export default function EditProfilePage({ isProfessional }: { isProfessional?: boolean }) {
    const editor = useProfileEditor(isProfessional)
    const isAdmin = useSession().user?.role === 'ADMIN'
    const navigation = useUnsavedNavigation(editor.hasChanges, editor.busy)
    const [linkOutcome] = useState(() => {
        const outcome = linkOutcomes[new URLSearchParams(window.location.search).get('mercadopago') ?? '']
        // Said once: reloading the page doesn't repeat it
        if (outcome) {
            window.history.replaceState(null, '', window.location.pathname)
            const channel = new BroadcastChannel(MERCADO_PAGO_LINK_CHANNEL)
            channel.postMessage('done')
            channel.close()
        }
        return outcome
    })

    /** In another tab, opened before waiting: browsers block the ones opened later, away from the click. */
    async function linkMercadoPago() {
        const tab = window.open('', '_blank')
        try {
            const url = await startMercadoPagoLink()
            if (!tab) return navigation.leave(url)
            tab.opener = null
            tab.location.href = url
        } catch (failure) {
            tab?.close()
            throw failure
        }
    }

    async function saveAndLeave() {
        if (await editor.savePending()) navigation.continueNavigation()
    }

    return (
        <div className="edit-profile-page">
            <header className="edit-profile-header">
                <a className="edit-profile-brand" href="/" aria-label="OficiosYa inicio">Oficios<span>Ya</span></a>
                <a className="edit-profile-home" href="/"><Icon name="home" />Volver al inicio</a>
            </header>
            <main className="edit-profile-main">
                <div className="edit-profile-heading">
                    <h1>Editar perfil</h1>
                    <p>Actualiza tus datos personales y la información de tu cuenta.</p>
                </div>
                {editor.error && !editor.errorSection && !navigation.isOpen && <p className="profile-error profile-page-error" role="alert">{editor.error}</p>}
                <fieldset className="profile-editor-fields" disabled={editor.busy || editor.loadingProfile || editor.profileLoadFailed} aria-busy={editor.busy || editor.loadingProfile}>
                    <PersonalDataSection value={editor.personal} onChange={editor.setPersonal} onPhotoChange={editor.selectPhoto} onPhotoRemove={editor.removePhoto} onSave={() => editor.saveSection('personal')} message={editor.messages.personal} error={editor.errorSection === 'personal' ? editor.error : ''} showPhone={editor.isProfessional} emailEditable={editor.access.hasPassword} onStartEmailChange={editor.requestEmailChange} onConfirmEmailChange={editor.confirmEmailChange}
                        showNotifications={!editor.loadingProfile && !editor.profileLoadFailed} />
                    {(editor.loadingProfile || editor.access.hasPassword) && <SecuritySection value={editor.security} onChange={editor.setSecurity} onSave={() => editor.saveSection('security')} message={editor.messages.security} error={editor.errorSection === 'security' ? editor.error : ''} />}
                    {editor.isProfessional
                        ? <>
                            <ProfessionalProfileSection value={editor.professional} onChange={editor.setProfessional} onSave={() => editor.saveSection('professional')} message={editor.messages.professional} error={editor.errorSection === 'professional' ? editor.error : ''} trades={editor.trades} tradesLoading={editor.tradesLoading} tradesError={editor.tradesError} />
                            <PayoutSection value={editor.payout} saved={editor.savedPayout} verified={editor.payoutVerified} linkAvailable={editor.mercadoPagoLinkAvailable} onChange={editor.setPayout} onSave={() => editor.saveSection('payout')}
                                onLink={linkMercadoPago}
                                onUnlink={editor.unlinkPayout}
                                message={editor.messages.payout || linkOutcome?.message} error={editor.errorSection === 'payout' ? editor.error : linkOutcome?.error} profileName={editor.personal.name} />
                            {editor.user && <ScheduleSection professionalId={editor.user.id} />}
                        </>
                        : !isAdmin && <BecomeProfessionalCard />}
                </fieldset>
                <TermsSection />
                {/* At the end, with deleting the account: unlinking Google is the other way to lose a way in.
                    Not before the profile says whether Google is linked: it would show the wrong state. */}
                {!editor.loadingProfile && !editor.profileLoadFailed && <GoogleAccountSection access={editor.access} email={editor.savedPersonalEmail} onChange={editor.setAccess} />}
                {!editor.loadingProfile && !editor.profileLoadFailed && <DeleteAccountSection hasPassword={editor.access.hasPassword} email={editor.savedPersonalEmail} />}
            </main>
            {navigation.isOpen && <UnsavedChangesModal busy={editor.busy} error={editor.error} onSave={() => void saveAndLeave()}
                onDiscard={() => { editor.discard(); navigation.continueNavigation() }} onCancel={() => { editor.clearError(); navigation.cancelNavigation() }} />}
        </div>
    )
}
