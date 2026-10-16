import { useRef, useState, type SubmitEvent } from 'react'
import Button from '../../../components/Button/Button'
import Icon from '../../../components/Icon/Icon'
import './SearchBar.css'

interface SearchBarProps {
    appliedQuery: string
    onSearch: (query: string) => void
}

function SearchBar({ appliedQuery, onSearch }: SearchBarProps) {
    const [query, setQuery] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()
        onSearch(query.trim())
    }

    const clearSearch = () => {
        setQuery('')
        onSearch('')
        inputRef.current?.focus()
    }

    return (
        <form className="search-bar" onSubmit={handleSubmit}>
            <Icon className="search-bar__icon" name="search" />
            <input
                className="search-bar__input"
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre"
                aria-label="Buscar un profesional por nombre"
            />
            <div className="search-bar__actions">
                {appliedQuery && <Button
                    className="search-bar__button search-bar__button--clear search-bar__action"
                    type="button"
                    onClick={clearSearch}
                    aria-label="Borrar filtro de nombre"
                >
                    <svg className="search-bar__clear" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </Button>}
                <Button className="search-bar__button" type="submit" aria-label="Buscar">
                    <Icon name="search" />
                </Button>
            </div>
        </form>
    )
}

export default SearchBar
