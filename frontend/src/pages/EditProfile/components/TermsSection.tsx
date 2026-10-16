import Icon from '../../../components/Icon/Icon'

export default function TermsSection() {
    return (
        <section className="profile-section profile-terms" aria-labelledby="terms-title">
            <h2 id="terms-title">Términos y condiciones</h2>
            <p className="profile-subtitle">Las reglas que aceptaste al usar OficiosYa.</p>
            {/* Like the account settings of Google and others: one row that is all link, to a page in another tab */}
            <a className="profile-terms__link" href="/terminos" target="_blank" rel="noreferrer">
                <span className="profile-terms__icon" aria-hidden="true"><Icon name="document" /></span>
                <span className="profile-terms__text">
                    <strong>Términos del servicio</strong>
                    <small>Cómo funciona OficiosYa, qué podés hacer y qué responsabilidades tenés.</small>
                </span>
                <span className="profile-terms__arrow" aria-hidden="true"><Icon name="chevron-down" /></span>
                <span className="profile-terms__hint">(se abre en otra pestaña)</span>
            </a>
        </section>
    )
}
