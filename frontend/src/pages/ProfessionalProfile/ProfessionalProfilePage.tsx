import { useEffect, useState } from 'react'
import Header from '../../components/Header/Header'
import { ApiError } from '../../services/api'
import { getProfessional } from '../../services/professionalService'
import type { Professional } from '../../types/Professional'
import ProfessionalProfileHeader from './components/ProfessionalProfileHeader'
import ProfessionalServices from './components/ProfessionalServices'
import ReviewsSection from './components/ReviewsSection'
import WorkZone from './components/WorkZone'
import WeeklyAvailability from './components/WeeklyAvailability'
import './ProfessionalProfile.css'

interface ProfessionalProfilePageProps {
    professionalId: string
    initialTradeId: number | null
}

function ProfessionalProfilePage({ professionalId, initialTradeId }: ProfessionalProfilePageProps) {
    const [professional, setProfessional] = useState<Professional | null>(null)
    const [selectedTradeId, setSelectedTradeId] = useState<number | null>(initialTradeId)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true

        void getProfessional(professionalId)
            .then(response => { if (active) setProfessional(response) })
            .catch(error => {
                if (!active) return
                setError(error instanceof ApiError && error.status === 404
                    ? 'No encontramos el perfil que buscás.'
                    : 'No pudimos cargar este perfil. Intentá de nuevo más tarde.')
            })
            .finally(() => { if (active) setLoading(false) })

        return () => { active = false }
    }, [professionalId])

    function goBack() {
        if (window.history.length > 1) window.history.back()
        else window.location.href = '/#professionals'
    }

    function selectTrade(tradeId: number) {
        setSelectedTradeId(tradeId)

        const url = new URL(window.location.href)
        url.searchParams.set('tradeId', String(tradeId))
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    }

    const selectedTrade = professional?.expertiseTrades.find(trade => trade.tradeId === selectedTradeId) ?? null

    return (
        <div id="top" className="professional-profile-page">
            <Header />
            <main className="profile-content">
                <button className="profile-back" type="button" onClick={goBack}>
                    <span aria-hidden="true">←</span> Volver a profesionales
                </button>

                {loading && <output className="profile-status">Cargando perfil...</output>}
                {!loading && error && (
                    <div className="profile-status profile-status--error" role="alert">
                        <h1>{error}</h1>
                        <button type="button" onClick={goBack}>Volver a profesionales</button>
                    </div>
                )}
                {!loading && professional && <>
                    <ProfessionalProfileHeader professional={professional} selectedTrade={selectedTrade} />

                    <section className="public-profile-section profile-about" aria-labelledby="about-heading">
                        <h2 id="about-heading">Sobre mí</h2>
                        <p>{professional.description || 'Este profesional todavía no agregó una descripción.'}</p>
                    </section>

                    <ProfessionalServices
                        trades={professional.expertiseTrades}
                        selectedTradeId={selectedTrade?.tradeId ?? null}
                        onSelect={selectTrade}
                    />
                    <WorkZone workingLocation={professional.workingLocation} />
                    <WeeklyAvailability />
                    <ReviewsSection rating={professional.rating} />
                </>}
            </main>
        </div>
    )
}

export default ProfessionalProfilePage
