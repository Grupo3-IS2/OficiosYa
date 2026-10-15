import { useEffect, useState } from 'react'
import Icon from '../../components/Icon/Icon'
import { parseTerms, type Terms } from './termsText'
import './TermsPage.css'

/** The text lives in public/terminos.txt, so it can be changed without touching the code. */
const TERMS_URL = '/terminos.txt'

type State = { status: 'loading' } | { status: 'loaded'; terms: Terms } | { status: 'error' }

export default function TermsPage() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let active = true
    // Always asks again: an edited file shows up without having to clear the cache.
    fetch(TERMS_URL, { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(String(response.status))
        return response.text()
      })
      .then(text => { if (active) setState({ status: 'loaded', terms: parseTerms(text) }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (state.status === 'loaded' && state.terms.title) document.title = `${state.terms.title} · OficiosYa`
  }, [state])

  return (
    <main className="terms-page">
      <header className="terms-header">
        <a className="terms-brand" href="/" aria-label="OficiosYa inicio">
          <span><Icon name="wrench" /></span>
          <strong>Oficios</strong>
          <b>Ya</b>
        </a>
        <a className="terms-back" href="/">
          <Icon name="home" />
          Volver al inicio
        </a>
      </header>

      <article className="terms-card" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <output>Cargando términos y condiciones...</output>}
        {state.status === 'error' && <p role="alert">No pudimos cargar los términos y condiciones. Intentá de nuevo más tarde.</p>}
        {state.status === 'loaded' && (
          <>
            <h1>{state.terms.title || 'Términos y condiciones'}</h1>
            {state.terms.subtitle && <p className="terms-updated">{state.terms.subtitle}</p>}
            {state.terms.blocks.map((block, index) => block.kind === 'heading'
              ? <h2 key={index}>{block.text}</h2>
              : <p key={index}>{block.text}</p>)}
          </>
        )}
      </article>
    </main>
  )
}
