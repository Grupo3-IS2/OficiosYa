import { useCallback, useEffect, useRef, useState } from 'react'
import { searchProfessionals } from '../../services/professionalService'
import { onRatingChange } from '../../services/ratingEvents'
import type { ProfessionalSearch } from './professionalSearch'
import type { Professional } from '../../types/Professional'

/** How many professionals each page brings: the first screenful, and a bit more on every scroll. */
export const PAGE_SIZE = 12

interface Results {
    professionals: Professional[]
    loadedPages: number
    totalPages: number
    totalElements: number
}

const NOTHING: Results = { professionals: [], loadedPages: 0, totalPages: 0, totalElements: 0 }

/**
 * The professionals that match the search, a page at a time: the first one whenever the search changes,
 * the next ones when `loadMore` is called (on scroll). An answer for a search that already changed is
 * dropped, so a slow page never mixes into the new results.
 */
export function useProfessionalSearch(search: ProfessionalSearch) {
    // The search as a value: a new object with the same content is not a new search.
    const key = JSON.stringify(search)
    const [results, setResults] = useState<Results>(NOTHING)
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [loadingMore, setLoadingMore] = useState(false)
    const [moreFailed, setMoreFailed] = useState(false)
    // Which search the answers belong to.
    const generation = useRef(0)
    const [ratingRevision, setRatingRevision] = useState(0)
    useEffect(() => onRatingChange(() => setRatingRevision(value => value + 1)), [])

    useEffect(() => {
        const current = ++generation.current
        setStatus('loading')
        setResults(NOTHING)
        setLoadingMore(false)
        setMoreFailed(false)
        searchProfessionals(JSON.parse(key) as ProfessionalSearch, 0, PAGE_SIZE)
            .then(page => {
                if (generation.current !== current) return
                setResults({ professionals: page.content, loadedPages: 1, totalPages: page.totalPages, totalElements: page.totalElements })
                setStatus('ready')
            })
            .catch(() => { if (generation.current === current) setStatus('error') })
        return () => { generation.current = current + 1 }
    }, [key, ratingRevision])

    const hasMore = status === 'ready' && results.loadedPages < results.totalPages

    const loadMore = useCallback(() => {
        if (!hasMore || loadingMore) return
        const current = generation.current
        setLoadingMore(true)
        setMoreFailed(false)
        searchProfessionals(JSON.parse(key) as ProfessionalSearch, results.loadedPages, PAGE_SIZE)
            .then(page => {
                if (generation.current !== current) return
                setResults(previous => {
                    // Someone published meanwhile can shift a professional into the next page too.
                    const seen = new Set(previous.professionals.map(professional => professional.id))
                    return {
                        professionals: [...previous.professionals, ...page.content.filter(professional => !seen.has(professional.id))],
                        loadedPages: previous.loadedPages + 1,
                        totalPages: page.totalPages,
                        totalElements: page.totalElements,
                    }
                })
            })
            .catch(() => { if (generation.current === current) setMoreFailed(true) })
            .finally(() => { if (generation.current === current) setLoadingMore(false) })
    }, [hasMore, loadingMore, key, results.loadedPages])

    return { professionals: results.professionals, total: results.totalElements, status, hasMore, loadingMore, moreFailed, loadMore }
}
