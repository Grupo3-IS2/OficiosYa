import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    createZoneCache,
    embedUrl,
    largerMapUrl,
    lookupZone,
    parseSuggestions,
    parsePlace,
    parseReverse,
    placeLabel,
    lookupBestZone,
    reverseUrl,
    reverseZone,
    reverseZoomFor,
    searchUrl,
    suggestUrl,
    suggestZones,
    type ZonePlace,
} from '../src/services/zoneMap.ts'

const montevideo = [{
    lat: '-34.9059039',
    lon: '-56.1913569',
    // Nominatim: south, north, west, east
    boundingbox: ['-34.9400', '-34.7000', '-56.4300', '-56.0200'],
}]

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

test('the search asks Nominatim for one result in Uruguay, in Spanish', () => {
    const url = new URL(searchUrl('Cordón, Montevideo'))

    assert.equal(url.origin + url.pathname, 'https://nominatim.openstreetmap.org/search')
    assert.equal(url.searchParams.get('q'), 'Cordón, Montevideo')
    assert.equal(url.searchParams.get('limit'), '1')
    assert.equal(url.searchParams.get('countrycodes'), 'uy')
    assert.equal(url.searchParams.get('accept-language'), 'es')
    assert.equal(url.searchParams.get('format'), 'jsonv2')
})

test('a result becomes a place, with the box in west, south, east, north order', () => {
    const place = parsePlace(montevideo)

    assert.ok(place)
    assert.equal(place.lat, -34.9059039)
    assert.equal(place.lon, -56.1913569)
    assert.deepEqual(place.bbox, [-56.43, -34.94, -56.02, -34.7])
})

test('nothing found, or a result that can not be used, gives no place', () => {
    assert.equal(parsePlace([]), null)
    assert.equal(parsePlace(null), null)
    assert.equal(parsePlace({ lat: '1', lon: '2' }), null)
    assert.equal(parsePlace([{ lat: 'x', lon: '2' }]), null)
    assert.equal(parsePlace([{ lat: '-34.9' }]), null)
})

test('a point without a box, or a tiny one, is widened so the map shows the area and not a doorway', () => {
    const point = parsePlace([{ lat: '-34.9', lon: '-56.2' }])
    assert.ok(point)
    const [west, south, east, north] = point.bbox
    assert.ok(Math.abs(east - west - 0.004) < 1e-9)
    assert.ok(Math.abs(north - south - 0.004) < 1e-9)
    assert.ok(west < -56.2 && east > -56.2 && south < -34.9 && north > -34.9)

    const tiny = parsePlace([{ lat: '-34.9', lon: '-56.2', boundingbox: ['-34.9001', '-34.9', '-56.2001', '-56.2'] }])
    assert.ok(tiny)
    assert.ok(tiny.bbox[2] - tiny.bbox[0] >= 0.004 - 1e-9)
})

test('the map address puts the box and the marker in the query', () => {
    const place = parsePlace(montevideo) as ZonePlace

    const url = new URL(embedUrl(place))

    assert.equal(url.origin + url.pathname, 'https://www.openstreetmap.org/export/embed.html')
    assert.equal(url.searchParams.get('bbox'), '-56.43,-34.94,-56.02,-34.7')
    assert.equal(url.searchParams.get('marker'), '-34.905904,-56.191357')
    assert.equal(url.searchParams.get('layer'), 'mapnik')
})

test('the link to the bigger map points at the same place', () => {
    const place = parsePlace(montevideo) as ZonePlace

    const url = largerMapUrl(place)

    assert.ok(url.startsWith('https://www.openstreetmap.org/?mlat=-34.905904&mlon=-56.191357'))
    assert.ok(url.endsWith('#map=14/-34.905904/-56.191357'))
})

