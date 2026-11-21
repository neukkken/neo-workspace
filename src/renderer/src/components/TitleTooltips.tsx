import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DELAY_MS = 350
const GAP = 6
const EDGE = 8

interface Tip {
  label: string
  anchor: DOMRect
}

// Shows every native title="" in the app as the house tooltip. One delegated listener instead of
// wrapping each control: the hovered element's title is blanked (an empty title also stops the
// browser from falling back to an ancestor's) and given back on leave, so it keeps naming the control.
export const TitleTooltips: React.FC = () => {
  const [tip, setTip] = useState<Tip | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current: HTMLElement | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const hide = (): void => {
      clearTimeout(timer)
      if (current) {
        const label = current.dataset.tip
        // Only restore what we blanked: React may have written a newer title meanwhile
        if (label && current.getAttribute('title') === '') current.setAttribute('title', label)
        delete current.dataset.tip
        current = null
      }
      setTip(null)
    }

    const show = (target: EventTarget | null): void => {
      const el = target instanceof Element ? target.closest<HTMLElement>('[title]') : null
      const label = el?.getAttribute('title')
      if (el && el === current && !label) return
      hide()
      if (!el || !label) return
      el.dataset.tip = label
      el.setAttribute('title', '')
      current = el
      timer = setTimeout(() => {
        if (el.isConnected) setTip({ label, anchor: el.getBoundingClientRect() })
      }, DELAY_MS)
    }

    const onMouseOver = (e: MouseEvent): void => {
      // A pressed button means a drag is under way: no tooltips over whatever it passes
      if (e.buttons === 0) show(e.target)
    }
    const onMouseOut = (e: MouseEvent): void => {
      if (current && !(e.relatedTarget instanceof Node && current.contains(e.relatedTarget))) hide()
    }
    const onFocusIn = (e: FocusEvent): void => {
      if (e.target instanceof Element && e.target.matches(':focus-visible')) show(e.target)
    }

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', hide)
    document.addEventListener('mousedown', hide, true)
    document.addEventListener('keydown', hide, true)
    document.addEventListener('wheel', hide, { capture: true, passive: true })
    return () => {
      hide()
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('mousedown', hide, true)
      document.removeEventListener('keydown', hide, true)
      document.removeEventListener('wheel', hide, true)
    }
  }, [])

  // Placed after measuring: below the control, above when there is no room, never off screen
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!tip || !box) return
    const { width, height } = box.getBoundingClientRect()
    const { anchor } = tip
    const below = anchor.bottom + GAP
    const top = below + height > window.innerHeight - EDGE ? anchor.top - GAP - height : below
    const left = anchor.left + anchor.width / 2 - width / 2
    box.style.top = `${Math.max(EDGE, top)}px`
    box.style.left = `${Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE))}px`
    box.style.visibility = 'visible'
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={boxRef}
      role="tooltip"
      style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 99998 }}
      className="pointer-events-none max-w-xs rounded-button bg-void border border-zinc-700/80 px-2 py-1 text-[11px] text-zinc-100 select-none"
    >
      {tip.label}
    </div>,
    document.body
  )
}
