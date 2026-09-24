import Icon from '../../components/Icon/Icon'
import PersonalDataSection from './components/PersonalDataSection'
import SecuritySection from './components/SecuritySection'
import GoogleAccountSection from './components/GoogleAccountSection'
import ProfessionalProfileSection from './components/ProfessionalProfileSection'
import BecomeProfessionalCard from './components/BecomeProfessionalCard'
import UnsavedChangesModal from './components/UnsavedChangesModal'
import useProfileEditor from './useProfileEditor'
import useUnsavedNavigation from './useUnsavedNavigation'
import './EditProfile.css'

export default function EditProfilePage({ isProfessional }: { isProfessional?: boolean }) {
    const editor = useProfileEditor(isProfessional)
    const navigation = useUnsavedNavigation(editor.hasChanges, editor.busy)

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
                    <PersonalDataSection value={editor.personal} onChange={editor.setPersonal} onPhotoChange={editor.selectPhoto} onSave={() => editor.saveSection('personal')} message={editor.messages.personal} error={editor.errorSection === 'personal' ? editor.error : ''} emailChanged={editor.personal.email.trim() !== editor.savedPersonalEmail} currentPassword={editor.emailPassword} onCurrentPasswordChange={editor.setEmailPassword} showPhone={editor.isProfessional} emailEditable={editor.access.hasPassword} emailChange={editor.emailChange} currentEmail={editor.savedPersonalEmail} onConfirmEmailChange={editor.confirmEmailChange} onResendEmailChange={editor.resendEmailChange} onCancelEmailChange={editor.cancelEmailChange} />
                    {(editor.loadingProfile || editor.access.hasPassword) && <SecuritySection value={editor.security} onChange={editor.setSecurity} onSave={() => editor.saveSection('security')} message={editor.messages.security} error={editor.errorSection === 'security' ? editor.error : ''} />}
                    {/* Not before the profile says whether Google is linked: it would show the wrong state. */}
                    {!editor.loadingProfile && !editor.profileLoadFailed && <GoogleAccountSection access={editor.access} email={editor.savedPersonalEmail} onChange={editor.setAccess} />}
                    {editor.isProfessional
                        ? <ProfessionalProfileSection value={editor.professional} onChange={editor.setProfessional} onSave={() => editor.saveSection('professional')} message={editor.messages.professional} error={editor.errorSection === 'professional' ? editor.error : ''} trades={editor.trades} tradesLoading={editor.tradesLoading} tradesError={editor.tradesError} />
                        : <BecomeProfessionalCard />}
                </fieldset>
            </main>
            {navigation.isOpen && <UnsavedChangesModal busy={editor.busy} error={editor.error} onSave={() => void saveAndLeave()}
                onDiscard={() => { editor.discard(); navigation.continueNavigation() }} onCancel={() => { editor.clearError(); navigation.cancelNavigation() }} />}
        </div>
    )
}