test('a zone is looked up once: the second time it comes from the cache', async () => {
    let calls = 0
    const fetchFn = (async () => { calls++; return jsonResponse(montevideo) }) as typeof fetch
    const cache = createZoneCache()

    const first = await lookupZone('Montevideo', { fetchFn, cache })
    const second = await lookupZone('  montevideo ', { fetchFn, cache })

    assert.equal(calls, 1)
    assert.deepEqual(second, first)
})

test('two lookups of the same zone at once send a single search', async () => {
    let calls = 0
    const fetchFn = (async () => { calls++; return jsonResponse(montevideo) }) as typeof fetch
    const cache = createZoneCache()

    // What React does in development: the effect runs, is cleaned up and runs again.
    const [first, second] = await Promise.all([
        lookupZone('Montevideo', { fetchFn, cache }),
        lookupZone('Montevideo', { fetchFn, cache }),
    ])

    assert.equal(calls, 1)
    assert.deepEqual(second, first)
})

test('what was found is kept in storage for the next visit', async () => {
    const stored = new Map<string, string>()
    const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value) } }
    const fetchFn = (async () => jsonResponse(montevideo)) as typeof fetch

    await lookupZone('Montevideo', { fetchFn, cache: createZoneCache(storage) })

    let calls = 0
    const noNetwork = (async () => { calls++; return jsonResponse([]) }) as typeof fetch
    const later = await lookupZone('Montevideo', { fetchFn: noNetwork, cache: createZoneCache(storage) })

    assert.equal(calls, 0)
    assert.equal(later?.lat, -34.9059039)
})

test('a zone that is not found is remembered for the page, but not written to storage', async () => {
    const written: string[] = []
    const storage = { getItem: () => null, setItem: (key: string) => { written.push(key) } }
    let calls = 0
    const fetchFn = (async () => { calls++; return jsonResponse([]) }) as typeof fetch
    const cache = createZoneCache(storage)

    assert.equal(await lookupZone('Zona inventada', { fetchFn, cache }), null)
    assert.equal(await lookupZone('Zona inventada', { fetchFn, cache }), null)

    assert.equal(calls, 1)
    assert.deepEqual(written, [])
})

test('a failed search throws and is not taken for "not found"', async () => {
    const cache = createZoneCache()
    const refused = (async () => jsonResponse({}, 429)) as typeof fetch

    await assert.rejects(lookupZone('Montevideo', { fetchFn: refused, cache }), /429/)

    // Nothing was remembered: the next try asks again.
    let calls = 0
    const works = (async () => { calls++; return jsonResponse(montevideo) }) as typeof fetch
    assert.ok(await lookupZone('Montevideo', { fetchFn: works, cache }))
    assert.equal(calls, 1)
})

test('an empty zone is not searched', async () => {
    let calls = 0
    const fetchFn = (async () => { calls++; return jsonResponse(montevideo) }) as typeof fetch

    assert.equal(await lookupZone('   ', { fetchFn }), null)
    assert.equal(calls, 0)
})

test('a storage that throws only costs the persistence', async () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    const fetchFn = (async () => jsonResponse(montevideo)) as typeof fetch

    const place = await lookupZone('Montevideo', { fetchFn, cache: createZoneCache(broken) })

    assert.ok(place)
})

const cordon = {
    lat: '-34.9016', lon: '-56.1779',
    boundingbox: ['-34.9100', '-34.8950', '-56.1900', '-56.1650'],
    display_name: 'Cordón, Montevideo, Municipio B, Departamento de Montevideo, 11200, Uruguay',
    address: { suburb: 'Cordón', city: 'Montevideo', municipality: 'Municipio B', state: 'Departamento de Montevideo', country_code: 'uy' },
}
const pando = {
    lat: '-34.7167', lon: '-55.9583',
    display_name: 'Pando, Canelones, Uruguay',
    address: { city: 'Pando', state: 'Canelones', country_code: 'uy' },
}

