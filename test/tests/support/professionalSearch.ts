import type { Page } from '@playwright/test';

/**
 * The professional search, as a mock that answers like the backend: it filters, orders and pages by the
 * same parameters (see ProfessionalRepository.search), so the Home tests check what the page asks for
 * and shows, without depending on what the real database holds. Also answers the price range.
 */

interface MockTrade { tradeId: number; minimumHourlyWage: number; maximumHourlyWage: number }
interface MockProfessional { id: string; name: string; workingLocation: string; rating: number | null; expertiseTrades: MockTrade[] }
export interface MockSchedule { professionalId: string; type: string; startTimestamp: string; endTimestamp: string }

function search(professionals: MockProfessional[], schedules: MockSchedule[], params: URLSearchParams) {
  const tradeIds = params.getAll('tradeIds').map(Number);
  const number = (name: string) => params.has(name) ? Number(params.get(name)) : null;
  const [minPrice, maxPrice, minRating] = [number('minPrice'), number('maxPrice'), number('minRating')];
  const location = params.get('location')?.toLowerCase();
  const query = params.get('query')?.toLowerCase();
  const from = params.get('availableFrom') ? new Date(params.get('availableFrom')!) : null;
  const to = params.get('availableTo') ? new Date(params.get('availableTo')!) : null;
  const relevant = (professional: MockProfessional) =>
    professional.expertiseTrades.filter(trade => tradeIds.length === 0 || tradeIds.includes(trade.tradeId));

  const matching = professionals.filter(professional =>
    (tradeIds.length === 0 && minPrice === null && maxPrice === null || relevant(professional).some(trade =>
      (minPrice === null || trade.maximumHourlyWage >= minPrice) && (maxPrice === null || trade.minimumHourlyWage <= maxPrice)))
    && (minRating === null || (professional.rating !== null && professional.rating >= minRating))
    && (!location || professional.workingLocation.toLowerCase().includes(location))
    && (!query || professional.name.toLowerCase().includes(query))
    && (!from || !to || schedules.some(schedule => schedule.professionalId === professional.id
      && schedule.type === 'URGENT_AVAILABLE'
      && new Date(schedule.startTimestamp) < to && new Date(schedule.endTimestamp) > from)));

  const lowest = (professional: MockProfessional) => {
    const prices = relevant(professional).map(trade => trade.minimumHourlyWage);
    return prices.length ? Math.min(...prices) : null;
  };
  const lastWhenNull = (a: number | null, b: number | null, direction: 1 | -1) =>
    a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a - b) * direction;
  const order = params.get('order');
  matching.sort((a, b) =>
    (order === 'PRICE_ASC' ? lastWhenNull(lowest(a), lowest(b), 1)
      : order === 'PRICE_DESC' ? lastWhenNull(lowest(a), lowest(b), -1)
        : order === 'RATING_DESC' ? lastWhenNull(a.rating, b.rating, -1) : 0)
    || a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));

  const page = Number(params.get('page') ?? 0);
  const size = Number(params.get('size') ?? 20);
  return {
    content: matching.slice(page * size, (page + 1) * size),
    totalElements: matching.length,
    totalPages: Math.ceil(matching.length / size),
    number: page,
    size
  };
}

function priceRange(professionals: MockProfessional[], params: URLSearchParams) {
  const tradeIds = params.getAll('tradeIds').map(Number);
  const query = params.get('query')?.toLowerCase();
  const trades = professionals
    .filter(professional => !query || professional.name.toLowerCase().includes(query))
    .flatMap(professional => professional.expertiseTrades)
    .filter(trade => tradeIds.length === 0 || tradeIds.includes(trade.tradeId));
  return trades.length
    ? { minimum: Math.min(...trades.map(trade => trade.minimumHourlyWage)), maximum: Math.max(...trades.map(trade => trade.maximumHourlyWage)) }
    : { minimum: null, maximum: null };
}

/** Answers /professionals/search (and its price range) with these professionals; returns every search asked for. */
export async function mockProfessionalSearch(page: Page, professionals: unknown[], schedules: MockSchedule[] = []) {
  const searches: URLSearchParams[] = [];
  const all = professionals as MockProfessional[];
  await page.route((url) => url.pathname.endsWith('/api/v1/professionals/search'), (route) => {
    const params = new URL(route.request().url()).searchParams;
    searches.push(params);
    return route.fulfill({ json: search(all, schedules, params) });
  });
  await page.route((url) => url.pathname.endsWith('/api/v1/professionals/search/price-range'), (route) =>
    route.fulfill({ json: priceRange(all, new URL(route.request().url()).searchParams) }));
  return searches;
}
