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

## Development

```sh
npm install
npm run dev
```

## Build (static output)

```sh
npm run build
```

The site is prerendered to static files in `dist/client/` — deploy that
directory to any static host.