test('the short name is what people write: neighbourhood, city, and the department only if it adds something', () => {
    assert.equal(placeLabel(cordon.address), 'Cordón, Montevideo')
    assert.equal(placeLabel(pando.address), 'Pando, Canelones')
    // A city that is also its department is not said twice.
    assert.equal(placeLabel({ city: 'Salto', state: 'Salto' }), 'Salto')
    assert.equal(placeLabel({ town: 'Dolores', state: 'Departamento de Soriano' }), 'Dolores, Soriano')
})

test('without an address, the name comes from the first parts of the long one', () => {
    assert.equal(placeLabel(undefined, 'Punta del Este, Maldonado, 20100, Uruguay'), 'Punta del Este, Maldonado')
    assert.equal(placeLabel({}, 'Rocha, Uruguay'), 'Rocha, Uruguay')
    assert.equal(placeLabel(undefined, undefined), '')
})

// Photon's answers: a GeoJSON collection, coordinates as [lon, lat], extent as [west, north, east, south].
const feature = (properties: Record<string, unknown>, coordinates = [-56.1779, -34.9016]) =>
    ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { countrycode: 'UY', ...properties } })

const photonCordon = feature({ name: 'Cordón', type: 'other', osm_key: 'place', city: 'Montevideo', state: 'Montevideo', extent: [-56.19, -34.895, -56.165, -34.91] })
const photonPando = feature({ name: 'Pando', type: 'city', osm_key: 'place', state: 'Canelones' }, [-55.9583, -34.7167])
const photonStreet = feature({ type: 'house', osm_key: 'place', street: 'Avenida 18 de Julio', housenumber: '1234', district: 'Centro', city: 'Montevideo', state: 'Montevideo' }, [-56.1894, -34.9059])
const collection = (...features: unknown[]) => ({ type: 'FeatureCollection', features })

test('the suggestions are places to choose from, with the name to keep and the long one to tell them apart', () => {
    const choices = parseSuggestions(collection(photonCordon, photonPando))

    assert.equal(choices.length, 2)
    assert.equal(choices[0].label, 'Cordón, Montevideo')
    assert.equal(choices[0].details, 'Cordón, Montevideo')
    assert.deepEqual(choices[0].bbox, [-56.19, -34.91, -56.165, -34.895])
    assert.equal(choices[1].label, 'Pando, Canelones')
})

test('an address is suggested with its street and number in the name, and a street by its name', () => {
    const [address] = parseSuggestions(collection(photonStreet))
    assert.equal(address.label, 'Avenida 18 de Julio 1234, Centro, Montevideo')
    assert.equal(address.details, 'Avenida 18 de Julio 1234, Centro, Montevideo')
    // Without an extent it is a point: the map still gets a box around it.
    assert.ok(address.bbox[2] - address.bbox[0] >= 0.004)

    const [avenue] = parseSuggestions(collection(feature({ name: 'Bulevar General Artigas', type: 'street', osm_key: 'highway', district: 'Jacinto Vera', city: 'Montevideo', state: 'Montevideo' })))
    assert.equal(avenue.label, 'Bulevar General Artigas, Jacinto Vera, Montevideo')
})

test('what is not a zone is not suggested: other countries, shops, no coordinates, no name', () => {
    const abroad = feature({ ...photonStreet.properties, countrycode: 'AR', city: 'Lanús' })
    const shop = feature({ name: 'Cordón Carnes', type: 'house', osm_key: 'shop', street: 'Requena', housenumber: '1504', city: 'Montevideo' })
    const otherThing = feature({ name: 'Algo', type: 'other', osm_key: 'amenity', city: 'Montevideo' })
    const noPoint = { type: 'Feature', properties: { countrycode: 'UY', name: 'Nada' } }
    const noName = feature({ type: 'other', osm_key: 'place' })

    assert.deepEqual(parseSuggestions(collection(abroad, shop, otherThing, noPoint, noName)), [])
    assert.deepEqual(parseSuggestions(null), [])
    assert.deepEqual(parseSuggestions({}), [])
})

