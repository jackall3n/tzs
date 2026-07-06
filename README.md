# tzs

A mobile-friendly world time comparison tool — a
[worldtimebuddy](https://www.worldtimebuddy.com/)-style hourly grid for lining
up the time across any number of time zones.

Built with [TanStack Start](https://tanstack.com/start) (static prerendered
output), React 19 and Tailwind CSS v4.

## Features

- **Hourly comparison grid** — 24 aligned hour columns for the home zone's day;
  tap any hour to highlight that moment across every zone.
- **Any number of time zones** — add zones from the full IANA database with a
  fuzzy search (cities, countries, abbreviations like "nyc" or "ist").
- **Mobile-first** — sticky zone labels with a horizontally scrolling grid,
  bottom-sheet zone picker, thumb-sized targets, safe-area aware.
- **Day/night shading** — office hours, awake hours and night are colour coded
  per zone, worldtimebuddy style.
- **Day navigation** — step forward/backward a day at a time, jump back to
  today.
- **Home zone** — the first zone anchors the grid; reorder, re-home or remove
  zones in Edit mode.
- **12h/24h toggle**, live clocks, and selections persisted to `localStorage`.
- **Jet lag planner** (`/jetlag`) — plan recovery for any journey, including
  multi-stop trips. Simulates your body clock (advancing ~1h/day eastward,
  delaying ~1.5h/day westward, taking the faster way around the clock), and
  produces a day-by-day schedule of sleep windows, bright-light and dim-light
  timing, caffeine cutoffs and optional melatonin timing. Later legs start
  from wherever your body clock actually got to, with optional pre-trip
  adjustment days at home.
- **Add stops by flight number** — type e.g. `BA15` and the planner resolves
  the route via the free, keyless [adsbdb](https://www.adsbdb.com) API and
  prefills origin/destination time zones (using a bundled, lazy-loaded
  IATA → IANA airport map generated from
  [mwgg/Airports](https://github.com/mwgg/Airports)). Routes are a prefill to
  confirm, not a schedule feed — multi-segment flight numbers may resolve to
  a single segment.

## Development

Uses [Bun](https://bun.sh) as the package manager and script runner.

```sh
bun install
bun run dev
```

## Build (static output)

```sh
bun run build
```

The site is prerendered to static files in `dist/client/` — deploy that
directory to any static host (set it as the output directory on Vercel).
