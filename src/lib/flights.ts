/**
 * Flight-number → route lookup via the free, keyless adsbdb.com API.
 *
 * The route database is community-maintained from ADS-B callsign data, not an
 * airline schedule feed: multi-segment flight numbers resolve to a single
 * segment and there are no dates or times — results are a prefill the user
 * confirms, not ground truth. Airport timezones come from a bundled
 * IATA → IANA map (generated from github.com/mwgg/Airports), lazy-loaded so
 * it never weighs down the initial page.
 */

export interface FlightAirport {
  iata: string
  name: string
  city: string
  /** IANA zone, null when the airport is missing from the bundled map */
  zone: string | null
}

export interface FlightRoute {
  flightNumber: string
  airline: string
  origin: FlightAirport
  destination: FlightAirport
}

export type FlightLookupResult =
  | { status: 'found'; route: FlightRoute }
  | { status: 'unknown' }
  | { status: 'error' }

let tzMapPromise: Promise<Record<string, string>> | null = null

function airportTzMap(): Promise<Record<string, string>> {
  tzMapPromise ??= import('./airport-tz.json').then(
    (mod) => mod.default as Record<string, string>,
  )
  return tzMapPromise
}

/** "ba 15" → "BA15"; returns null when it doesn't look like a flight number. */
export function normalizeFlightNumber(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(compact) && /\d/.test(compact)
    ? compact
    : null
}

interface AdsbdbAirport {
  iata_code: string
  name: string
  municipality: string
}

export async function lookupFlight(input: string): Promise<FlightLookupResult> {
  const flightNumber = normalizeFlightNumber(input)
  if (!flightNumber) return { status: 'unknown' }

  try {
    const [response, tzMap] = await Promise.all([
      fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(flightNumber)}`),
      airportTzMap(),
    ])
    if (!response.ok) {
      return response.status === 404 ? { status: 'unknown' } : { status: 'error' }
    }
    const data = await response.json()
    const route = data?.response?.flightroute
    if (!route?.origin?.iata_code || !route?.destination?.iata_code) {
      return { status: 'unknown' }
    }
    const toAirport = (a: AdsbdbAirport): FlightAirport => ({
      iata: a.iata_code,
      name: a.name,
      city: a.municipality,
      zone: tzMap[a.iata_code] ?? null,
    })
    return {
      status: 'found',
      route: {
        flightNumber: route.callsign_iata || flightNumber,
        airline: route.airline?.name ?? '',
        origin: toAirport(route.origin),
        destination: toAirport(route.destination),
      },
    }
  } catch {
    return { status: 'error' }
  }
}
