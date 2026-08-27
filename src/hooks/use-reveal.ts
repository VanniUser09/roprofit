import { useEffect, useRef, useState } from "react"

function revealClass(visible: boolean) {
  return visible
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-4 motion-reduce:translate-y-0"
}

function revealDelay(visible: boolean, index: number, step = 60) {
  return { transitionDelay: visible ? `${index * step}ms` : "0ms" }
}

function useReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, visible }
}

export { useReveal, revealClass, revealDelay }
