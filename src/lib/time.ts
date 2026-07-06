export interface WallTime {
  year: number
  month: number // 1-12
  day: number
  hour: number // 0-23
  minute: number
  weekday: string // 'Mon'
}

const HOUR = 3_600_000
const MINUTE = 60_000

const dtfCache = new Map<string, Intl.DateTimeFormat>()

function wallFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = dtfCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
    dtfCache.set(timeZone, fmt)
  }
  return fmt
}

/** Wall-clock time in a zone at a given UTC instant. */
export function wallTime(timeZone: string, ts: number): WallTime {
  const parts = wallFormatter(timeZone).formatToParts(new Date(ts))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    // Some engines report midnight as "24"
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: get('weekday'),
  }
}

/** UTC offset of a zone at a given instant, in minutes (east positive). */
export function offsetMinutes(timeZone: string, ts: number): number {
  const parts = wallFormatter(timeZone).formatToParts(new Date(ts))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  return Math.round((asUtc - ts) / MINUTE)
}

/**
 * UTC instant for a wall-clock time in a zone. Converges on the zone offset
 * iteratively so DST transitions resolve to a nearby valid instant.
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  let ts = wallAsUtc
  for (let i = 0; i < 3; i++) {
    const next = wallAsUtc - offsetMinutes(timeZone, ts) * MINUTE
    if (next === ts) break
    ts = next
  }
  return ts
}

/** Short zone name at an instant, e.g. "EST", "GMT+5:30". */
export function zoneAbbreviation(timeZone: string, ts: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(new Date(ts))
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
}

/** "UTC+5:30" / "UTC−8" style label for a zone at an instant. */
export function offsetLabel(timeZone: string, ts: number): string {
  const total = offsetMinutes(timeZone, ts)
  if (total === 0) return 'UTC+0'
  const sign = total < 0 ? '−' : '+'
  const abs = Math.abs(total)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/** Difference between a zone and a reference zone at an instant, e.g. "+5½h". */
export function relativeOffsetLabel(
  timeZone: string,
  homeZone: string,
  ts: number,
): string {
  const diff = offsetMinutes(timeZone, ts) - offsetMinutes(homeZone, ts)
  if (diff === 0) return 'same time'
  const sign = diff < 0 ? '−' : '+'
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const frac = m === 30 ? '½' : m === 45 ? '¾' : m === 15 ? '¼' : ''
  const hours = h === 0 && frac ? '' : String(h)
  return `${sign}${hours}${frac || (m && !frac ? `:${String(m).padStart(2, '0')}` : '')}h`
}

export function formatClock(
  timeZone: string,
  ts: number,
  use24h: boolean,
): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24h,
  })
    .format(new Date(ts))
    .toLowerCase()
    .replace(' ', '')
}

export function formatDate(timeZone: string, ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(ts))
}

/** The 24 hourly instants spanning the home zone's day at `dayOffset` days from today. */
export function hourlyInstants(
  homeZone: string,
  now: number,
  dayOffset: number,
): number[] {
  const today = wallTime(homeZone, now)
  // Shift the calendar date using UTC arithmetic (handles month/year rollover)
  const shifted = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset))
  const midnight = zonedTimeToUtc(
    homeZone,
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  )
  return Array.from({ length: 24 }, (_, h) => midnight + h * HOUR)
}
