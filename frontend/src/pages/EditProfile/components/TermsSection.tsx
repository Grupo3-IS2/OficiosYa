export default function TermsSection() {
    return (
        <section className="profile-section profile-terms" aria-labelledby="terms-title">
            <h2 id="terms-title">Términos y condiciones</h2>
            <p className="profile-subtitle">Terminos y Condiciones de OficiosYa.</p>
            {/* It opens a page, in another tab */}
            <a className="button button--ghost" href="/terminos" target="_blank" rel="noreferrer">Ver términos y condiciones</a>
        </section>
    )
}
