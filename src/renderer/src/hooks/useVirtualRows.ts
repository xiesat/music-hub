import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface Options {
  rowHeight: number
  total: number
  overscan?: number
}

export interface VirtualRows {
  containerRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
  startIndex: number
  endIndex: number
  paddingTop: number
  totalHeight: number
}

export function useVirtualRows({ rowHeight, total, overscan = 8 }: Options): VirtualRows {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(600)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewport(element.clientHeight))
    observer.observe(element)
    setViewport(element.clientHeight)
    return () => observer.disconnect()
  }, [])

  const onScroll = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    setScrollTop(element.scrollTop)
  }, [])

  const { startIndex, endIndex, paddingTop } = useMemo(() => {
    const visible = Math.ceil(viewport / rowHeight) + overscan * 2
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const end = Math.min(total, start + visible)
    return { startIndex: start, endIndex: end, paddingTop: start * rowHeight }
  }, [scrollTop, viewport, rowHeight, total, overscan])

  return {
    containerRef,
    onScroll,
    startIndex,
    endIndex,
    paddingTop,
    totalHeight: total * rowHeight
  }
}
