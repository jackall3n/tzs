import { useEffect, useState } from 'react'

export interface KeyboardViewport {
  /** Height in px the on-screen keyboard steals from the layout viewport */
  inset: number
  /** Current visible viewport height in px (0 before mount) */
  height: number
}

/**
 * Tracks the on-screen keyboard via the VisualViewport API. Browsers that
 * shrink the layout viewport themselves (Android with
 * `interactive-widget=resizes-content`) report an inset of ~0 and fixed
 * elements just work; iOS Safari keeps the layout viewport full-size and
 * only shrinks the visual viewport, so bottom-anchored UI must offset
 * itself by this inset to stay above the keyboard.
 */
export function useKeyboardViewport(): KeyboardViewport {
  const [state, setState] = useState<KeyboardViewport>({ inset: 0, height: 0 })

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop),
      )
      // Ignore sub-keyboard-sized jitter (URL bar collapse, rubber banding)
      setState({ inset: inset > 50 ? inset : 0, height: Math.round(vv.height) })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return state
}

/** Locks background scrolling while a modal sheet is open. */
export function useScrollLock() {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [])
}