test('two suggestions that would be saved under the same name are offered once, and no more than five', () => {
    const twin = feature({ ...photonStreet.properties }, [-56.1895, -34.9060])
    assert.deepEqual(parseSuggestions(collection(photonStreet, twin, photonCordon)).map(choice => choice.label), ['Avenida 18 de Julio 1234, Centro, Montevideo', 'Cordón, Montevideo'])

    const many = Array.from({ length: 9 }, (_, index) => feature({ name: `Barrio ${index}`, type: 'district', osm_key: 'place', city: 'Montevideo' }))
    assert.equal(parseSuggestions(collection(...many)).length, 5)
})

test('what is at a point of the map is a zone only if it is in Uruguay', () => {
    assert.equal(parseReverse(cordon)?.label, 'Cordón, Montevideo')
    assert.equal(parseReverse({ ...cordon, address: { ...cordon.address, country_code: 'ar' } }), null)
    assert.equal(parseReverse({ error: 'Unable to geocode' }), null)
    assert.equal(parseReverse(null), null)
})

test('the searches say what they need: suggestions from Photon looking in Uruguay; the reverse at neighbourhood level', () => {
    const search = new URL(suggestUrl('Cordón'))
    assert.equal(search.origin, 'https://photon.komoot.io')
    assert.equal(search.searchParams.get('q'), 'Cordón')
    assert.equal(search.searchParams.get('bbox'), '-58.45,-35.0,-53.0,-30.0')

    const reverse = new URL(reverseUrl(-34.9016123456, -56.1779))
    assert.equal(reverse.pathname, '/reverse')
    assert.equal(reverse.searchParams.get('lat'), '-34.901612')
    assert.equal(reverse.searchParams.get('zoom'), '14')
    assert.equal(reverse.searchParams.get('addressdetails'), '1')
})

test('suggesting for what is written returns its choices, and nothing is asked for an empty text', async () => {
    const urls: string[] = []
    const fetchFn = (async (url: string) => { urls.push(url); return jsonResponse(collection(photonCordon)) }) as unknown as typeof fetch

    assert.equal((await suggestZones('  Cordón ', { fetchFn })).length, 1)
    assert.deepEqual(await suggestZones('   ', { fetchFn }), [])
    assert.equal(urls.length, 1)
    assert.match(urls[0], /q=Cord%C3%B3n/)
})

test('the same text is not asked twice, and a search can be cancelled', async () => {
    let asked = 0
    const fetchFn = (async () => { asked++; return jsonResponse(collection(photonPando)) }) as unknown as typeof fetch

    await suggestZones('Pando repetido', { fetchFn })
    await suggestZones('pando   REPETIDO', { fetchFn })
    assert.equal(asked, 1)

    const cancelled = new AbortController()
    const slow = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch
    const pending = suggestZones('Algo cancelado', { fetchFn: slow, signal: cancelled.signal })
    cancelled.abort()
    await assert.rejects(pending, /abort/i)
})

test('a search or a reverse that fails throws, it is not taken for "nothing there"', async () => {
    const refused = (async () => jsonResponse({}, 429)) as typeof fetch

    await assert.rejects(suggestZones('Cordón sin servicio', { fetchFn: refused }), /429/)
    await assert.rejects(reverseZone(-34.9, -56.2, { fetchFn: refused }), /429/)
})

test('a point of the map answers with its zone', async () => {
    const fetchFn = (async () => jsonResponse(cordon)) as typeof fetch

    const zone = await reverseZone(-34.9016, -56.1779, { fetchFn })

    assert.equal(zone?.label, 'Cordón, Montevideo')
})

const street = {
    lat: '-34.9045', lon: '-56.1880',
    display_name: '1234, Avenida 18 de Julio, Cordón, Montevideo, Municipio B, 11200, Uruguay',
    address: { house_number: '1234', road: 'Avenida 18 de Julio', suburb: 'Cordón', city: 'Montevideo', state: 'Departamento de Montevideo', country_code: 'uy' },
}

