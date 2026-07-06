import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { TimeGrid } from '../components/TimeGrid'
import { ZonePicker } from '../components/ZonePicker'
import { formatClock, formatDate, hourlyInstants, offsetLabel } from '../lib/time'
import { DEFAULT_ZONES, zoneCity } from '../lib/zones'

export const Route = createFileRoute('/')({
  component: Home,
})

const ZONES_KEY = 'tzs:zones'
const FORMAT_KEY = 'tzs:24h'

function loadInitialZones(): string[] {
  try {
    const stored = localStorage.getItem(ZONES_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((z): z is string => typeof z === 'string')
      }
    }
  } catch {
    // ignore corrupt storage
  }
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone
  return [local, ...DEFAULT_ZONES.filter((z) => z !== local)]
}

function Home() {
  const [mounted, setMounted] = useState(false)
  const [zones, setZones] = useState<string[]>([])
  const [use24h, setUse24h] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [dayOffset, setDayOffset] = useState(0)
  const [selectedCol, setSelectedCol] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Everything is client state (localStorage + live clock), so hydrate after mount
  useEffect(() => {
    setZones(loadInitialZones())
    setUse24h(localStorage.getItem(FORMAT_KEY) === '1')
    setNow(Date.now())
    setMounted(true)
  }, [])

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const interval = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  useEffect(() => {
    if (mounted && zones.length > 0) {
      localStorage.setItem(ZONES_KEY, JSON.stringify(zones))
    }
  }, [mounted, zones])

  useEffect(() => {
    if (mounted) localStorage.setItem(FORMAT_KEY, use24h ? '1' : '0')
  }, [mounted, use24h])

  const homeZone = zones[0]

  const instants = useMemo(
    () => (homeZone ? hourlyInstants(homeZone, now, dayOffset) : []),
    // Recompute when the home zone's calendar day could change, not every tick
    [homeZone, dayOffset, homeZone ? formatDate(homeZone, now) : ''],
  )

  const currentCol = useMemo(() => {
    if (dayOffset !== 0) return -1
    return instants.findIndex((ts, i) => {
      const next = instants[i + 1] ?? ts + 3_600_000
      return ts <= now && now < next
    })
  }, [instants, now, dayOffset])

  const displayTs = selectedCol !== null && instants[selectedCol] !== undefined
    ? instants[selectedCol]
    : now

  const changeDay = (delta: number) => {
    setDayOffset((d) => d + delta)
    setSelectedCol(null)
  }

  const addZone = (id: string) => {
    setZones((zs) => (zs.includes(id) ? zs : [...zs, id]))
    setPickerOpen(false)
  }

  const removeZone = (id: string) => {
    setZones((zs) => zs.filter((z) => z !== id))
  }

  const moveZone = (index: number, delta: number) => {
    setZones((zs) => {
      const target = index + delta
      if (target < 0 || target >= zs.length) return zs
      const next = [...zs]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  const makeHome = (index: number) => {
    setZones((zs) => {
      if (index === 0) return zs
      const next = [...zs]
      const [moved] = next.splice(index, 1)
      next.unshift(moved)
      return next
    })
    setSelectedCol(null)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex items-center gap-2 px-3 pt-3">
          <h1 className="text-lg font-bold tracking-tight text-slate-100">
            tz<span className="text-sky-400">s</span>
          </h1>
          <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
            world time comparison
          </p>
          <Link
            to="/jetlag"
            className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 active:bg-slate-800"
          >
            ✈️ Jet lag
          </Link>
          <button
            onClick={() => setUse24h((v) => !v)}
            className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 active:bg-slate-800"
          >
            {use24h ? '24h' : '12h'}
          </button>
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium active:bg-slate-800 ${
              editMode
                ? 'border-sky-500 text-sky-400'
                : 'border-slate-700 text-slate-300'
            }`}
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <button
            onClick={() => changeDay(-1)}
            aria-label="Previous day"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 active:bg-slate-800"
          >
            ‹
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-sm font-semibold text-slate-100">
              {mounted && homeZone ? formatDate(homeZone, instants[12] ?? now) : '…'}
            </div>
            <div className="truncate text-[10px] text-slate-500">
              {mounted && homeZone
                ? `day in ${zoneCity(homeZone)} (${offsetLabel(homeZone, now)})`
                : 'loading'}
            </div>
          </div>
          <button
            onClick={() => changeDay(1)}
            aria-label="Next day"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 active:bg-slate-800"
          >
            ›
          </button>
          {dayOffset !== 0 && (
            <button
              onClick={() => {
                setDayOffset(0)
                setSelectedCol(null)
              }}
              className="shrink-0 rounded-lg border border-sky-600 px-2.5 py-1.5 text-xs font-medium text-sky-400 active:bg-slate-800"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setPickerOpen(true)}
            className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-slate-950 active:bg-sky-400"
          >
            + Add
          </button>
        </div>

        {selectedCol !== null && mounted && homeZone && (
          <div className="flex items-center gap-2 border-t border-slate-800/60 bg-sky-500/10 px-3 py-1.5">
            <p className="min-w-0 flex-1 truncate text-xs text-sky-300">
              Comparing {formatClock(homeZone, displayTs, use24h)}{' '}
              {formatDate(homeZone, displayTs)} in {zoneCity(homeZone)}
            </p>
            <button
              onClick={() => setSelectedCol(null)}
              className="shrink-0 text-xs font-medium text-sky-400"
            >
              Clear ✕
            </button>
          </div>
        )}
      </header>

      <main className="flex-1">
        {!mounted ? (
          <div className="px-4 py-16 text-center text-sm text-slate-500">
            Loading your time zones…
          </div>
        ) : editMode ? (
          <ul className="divide-y divide-slate-800/60">
            {zones.map((zone, index) => (
              <li key={zone} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-100">
                      {zoneCity(zone)}
                    </span>
                    {index === 0 && (
                      <span className="shrink-0 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                        home
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {zone} · {offsetLabel(zone, now)}
                  </div>
                </div>
                {index !== 0 && (
                  <button
                    onClick={() => makeHome(index)}
                    className="shrink-0 rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-slate-300 active:bg-slate-800"
                  >
                    Set home
                  </button>
                )}
                <button
                  onClick={() => moveZone(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${zoneCity(zone)} up`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 active:bg-slate-800 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveZone(index, 1)}
                  disabled={index === zones.length - 1}
                  aria-label={`Move ${zoneCity(zone)} down`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 active:bg-slate-800 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeZone(zone)}
                  disabled={zones.length === 1}
                  aria-label={`Remove ${zoneCity(zone)}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-900 text-rose-400 active:bg-rose-950 disabled:opacity-30"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : zones.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-slate-500">
            No time zones yet — tap{' '}
            <button
              onClick={() => setPickerOpen(true)}
              className="font-semibold text-sky-400"
            >
              + Add
            </button>{' '}
            to get started.
          </div>
        ) : (
          <TimeGrid
            zones={zones}
            instants={instants}
            selectedCol={selectedCol}
            currentCol={currentCol}
            displayTs={displayTs}
            now={now}
            use24h={use24h}
            onSelectCol={setSelectedCol}
          />
        )}
      </main>

      <footer className="border-b border-slate-800/60 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-200" /> office hours
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-200/85" /> awake
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-800 ring-1 ring-slate-700" />{' '}
            night
          </span>
          <span className="ml-auto">tap an hour to compare · scroll sideways</span>
        </div>
      </footer>

      {pickerOpen && mounted && (
        <ZonePicker
          selected={zones}
          now={now}
          use24h={use24h}
          onAdd={addZone}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
