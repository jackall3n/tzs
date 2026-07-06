export interface ZoneInfo {
  id: string
  city: string
  region: string
  search: string
}

/** Extra search terms for popular zones so "nyc", "eastern", etc. match. */
const ALIASES: Record<string, string> = {
  'America/New_York': 'nyc eastern est edt us united states',
  'America/Chicago': 'central cst cdt us united states',
  'America/Denver': 'mountain mst mdt us united states',
  'America/Los_Angeles': 'pacific pst pdt la san francisco sf seattle us united states',
  'America/Anchorage': 'alaska us united states',
  'Pacific/Honolulu': 'hawaii us united states',
  'America/Phoenix': 'arizona us united states',
  'America/Toronto': 'canada eastern',
  'America/Vancouver': 'canada pacific',
  'America/Mexico_City': 'mexico cdmx',
  'America/Sao_Paulo': 'brazil brasil',
  'America/Argentina/Buenos_Aires': 'argentina',
  'Europe/London': 'uk united kingdom england britain gmt bst',
  'Europe/Paris': 'france cet cest',
  'Europe/Berlin': 'germany cet cest',
  'Europe/Madrid': 'spain',
  'Europe/Rome': 'italy',
  'Europe/Amsterdam': 'netherlands holland',
  'Europe/Zurich': 'switzerland',
  'Europe/Stockholm': 'sweden',
  'Europe/Dublin': 'ireland',
  'Europe/Lisbon': 'portugal',
  'Europe/Athens': 'greece',
  'Europe/Istanbul': 'turkey türkiye',
  'Europe/Moscow': 'russia',
  'Europe/Kyiv': 'ukraine kiev',
  'Europe/Warsaw': 'poland',
  'Africa/Cairo': 'egypt',
  'Africa/Lagos': 'nigeria',
  'Africa/Nairobi': 'kenya',
  'Africa/Johannesburg': 'south africa',
  'Asia/Dubai': 'uae emirates gulf gst',
  'Asia/Riyadh': 'saudi arabia',
  'Asia/Jerusalem': 'israel tel aviv',
  'Asia/Tehran': 'iran',
  'Asia/Karachi': 'pakistan',
  'Asia/Kolkata': 'india mumbai delhi bangalore bengaluru ist calcutta',
  'Asia/Dhaka': 'bangladesh',
  'Asia/Bangkok': 'thailand vietnam hanoi',
  'Asia/Jakarta': 'indonesia',
  'Asia/Singapore': 'sgt',
  'Asia/Hong_Kong': 'hkt',
  'Asia/Shanghai': 'china beijing cst',
  'Asia/Taipei': 'taiwan',
  'Asia/Seoul': 'korea kst',
  'Asia/Tokyo': 'japan jst',
  'Asia/Manila': 'philippines',
  'Australia/Sydney': 'aest aedt nsw',
  'Australia/Melbourne': 'victoria',
  'Australia/Brisbane': 'queensland',
  'Australia/Perth': 'western australia',
  'Pacific/Auckland': 'new zealand nz nzst nzdt',
  UTC: 'utc gmt universal coordinated zulu',
}

let cache: ZoneInfo[] | null = null

export function allZones(): ZoneInfo[] {
  if (cache) return cache
  const ids = Intl.supportedValuesOf('timeZone')
  const zones: ZoneInfo[] = []
  for (const id of ids) {
    if (id.startsWith('Etc/')) continue
    const slash = id.indexOf('/')
    const city =
      slash === -1
        ? id
        : id.slice(id.lastIndexOf('/') + 1).replace(/_/g, ' ')
    const region = slash === -1 ? '' : id.slice(0, slash).replace(/_/g, ' ')
    zones.push({
      id,
      city,
      region,
      search: `${city} ${region} ${id} ${ALIASES[id] ?? ''}`.toLowerCase(),
    })
  }
  if (!zones.some((z) => z.id === 'UTC')) {
    zones.push({ id: 'UTC', city: 'UTC', region: '', search: ALIASES.UTC })
  }
  zones.sort((a, b) => a.city.localeCompare(b.city))
  cache = zones
  return zones
}

export function zoneCity(id: string): string {
  if (!id.includes('/')) return id
  return id.slice(id.lastIndexOf('/') + 1).replace(/_/g, ' ')
}

export function searchZones(query: string, limit = 50): ZoneInfo[] {
  const q = query.trim().toLowerCase()
  const zones = allZones()
  if (!q) return zones.slice(0, limit)
  const words = q.split(/\s+/)
  const scored: Array<{ zone: ZoneInfo; score: number }> = []
  for (const zone of zones) {
    if (!words.every((w) => zone.search.includes(w))) continue
    const city = zone.city.toLowerCase()
    const score = city === q ? 0 : city.startsWith(q) ? 1 : city.includes(q) ? 2 : 3
    scored.push({ zone, score })
  }
  scored.sort((a, b) => a.score - b.score || a.zone.city.localeCompare(b.zone.city))
  return scored.slice(0, limit).map((s) => s.zone)
}

export const DEFAULT_ZONES = [
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo',
]
