import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ZonePicker } from '../components/ZonePicker'
import {
  lookupFlight,
  type FlightLookupResult,
  type FlightRoute,
} from '../lib/flights'
import {
  addDays,
  buildPlan,
  formatShift,
  type DayPlan,
  type Journey,
  type LegSummary,
  type TimeWindow,
} from '../lib/jetlag'
import { wallTime } from '../lib/time'
import { zoneCity } from '../lib/zones'

export const Route = createFileRoute('/jetlag')({
  component: JetLagPlanner,
})

const JOURNEY_KEY = 'tzs:journey'
const FORMAT_KEY = 'tzs:24h'

const pad = (n: number) => String(n).padStart(2, '0')

function fmtMin(min: number, use24h: boolean): string {
  const m = ((min % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (use24h) return `${pad(h)}:${pad(mm)}`
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${mm ? `:${pad(mm)}` : ''}${suffix}`
}

const fmtWindow = (w: TimeWindow, use24h: boolean) =>
  `${fmtMin(w.start, use24h)}–${fmtMin(w.end, use24h)}`

function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)))
}

const minutesToInput = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
const inputToMinutes = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  return Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2]))
}

function todayIn(zone: string): string {
  const w = wallTime(zone, Date.now())
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`
}

function defaultJourney(): Journey {
  let origin = Intl.DateTimeFormat().resolvedOptions().timeZone
  try {
    const zones = JSON.parse(localStorage.getItem('tzs:zones') ?? '[]')
    if (Array.isArray(zones) && typeof zones[0] === 'string') origin = zones[0]
  } catch {
    // fall back to the resolved local zone
  }
  const dest = origin === 'Asia/Tokyo' ? 'America/New_York' : 'Asia/Tokyo'
  return {
    origin,
    legs: [{ id: 'leg-1', zone: dest, arrival: addDays(todayIn(origin), 7) }],
    preShiftDays: 2,
    schedule: { bedtime: 23 * 60, wake: 7 * 60 },
  }
}

// ---------------------------------------------------------------- day bar

type SlotType = 'neutral' | 'avoid' | 'seek' | 'sleep'
const SLOT_COUNT = 96 // 15-minute resolution

const SLOT_STYLES: Record<SlotType, string> = {
  neutral: 'bg-slate-800',
  avoid: 'bg-rose-950',
  seek: 'bg-amber-300',
  sleep: 'bg-indigo-500',
}

function paint(slots: SlotType[], window: TimeWindow | null, type: SlotType) {
  if (!window) return
  const start = Math.round((window.start / 1440) * SLOT_COUNT)
  let end = Math.round((window.end / 1440) * SLOT_COUNT)
  if (end <= start) end += SLOT_COUNT
  for (let i = start; i < end; i++) slots[i % SLOT_COUNT] = type
}

function DayBar({ day }: { day: DayPlan }) {
  const segments = useMemo(() => {
    const slots: SlotType[] = new Array(SLOT_COUNT).fill('neutral')
    paint(slots, day.avoid, 'avoid')
    paint(slots, day.seek, 'seek')
    paint(slots, day.sleep, 'sleep')
    const merged: Array<{ type: SlotType; len: number }> = []
    for (const type of slots) {
      const last = merged[merged.length - 1]
      if (last && last.type === type) last.len++
      else merged.push({ type, len: 1 })
    }
    return merged
  }, [day])

  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-md">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={SLOT_STYLES[seg.type]}
            style={{ width: `${(seg.len / SLOT_COUNT) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] text-slate-600">
        <span>midnight</span>
        <span>6am</span>
        <span>noon</span>
        <span>6pm</span>
        <span className="opacity-0">.</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- day card

function DayCard({ day, use24h }: { day: DayPlan; use24h: boolean }) {
  const title =
    day.phase === 'pre'
      ? `${fmtDate(day.date)} · before you fly`
      : `${fmtDate(day.date)} · day ${day.dayNum} in ${zoneCity(day.zone)}`
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
          {title}
        </h4>
        {day.adapted ? (
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            adjusted ✓
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
            {formatShift(day.remainingMin)} to go
          </span>
        )}
      </div>
      <DayBar day={day} />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
        <span title="Aim to sleep in this window (local time)">
          😴 <span className="text-slate-500">sleep</span>{' '}
          {fmtWindow(day.sleep, use24h)}
        </span>
        {day.seek && (
          <span title="Get bright light — outdoors if possible">
            ☀️ <span className="text-slate-500">light</span>{' '}
            {fmtWindow(day.seek, use24h)}
          </span>
        )}
        {day.avoid && (
          <span title="Keep light dim — sunglasses help">
            🕶️ <span className="text-slate-500">dim</span>{' '}
            {fmtWindow(day.avoid, use24h)}
          </span>
        )}
        <span title="Last call for caffeine">
          ☕ <span className="text-slate-500">until</span>{' '}
          {fmtMin(day.caffeineCutoff, use24h)}
        </span>
        {day.melatonin !== null && (
          <span title="Optional low-dose melatonin — check with your doctor">
            💊 <span className="text-slate-500">melatonin</span>{' '}
            {fmtMin(day.melatonin, use24h)}
          </span>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- leg header

function LegHeader({
  summary,
  originCity,
  prevCity,
}: {
  summary: LegSummary
  originCity: string
  prevCity: string
}) {
  const city = zoneCity(summary.zone)
  const shift = formatShift(summary.shiftMin)
  return (
    <div className="mt-5 mb-2">
      <h3 className="text-base font-bold text-slate-100">
        {summary.legIndex === 0 ? originCity : prevCity} → {city}
        <span className="ml-2 text-xs font-normal text-slate-500">
          arrive {fmtDate(summary.arrival)}
        </span>
      </h3>
      <p className="mt-0.5 text-xs text-slate-400">
        {summary.direction === 'none' ? (
          'No real adjustment needed — your body clock already matches.'
        ) : (
          <>
            Shift your body clock{' '}
            <span className="font-semibold text-slate-200">
              {shift} {summary.direction === 'advance' ? 'earlier' : 'later'}
            </span>{' '}
            · roughly {summary.daysNeeded}{' '}
            {summary.daysNeeded === 1 ? 'day' : 'days'} to adjust
          </>
        )}
      </p>
      {summary.wrapped && (
        <p className="mt-1 rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-300">
          The clock difference looks bigger the other way — shifting{' '}
          {summary.direction === 'advance' ? 'earlier' : 'later'} around the
          clock gets you there in fewer days.
        </p>
      )}
      {summary.legIndex > 0 && Math.abs(summary.residualMin) >= 30 && (
        <p className="mt-1 rounded-lg bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-300">
          You'll still be about {formatShift(summary.residualMin)} off{' '}
          {prevCity} time when this leg starts — the plan continues from where
          your body clock actually is.
        </p>
      )}
    </div>
  )
}

// -------------------------------------------------------------- main page

function JetLagPlanner() {
  const [mounted, setMounted] = useState(false)
  const [journey, setJourney] = useState<Journey | null>(null)
  const [use24h, setUse24h] = useState(false)
  const [picker, setPicker] = useState<'origin' | string | null>(null)

  useEffect(() => {
    let j: Journey | null = null
    try {
      const stored = localStorage.getItem(JOURNEY_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && Array.isArray(parsed.legs) && parsed.schedule) j = parsed
      }
    } catch {
      // corrupt storage — start fresh
    }
    setJourney(j ?? defaultJourney())
    setUse24h(localStorage.getItem(FORMAT_KEY) === '1')
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && journey) localStorage.setItem(JOURNEY_KEY, JSON.stringify(journey))
  }, [mounted, journey])

  const plan = useMemo(() => (journey ? buildPlan(journey) : null), [journey])

  const update = (patch: Partial<Journey>) =>
    setJourney((j) => (j ? { ...j, ...patch } : j))

  const updateLeg = (id: string, patch: Partial<Journey['legs'][number]>) =>
    setJourney((j) =>
      j
        ? { ...j, legs: j.legs.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
        : j,
    )

  const addLeg = () =>
    setJourney((j) => {
      if (!j) return j
      const last = j.legs[j.legs.length - 1]
      const lastZone = last?.zone ?? j.origin
      return {
        ...j,
        legs: [
          ...j.legs,
          {
            id: `leg-${Date.now()}`,
            // A round trip home is the most common next stop
            zone: lastZone === j.origin ? 'Asia/Singapore' : j.origin,
            arrival: addDays(last?.arrival ?? todayIn(j.origin), 7),
          },
        ],
      }
    })

  const removeLeg = (id: string) =>
    setJourney((j) => (j ? { ...j, legs: j.legs.filter((l) => l.id !== id) } : j))

  // ------------------------------------------------ flight number lookup
  const [flightQuery, setFlightQuery] = useState('')
  const [flightBusy, setFlightBusy] = useState(false)
  const [flightResult, setFlightResult] = useState<FlightLookupResult | null>(null)

  const findFlight = async (e: FormEvent) => {
    e.preventDefault()
    if (!flightQuery.trim() || flightBusy) return
    // Dismiss the on-screen keyboard so it doesn't cover the result card
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    setFlightBusy(true)
    setFlightResult(null)
    setFlightResult(await lookupFlight(flightQuery))
    setFlightBusy(false)
  }

  useEffect(() => {
    if (flightResult) {
      document
        .getElementById('flight-result')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [flightResult])

  const clearFlight = () => {
    setFlightQuery('')
    setFlightResult(null)
  }

  const startTripWithFlight = (route: FlightRoute) => {
    if (!route.origin.zone || !route.destination.zone) return
    const origin = route.origin.zone
    setJourney((j) =>
      j
        ? {
            ...j,
            origin,
            legs: [
              {
                id: `leg-${Date.now()}`,
                zone: route.destination.zone!,
                arrival: addDays(todayIn(origin), 7),
              },
            ],
          }
        : j,
    )
    clearFlight()
  }

  const addFlightAsStop = (route: FlightRoute) => {
    if (!route.destination.zone) return
    setJourney((j) => {
      if (!j) return j
      const last = j.legs[j.legs.length - 1]
      return {
        ...j,
        legs: [
          ...j.legs,
          {
            id: `leg-${Date.now()}`,
            zone: route.destination.zone!,
            arrival: addDays(last?.arrival ?? todayIn(j.origin), 7),
          },
        ],
      }
    })
    clearFlight()
  }

  if (!mounted || !journey || !plan) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-slate-500">
        Loading planner…
      </div>
    )
  }

  const originCity = zoneCity(journey.origin)

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-3">
          <Link
            to="/"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 active:bg-slate-800"
            aria-label="Back to time grid"
          >
            ‹
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-slate-100">
            Jet lag planner
          </h1>
          <button
            onClick={() => {
              setUse24h((v) => {
                localStorage.setItem(FORMAT_KEY, v ? '0' : '1')
                return !v
              })
            }}
            className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 active:bg-slate-800"
          >
            {use24h ? '24h' : '12h'}
          </button>
        </div>
      </header>

      <main className="flex-1 px-3 pb-8">
        {/* ------------------------------------------------ journey inputs */}
        <section className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <h2 className="text-sm font-semibold text-slate-200">Your journey</h2>

          <div className="mt-2 flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-slate-500">From</span>
            <button
              onClick={() => setPicker('origin')}
              className="min-w-0 flex-1 truncate rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-sm text-slate-100 active:bg-slate-700"
            >
              {originCity}
            </button>
          </div>

          {journey.legs.map((leg, i) => (
            <div key={leg.id} className="mt-2 flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-slate-500">
                {i === journey.legs.length - 1 ? 'Then to' : `Stop ${i + 1}`}
              </span>
              <button
                onClick={() => setPicker(leg.id)}
                className="min-w-0 flex-1 truncate rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-sm text-slate-100 active:bg-slate-700"
              >
                {zoneCity(leg.zone)}
              </button>
              <input
                type="date"
                value={leg.arrival}
                min={i === 0 ? undefined : journey.legs[i - 1].arrival}
                onChange={(e) =>
                  e.target.value && updateLeg(leg.id, { arrival: e.target.value })
                }
                aria-label={`Arrival date for ${zoneCity(leg.zone)}`}
                className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-base text-slate-100 [color-scheme:dark]"
              />
              {journey.legs.length > 1 && (
                <button
                  onClick={() => removeLeg(leg.id)}
                  aria-label={`Remove stop ${zoneCity(leg.zone)}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-900 text-rose-400 active:bg-rose-950"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          <button
            onClick={addLeg}
            className="mt-2.5 w-full rounded-lg border border-dashed border-slate-700 py-2 text-sm font-medium text-sky-400 active:bg-slate-800"
          >
            + Add another stop
          </button>

          <form onSubmit={findFlight} className="mt-3 border-t border-slate-800 pt-3">
            <label
              htmlFor="flight-no"
              className="text-xs font-medium text-slate-400"
            >
              ✈️ Or add by flight number
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="flight-no"
                type="text"
                value={flightQuery}
                onChange={(e) => setFlightQuery(e.target.value)}
                placeholder="e.g. BA15"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-base text-slate-100 uppercase placeholder:normal-case placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={flightBusy || !flightQuery.trim()}
                className="shrink-0 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950 active:bg-sky-400 disabled:opacity-40"
              >
                {flightBusy ? 'Finding…' : 'Find'}
              </button>
            </div>

            {flightResult?.status === 'found' &&
              (() => {
                const r = flightResult.route
                const lastZone =
                  journey.legs[journey.legs.length - 1]?.zone ?? journey.origin
                const missingZone = !r.origin.zone || !r.destination.zone
                return (
                  <div
                    id="flight-result"
                    className="mt-2 rounded-lg border border-slate-700 bg-slate-800/60 p-2.5"
                  >
                    <p className="text-xs text-slate-400">
                      {r.flightNumber}
                      {r.airline && ` · ${r.airline}`}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-slate-100">
                      {r.origin.city} ({r.origin.iata}) → {r.destination.city} (
                      {r.destination.iata})
                    </p>
                    {missingZone ? (
                      <p className="mt-1 text-xs text-amber-400">
                        This airport's time zone isn't in our data — add the
                        stop manually above.
                      </p>
                    ) : (
                      <>
                        {r.origin.zone !== lastZone && (
                          <p className="mt-1 text-xs text-amber-400/90">
                            Heads up: this flight departs {r.origin.city}, but
                            your journey currently ends in {zoneCity(lastZone)}.
                          </p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startTripWithFlight(r)}
                            className="flex-1 rounded-lg border border-slate-600 py-1.5 text-xs font-medium text-slate-200 active:bg-slate-700"
                          >
                            Start trip here
                          </button>
                          <button
                            type="button"
                            onClick={() => addFlightAsStop(r)}
                            className="flex-1 rounded-lg bg-sky-500 py-1.5 text-xs font-semibold text-slate-950 active:bg-sky-400"
                          >
                            Add as next stop
                          </button>
                        </div>
                      </>
                    )}
                    <p className="mt-1.5 text-[10px] text-slate-500">
                      Route data via adsbdb.com — multi-stop flight numbers may
                      show a single segment, so double-check.
                    </p>
                  </div>
                )
              })()}
            {flightResult?.status === 'unknown' && (
              <p id="flight-result" className="mt-2 text-xs text-slate-500">
                Couldn't find that flight — try the airline code + number, like
                BA15 or UA100.
              </p>
            )}
            {flightResult?.status === 'error' && (
              <p id="flight-result" className="mt-2 text-xs text-rose-400">
                Lookup failed — check your connection and try again.
              </p>
            )}
          </form>
        </section>

        {/* ------------------------------------------------ routine inputs */}
        <section className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <h2 className="text-sm font-semibold text-slate-200">Your routine</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Sleep from
              <input
                type="time"
                value={minutesToInput(journey.schedule.bedtime)}
                onChange={(e) => {
                  const v = inputToMinutes(e.target.value)
                  if (v !== null)
                    update({ schedule: { ...journey.schedule, bedtime: v } })
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-base text-slate-100 [color-scheme:dark]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              to
              <input
                type="time"
                value={minutesToInput(journey.schedule.wake)}
                onChange={(e) => {
                  const v = inputToMinutes(e.target.value)
                  if (v !== null)
                    update({ schedule: { ...journey.schedule, wake: v } })
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-base text-slate-100 [color-scheme:dark]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Start adjusting
              <select
                value={journey.preShiftDays}
                onChange={(e) => update({ preShiftDays: Number(e.target.value) })}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-base text-slate-100 [color-scheme:dark]"
              >
                <option value={0}>on arrival</option>
                <option value={1}>1 day early</option>
                <option value={2}>2 days early</option>
                <option value={3}>3 days early</option>
              </select>
            </label>
          </div>
        </section>

        {/* ------------------------------------------------------- legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> sleep
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-300" /> get bright light
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-950 ring-1 ring-rose-900" />{' '}
            keep it dim
          </span>
          <span className="ml-auto">all times local</span>
        </div>

        {/* --------------------------------------------------------- plan */}
        {plan.days.filter((d) => d.phase === 'pre').length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-base font-bold text-slate-100">
              Before departure
              <span className="ml-2 text-xs font-normal text-slate-500">
                ease in while still in {originCity}
              </span>
            </h3>
            <div className="space-y-2">
              {plan.days
                .filter((d) => d.phase === 'pre')
                .map((d) => (
                  <DayCard key={`pre-${d.date}`} day={d} use24h={use24h} />
                ))}
            </div>
          </div>
        )}

        {plan.legs.map((summary) => (
          <div key={summary.legIndex}>
            <LegHeader
              summary={summary}
              originCity={originCity}
              prevCity={
                summary.legIndex === 0
                  ? originCity
                  : zoneCity(plan.legs[summary.legIndex - 1].zone)
              }
            />
            <div className="space-y-2">
              {plan.days
                .filter((d) => d.phase === 'stay' && d.legIndex === summary.legIndex)
                .map((d) => (
                  <DayCard key={`${summary.legIndex}-${d.date}`} day={d} use24h={use24h} />
                ))}
            </div>
          </div>
        ))}

        {plan.adaptedDate && (
          <p className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
            🎉 Fully adjusted to {zoneCity(plan.legs[plan.legs.length - 1].zone)}{' '}
            time around {fmtDate(plan.adaptedDate)}.
          </p>
        )}

        {/* ------------------------------------------------- how it works */}
        <details className="mt-5 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
          <summary className="cursor-pointer text-sm font-medium text-slate-300">
            How this plan works
          </summary>
          <div className="mt-2 space-y-2">
            <p>
              Your body clock can only shift about <strong>1 hour per day
              earlier</strong> (flying east) or <strong>1.5 hours per day
              later</strong> (flying west). This plan moves your sleep window by
              that amount each day and tells you when light helps or hurts.
            </p>
            <p>
              Light is the strongest lever: bright light soon after waking
              pulls your clock <em>earlier</em>, while bright light in the
              evening pushes it <em>later</em> — so the ☀️ and 🕶️ windows sit
              on opposite sides of your day depending on which way you're
              shifting, and move with your sleep window.
            </p>
            <p>
              On multi-stop trips the plan tracks where your body clock
              actually is — if you're not fully adjusted when the next flight
              leaves, the next leg starts from there, and it even shifts the
              "long way round" when that's genuinely faster.
            </p>
            <p className="text-slate-500">
              💊 marks the evidence-based timing for optional low-dose
              melatonin on eastward shifts. This is an educational tool, not
              medical advice — check with a doctor before taking supplements.
            </p>
          </div>
        </details>
      </main>

      {picker && (
        <ZonePicker
          selected={[]}
          now={Date.now()}
          use24h={use24h}
          onAdd={(id) => {
            if (picker === 'origin') update({ origin: id })
            else updateLeg(picker, { zone: id })
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
