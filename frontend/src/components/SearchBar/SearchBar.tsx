import { useState, type FormEvent } from 'react'
import Button from '../Button/Button'
import Icon from '../Icon/Icon'
import './SearchBar.css'

function SearchBar() {
    const [query, setQuery] = useState('')

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
    }

    return (
        <form className="search-bar" onSubmit={handleSubmit}>
            <Icon className="search-bar__icon" name="search" />
            <input
                className="search-bar__input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="¿Qué necesitás resolver hoy?"
                aria-label="Buscar un oficio"
            />
            <Button className="search-bar__button" type="submit">
                Buscar
            </Button>
        </form>
    )
}

export default SearchBar
