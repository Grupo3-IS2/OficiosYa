import Icon from '../../components/Icon/Icon'
import PersonalDataSection from './PersonalDataSection'
import SecuritySection from './SecuritySection'
import ProfessionalProfileSection from './ProfessionalProfileSection'
import BecomeProfessionalCard from './BecomeProfessionalCard'
import UnsavedChangesModal from './UnsavedChangesModal'
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
                <fieldset className="profile-editor-fields" disabled={editor.busy} aria-busy={editor.busy}>
                    <PersonalDataSection value={editor.personal} onChange={editor.setPersonal} onSave={() => editor.saveSection('personal')} message={editor.messages.personal} error={editor.errorSection === 'personal' ? editor.error : ''} emailChanged={editor.personal.email.trim() !== editor.savedPersonalEmail} currentPassword={editor.emailPassword} onCurrentPasswordChange={editor.setEmailPassword} />
                    <SecuritySection value={editor.security} onChange={editor.setSecurity} onSave={() => editor.saveSection('security')} message={editor.messages.security} error={editor.errorSection === 'security' ? editor.error : ''} />
                    {editor.isProfessional
                        ? <ProfessionalProfileSection value={editor.professional} onChange={editor.setProfessional} onSave={() => editor.saveSection('professional')} message={editor.messages.professional} />
                        : <BecomeProfessionalCard />}
                </fieldset>
            </main>
            {navigation.isOpen && <UnsavedChangesModal busy={editor.busy} error={editor.error} onSave={() => void saveAndLeave()}
                onDiscard={() => { editor.discard(); navigation.continueNavigation() }} onCancel={() => { editor.clearError(); navigation.cancelNavigation() }} />}
        </div>
    )
}
