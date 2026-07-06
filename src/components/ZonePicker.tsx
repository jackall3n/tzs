import { useEffect, useMemo, useRef, useState } from 'react'
import { formatClock, offsetLabel } from '../lib/time'
import { searchZones } from '../lib/zones'

interface ZonePickerProps {
  selected: string[]
  now: number
  use24h: boolean
  onAdd: (id: string) => void
  onClose: () => void
}

export function ZonePicker({ selected, now, use24h, onAdd, onClose }: ZonePickerProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const results = useMemo(() => searchZones(query), [query])
  const selectedSet = useMemo(() => new Set(selected), [selected])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[75dvh] flex-col rounded-t-2xl border-t border-slate-700 bg-slate-900 shadow-2xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-700" />
        <div className="flex items-center gap-2 p-3">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search city, country or zone…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 active:bg-slate-800"
          >
            Cancel
          </button>
        </div>
        <ul className="flex-1 divide-y divide-slate-800 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {results.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              No time zones match “{query}”
            </li>
          )}
          {results.map((zone) => {
            const already = selectedSet.has(zone.id)
            return (
              <li key={zone.id}>
                <button
                  disabled={already}
                  onClick={() => onAdd(zone.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-800 disabled:opacity-40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-100">
                      {zone.city}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {zone.region || 'Universal'} · {offsetLabel(zone.id, now)}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm tabular-nums text-slate-400">
                    {already ? 'added' : formatClock(zone.id, now, use24h)}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