test('a precise place is named with its street and number, before the neighbourhood', () => {
    assert.equal(placeLabel(street.address), 'Avenida 18 de Julio 1234, Cordón, Montevideo')
    // A street without a number, and a number without a street.
    assert.equal(placeLabel({ road: 'Bulevar Artigas', suburb: 'Parque Batlle', city: 'Montevideo', state: 'Montevideo' }), 'Bulevar Artigas, Parque Batlle, Montevideo')
    assert.equal(placeLabel({ house_number: '12', suburb: 'Cordón', city: 'Montevideo' }), 'Cordón, Montevideo')
    // OpenStreetMap lists every number of a building together: keep the first.
    assert.equal(placeLabel({ ...street.address, house_number: '1234,1236;1240' }), 'Avenida 18 de Julio 1234, Cordón, Montevideo')
    // Pedestrian streets and the like also count as a street.
    assert.equal(placeLabel({ pedestrian: 'Sarandí', city: 'Montevideo', state: 'Montevideo' }), 'Sarandí, Montevideo')
})

test('the closer the map looks, the more precise the name asked for a point', () => {
    assert.equal(reverseZoomFor(6), 14)
    assert.equal(reverseZoomFor(12), 14)
    assert.equal(reverseZoomFor(13), 16)
    assert.equal(reverseZoomFor(15), 16)
    assert.equal(reverseZoomFor(16), 18)
    assert.equal(reverseZoomFor(19), 18)
})

test('a point can be asked for at the precision of a building', async () => {
    assert.equal(new URL(reverseUrl(-34.9, -56.2)).searchParams.get('zoom'), '14')
    assert.equal(new URL(reverseUrl(-34.9, -56.2, 18)).searchParams.get('zoom'), '18')

    let asked = ''
    const fetchFn = (async (url: string) => { asked = url; return jsonResponse(street) }) as unknown as typeof fetch
    const zone = await reverseZone(-34.9045, -56.188, { fetchFn, zoom: 18 })

    assert.equal(new URL(asked).searchParams.get('zoom'), '18')
    assert.equal(zone?.label, 'Avenida 18 de Julio 1234, Cordón, Montevideo')
})

test('a saved street that OpenStreetMap does not know falls back to the neighbourhood', async () => {
    const asked: string[] = []
    const fetchFn = (async (url: string) => {
        const q = new URL(url).searchParams.get('q')!
        asked.push(q)
        // Only the neighbourhood and the city are known.
        return jsonResponse(q === 'Calle Inventada 99, Cordón, Montevideo' ? [] : montevideo)
    }) as unknown as typeof fetch

    const place = await lookupBestZone('Calle Inventada 99, Cordón, Montevideo', { fetchFn, pauseMs: 0 })

    assert.ok(place)
    assert.deepEqual(asked, ['Calle Inventada 99, Cordón, Montevideo', 'Cordón, Montevideo'])
})

test('a name that is found is not searched again with less', async () => {
    let calls = 0
    const fetchFn = (async () => { calls++; return jsonResponse(montevideo) }) as typeof fetch

    assert.ok(await lookupBestZone('Cordón, Montevideo', { fetchFn, pauseMs: 0 }))

    assert.equal(calls, 1)
})

test('when nothing is found it stops after three attempts, and reports not found', async () => {
    let calls = 0
    const fetchFn = (async () => { calls++; return jsonResponse([]) }) as typeof fetch

    assert.equal(await lookupBestZone('a, b, c, d, e', { fetchFn, pauseMs: 0 }), null)

    assert.equal(calls, 3)
})

test('a failed search is not turned into "try with less": it throws', async () => {
    const refused = (async () => jsonResponse({}, 429)) as typeof fetch

    await assert.rejects(lookupBestZone('Calle 1, Cordón, Montevideo', { fetchFn: refused, pauseMs: 0 }), /429/)
})
