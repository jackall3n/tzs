import { offsetMinutes } from './time'

/**
 * Jet lag planning model.
 *
 * The body clock is tracked as an "effective UTC offset" in minutes — the
 * zone your circadian rhythm currently believes it lives in. Each day it
 * shifts toward the local zone at a bounded rate (advancing is harder than
 * delaying), and the daily schedule (sleep, light, caffeine, melatonin) is
 * the habitual body-time routine converted to local wall time. Multi-leg
 * journeys simply keep simulating: a leg starts from wherever the body
 * clock actually got to, not from the previous destination's zone.
 */

export interface SleepSchedule {
  /** Habitual bedtime, minutes after midnight body time (e.g. 23:00 = 1380) */
  bedtime: number
  /** Habitual wake time, minutes after midnight body time */
  wake: number
}

export interface Leg {
  id: string
  zone: string
  /** Arrival date in the destination, YYYY-MM-DD */
  arrival: string
}

export interface Journey {
  origin: string
  legs: Leg[]
  /** Days of gradual pre-shifting at home before the first arrival (0-3) */
  preShiftDays: number
  schedule: SleepSchedule
}

/** A window in local minutes-of-day; may wrap past midnight (start > end). */
export interface TimeWindow {
  start: number
  end: number
}

export type Direction = 'advance' | 'delay' | 'none'

export interface DayPlan {
  date: string
  zone: string
  phase: 'pre' | 'stay'
  legIndex: number
  /** 1-based day number within its phase */
  dayNum: number
  direction: Direction
  /** Signed minutes still to shift after following this day's plan */
  remainingMin: number
  adapted: boolean
  sleep: TimeWindow
  seek: TimeWindow | null
  avoid: TimeWindow | null
  /** Local minutes-of-day for optional low-dose melatonin (advances only) */
  melatonin: number | null
  /** Last local time caffeine is a good idea */
  caffeineCutoff: number
}

export interface LegSummary {
  legIndex: number
  zone: string
  arrival: string
  /** Signed shift this leg requires from the body clock at its start */
  shiftMin: number
  direction: Direction
  daysNeeded: number
  /** Raw clock difference wrapped the "long way", when going the short way
   *  around the clock differs from the naive east/west reading */
  wrapped: boolean
  /** Residual offset vs the previous location when this leg starts (min) */
  residualMin: number
}

export interface Plan {
  days: DayPlan[]
  legs: LegSummary[]
  /** Date the body clock matches the final destination, null if no shift */
  adaptedDate: string | null
}

const DAY_MIN = 1440
const MS_PER_DAY = 86_400_000

/** Body clock can advance ~1h/day (eastward) but delay ~1.5h/day (westward). */
export const ADVANCE_RATE = 60
export const DELAY_RATE = 90
/** Pre-travel shifting at home is gentler. */
const PRE_RATE = 60

/** Considered adapted when within 15 minutes. */
const ADAPTED_THRESHOLD = 15
const MAX_STAY_DAYS = 21
const MAX_FINAL_DAYS = 14

const mod = (n: number, m: number) => ((n % m) + m) % m

/** Wrap a minute difference to the shortest way around the clock. */
export const circadianDiff = (deltaMin: number) =>
  mod(deltaMin + 720, DAY_MIN) - 720

/**
 * Signed shift a leg should commit to: of the two ways around the clock,
 * pick the one that takes fewer days given the asymmetric advance/delay
 * rates — not simply the fewer hours.
 */
export function chooseShift(deltaMin: number): number {
  const short = circadianDiff(deltaMin)
  if (short === 0) return 0
  const long = short - Math.sign(short) * DAY_MIN
  const days = (s: number) => Math.abs(s) / (s > 0 ? ADVANCE_RATE : DELAY_RATE)
  return days(long) < days(short) ? long : short
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n))

function dateToUtcNoon(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}

