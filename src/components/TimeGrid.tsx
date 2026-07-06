import { useEffect, useRef } from 'react'
import {
  formatClock,
  formatDate,
  relativeOffsetLabel,
  wallTime,
  zoneAbbreviation,
} from '../lib/time'
import { zoneCity } from '../lib/zones'

const CELL_W = 44 // matches w-11

interface TimeGridProps {
  zones: string[]
  instants: number[]
  selectedCol: number | null
  currentCol: number
  displayTs: number
  now: number
  use24h: boolean
  onSelectCol: (col: number | null) => void
}

function hourTone(hour: number): string {
  if (hour >= 9 && hour < 17)
    return 'bg-emerald-200 text-emerald-950' // working hours
  if (hour >= 7 && hour < 22) return 'bg-amber-200/85 text-amber-950' // awake
  return 'bg-slate-800 text-slate-500' // night
}

function hourLabel(hour: number, use24h: boolean): string {
  if (use24h) return String(hour)
  if (hour === 0) return '12'
  if (hour === 12) return '12'
  return String(hour % 12)
}

function hourSuffix(hour: number, use24h: boolean): string {
  if (use24h) return ':00'
  return hour < 12 ? 'am' : 'pm'
}

export function TimeGrid({
  zones,
  instants,
  selectedCol,
  currentCol,
  displayTs,
  now,
  use24h,
  onSelectCol,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const homeZone = zones[0]

  // Keep the "current" column in view when the grid mounts or the day changes
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = selectedCol ?? (currentCol >= 0 ? currentCol : 9)
    el.scrollTo({
      left: Math.max(0, target * CELL_W - (el.clientWidth - 112) / 2 + CELL_W / 2),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instants[0], zones.length])

  return (
    <div
      ref={scrollRef}
      className="no-scrollbar overflow-x-auto overscroll-x-contain pb-2"
    >
      <div className="min-w-max">
        {zones.map((zone) => {
          const label = wallTime(zone, displayTs)
          return (
            <div key={zone} className="flex items-stretch">
              {/* Sticky zone label */}
              <div className="sticky left-0 z-10 flex w-28 shrink-0 flex-col justify-center border-b border-slate-800/60 bg-slate-950 py-1.5 pr-2 pl-3">
                <div className="flex items-baseline gap-1">
                  <span className="truncate text-sm font-semibold text-slate-100">
                    {zoneCity(zone)}
                  </span>
                </div>
                <div className="truncate text-[10px] leading-tight text-slate-500">
                  {zoneAbbreviation(zone, displayTs)}
                  {zone !== homeZone &&
                    ` · ${relativeOffsetLabel(zone, homeZone, displayTs)}`}
                </div>
                <div className="text-xs leading-tight font-medium tabular-nums text-sky-300">
                  {formatClock(zone, displayTs, use24h)}
                </div>
                <div className="text-[10px] leading-tight text-slate-500">
                  {formatDate(zone, displayTs)}
                </div>
              </div>

              {/* Hour cells */}
              <div className="flex border-b border-slate-800/60 py-1.5">
                {instants.map((ts, col) => {
                  const w = wallTime(zone, ts)
                  const isSelected = selectedCol === col
                  const isCurrent = currentCol === col && selectedCol === null
                  const isMidnight = w.hour === 0
                  return (
                    <button
                      key={ts}
                      onClick={() => onSelectCol(isSelected ? null : col)}
                      aria-label={`${zoneCity(zone)} ${w.weekday} ${w.hour}:00`}
                      className={`relative flex h-12 w-11 shrink-0 flex-col items-center justify-center border-r border-slate-950/40 first:rounded-l-md last:rounded-r-md last:border-r-0 ${hourTone(w.hour)} ${
                        isSelected
                          ? 'z-[5] ring-2 ring-sky-400 brightness-110'
                          : isCurrent
                            ? 'z-[4] ring-2 ring-sky-500/50'
                            : ''
                      }`}
                    >
                      {isMidnight ? (
                        <>
                          <span className="text-[10px] leading-none font-semibold uppercase">
                            {w.weekday}
                          </span>
                          <span className="mt-0.5 text-[10px] leading-none opacity-80">
                            {new Intl.DateTimeFormat('en-US', {
                              timeZone: zone,
                              month: 'short',
                              day: 'numeric',
                            }).format(new Date(ts))}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-sm leading-none font-semibold tabular-nums">
                            {hourLabel(w.hour, use24h)}
                          </span>
                          <span className="mt-0.5 text-[9px] leading-none opacity-70">
                            {hourSuffix(w.hour, use24h)}
                          </span>
                        </>
                      )}
                      {isCurrent && (
                        <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-sky-500" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
