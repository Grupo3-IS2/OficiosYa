import type { CSSProperties } from 'react'
import CategoryCard from '../../components/CategoryCard/CategoryCard'
import Header from '../../components/Header/Header'
import Icon from '../../components/Icon/Icon'
import ProfessionalCard from '../../components/ProfessionalCard/ProfessionalCard'
import SearchBar from '../../components/SearchBar/SearchBar'
import heroImage from '../../assets/hero-home.svg'
import {
    categories,
    popularSearches,
    professionals,
} from './homeData'
import './Home.css'

function Home() {
    const heroStyle = {
        '--hero-image': `url(${heroImage})`,
    } as CSSProperties

    return (
        <div id="top">
            <Header />

            <main>
                <section className="hero" style={heroStyle}>
                    <div className="hero-copy">
                        <SearchBar />

                        <div className="popular-searches">
                            <span>Búsquedas populares:</span>
                            {popularSearches.map((search) => (
                                <button key={search} type="button">
                                    {search}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <div className="content">
                    <section className="categories" aria-label="Categorías">
                        <div className="category-list">
                            {categories.map((category) => (
                                <CategoryCard key={category.label} {...category} />
                            ))}
                        </div>
                    </section>

                    <section className="professionals">
                        <div className="section-heading">
                            <div>
                                <h2>Profesionales cercanos</h2>
                                <p>Expertos verificados, listos para ayudarte.</p>
                            </div>
                            <button className="more-link" type="button">
                                Ver más <span aria-hidden="true">›</span>
                            </button>
                        </div>

                        <div className="filters" aria-label="Filtros de profesionales">
                            <button className="active" type="button">
                                <Icon name="location" />
                                Cerca
                            </button>
                            <button type="button">
                                <Icon name="money" />
                                Precio
                            </button>
                            <button type="button">
                                <Icon name="calendar" />
                                Disponibilidad
                            </button>
                            <button type="button">
                                <Icon name="star" />
                                Calificación
                            </button>
                        </div>

                        <div className="professional-grid">
                            {professionals.map((professional) => (
                                <ProfessionalCard
                                    key={professional.id}
                                    professional={professional}
                                />
                            ))}
                        </div>

                        <div className="verified">
                            <span aria-hidden="true">✓</span>
                            <div>
                                <strong>Profesionales verificados</strong>
                                <p>Tu tranquilidad es lo más importante.</p>
                            </div>
                            <button type="button">Conocé más ›</button>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    )
}

export default Home