export function addDays(date: string, n: number): string {
  const dt = new Date(dateToUtcNoon(date) + n * MS_PER_DAY)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function compareDates(a: string, b: string): number {
  return dateToUtcNoon(a) - dateToUtcNoon(b)
}

function zoneOffsetOn(zone: string, date: string): number {
  return offsetMinutes(zone, dateToUtcNoon(date))
}

function makeDay(args: {
  date: string
  zone: string
  phase: 'pre' | 'stay'
  legIndex: number
  dayNum: number
  bodyOffset: number
  /** Shift still needed at the start of this day — drives the day's guidance */
  dayDiff: number
  /** Shift still needed after following this day's plan — the progress badge */
  remaining: number
  schedule: SleepSchedule
}): DayPlan {
  const { date, zone, phase, legIndex, dayNum, bodyOffset, dayDiff, remaining, schedule } =
    args
  const localOffset = zoneOffsetOn(zone, date)
  const toLocal = (bodyMin: number) =>
    mod(bodyMin + localOffset - bodyOffset, DAY_MIN)

  const adapted = Math.abs(dayDiff) < ADAPTED_THRESHOLD
  const direction: Direction = adapted ? 'none' : dayDiff > 0 ? 'advance' : 'delay'

  const sleep: TimeWindow = {
    start: toLocal(schedule.bedtime),
    end: toLocal(schedule.wake),
  }

  // Light windows anchor to the day's (already shifted) sleep window so the
  // advice is actionable while awake: advancing wants light on waking and dim
  // evenings; delaying wants bright evenings and dim mornings.
  let seek: TimeWindow | null = null
  let avoid: TimeWindow | null = null
  let melatonin: number | null = null
  if (direction === 'advance') {
    seek = {
      start: toLocal(schedule.wake),
      end: toLocal(mod(schedule.wake + 180, DAY_MIN)),
    }
    avoid = {
      start: toLocal(mod(schedule.bedtime - 180, DAY_MIN)),
      end: toLocal(schedule.bedtime),
    }
    // Low-dose melatonin ~5h before (body) bedtime aids advances
    melatonin = toLocal(mod(schedule.bedtime - 300, DAY_MIN))
  } else if (direction === 'delay') {
    seek = {
      start: toLocal(mod(schedule.bedtime - 240, DAY_MIN)),
      end: toLocal(schedule.bedtime),
    }
    avoid = {
      start: toLocal(schedule.wake),
      end: toLocal(mod(schedule.wake + 180, DAY_MIN)),
    }
  }

  return {
    date,
    zone,
    phase,
    legIndex,
    dayNum,
    direction,
    remainingMin: remaining,
    adapted,
    sleep,
    seek,
    avoid,
    melatonin,
    caffeineCutoff: mod(sleep.start - 480, DAY_MIN),
  }
}

export function buildPlan(journey: Journey): Plan {
  const { origin, schedule } = journey
  // Ignore incomplete legs; enforce chronological order without reordering
  const legs: Leg[] = []
  for (const leg of journey.legs) {
    if (!leg.zone || !leg.arrival) continue
    const prev = legs[legs.length - 1]
    legs.push(
      prev && compareDates(leg.arrival, prev.arrival) < 0
        ? { ...leg, arrival: prev.arrival }
        : leg,
    )
  }
  if (legs.length === 0) {
    return { days: [], legs: [], adaptedDate: null }
  }

  const days: DayPlan[] = []
  const summaries: LegSummary[] = []
  let bodyOffset = zoneOffsetOn(origin, legs[0].arrival)

  // --- Pre-shift days at home, easing toward the first destination
  const firstTarget = zoneOffsetOn(legs[0].zone, legs[0].arrival)
  const preDays = clamp(journey.preShiftDays, 0, 3)
  let preRemaining = chooseShift(firstTarget - bodyOffset)
  for (let i = preDays; i >= 1; i--) {
    if (Math.abs(preRemaining) < ADAPTED_THRESHOLD) break
    const date = addDays(legs[0].arrival, -i)
    const dayDiff = preRemaining
    const step = clamp(preRemaining, -PRE_RATE, PRE_RATE)
    bodyOffset = mod(bodyOffset + step, DAY_MIN)
    preRemaining -= step
    days.push(
      makeDay({
        date,
        zone: origin,
        phase: 'pre',
        legIndex: 0,
        dayNum: preDays - i + 1,
        bodyOffset,
        dayDiff,
        remaining: preRemaining,
        schedule,
      }),
    )
  }

  // --- Each leg: shift toward local time until the next leg (or adapted)
  let adaptedDate: string | null = null
  for (let k = 0; k < legs.length; k++) {
    const leg = legs[k]
    const target = zoneOffsetOn(leg.zone, leg.arrival)
    const startShift = chooseShift(target - bodyOffset)
    const rate = startShift > 0 ? ADVANCE_RATE : DELAY_RATE
    const prevZone = k === 0 ? origin : legs[k - 1].zone
    const prevOffset = zoneOffsetOn(prevZone, leg.arrival)

    summaries.push({
      legIndex: k,
      zone: leg.zone,
      arrival: leg.arrival,
      shiftMin: startShift,
      direction:
        Math.abs(startShift) < ADAPTED_THRESHOLD
          ? 'none'
          : startShift > 0
            ? 'advance'
            : 'delay',
      daysNeeded: Math.ceil(Math.abs(startShift) / rate),
      // The plan shifts the opposite way to the naive clock reading
      // (e.g. "15h back" on paper, but 9h forward is faster for the body)
      wrapped:
        Math.abs(startShift) >= ADAPTED_THRESHOLD &&
        target - prevOffset !== 0 &&
        Math.sign(startShift) !== Math.sign(target - prevOffset),
      residualMin: circadianDiff(bodyOffset - prevOffset),
    })

    const nextArrival = k + 1 < legs.length ? legs[k + 1].arrival : null
    const maxDays = nextArrival
      ? Math.min(
          Math.round(
            (dateToUtcNoon(nextArrival) - dateToUtcNoon(leg.arrival)) / MS_PER_DAY,
          ),
          MAX_STAY_DAYS,
        )
      : MAX_FINAL_DAYS

    let date = leg.arrival
    let remaining = startShift
    for (let dayNum = 1; dayNum <= maxDays; dayNum++) {
      const dayDiff = remaining
      const wasAdapted = Math.abs(dayDiff) < ADAPTED_THRESHOLD
      const step =
        dayDiff > 0
          ? Math.min(dayDiff, ADVANCE_RATE)
          : Math.max(dayDiff, -DELAY_RATE)
      bodyOffset = mod(bodyOffset + step, DAY_MIN)
      remaining -= step
      days.push(
        makeDay({
          date,
          zone: leg.zone,
          phase: 'stay',
          legIndex: k,
          dayNum,
          bodyOffset,
          dayDiff,
          remaining,
          schedule,
        }),
      )
      if (
        Math.abs(remaining) < ADAPTED_THRESHOLD &&
        !adaptedDate &&
        k === legs.length - 1
      ) {
        adaptedDate = date
      }
      // Render through the last shifting day plus one fully-adapted day
      if (wasAdapted) break
      date = addDays(date, 1)
    }
  }

  return { days, legs: summaries, adaptedDate }
}

/** "5h 30m" style label for a minute count. */
export function formatShift(min: number): string {
  const abs = Math.abs(Math.round(min))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}
