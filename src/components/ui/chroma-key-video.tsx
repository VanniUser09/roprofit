import { useEffect, useRef } from "react"

function ChromaKeyVideo({
  src,
  className,
  low = 16,
  high = 48,
}: {
  src: string
  className?: string
  low?: number
  high?: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d", { willReadFrequently: true })
    if (!video || !canvas || !ctx) return

    let raf = 0
    const draw = () => {
      if (video.videoWidth) {
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        ctx.drawImage(video, 0, 0)
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = frame.data
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          data[i + 3] = lum <= low ? 0 : lum >= high ? 255 : ((lum - low) / (high - low)) * 255
        }
        ctx.putImageData(frame, 0, 0)
      }
      // Stops drawing once the video pauses at its last frame; restart() below is what wakes it back up.
      if (!video.paused && !video.ended) raf = requestAnimationFrame(draw)
    }

    const restart = () => {
      cancelAnimationFrame(raf)
      video.muted = true
      video.currentTime = 0
      video.play().catch(() => {})
      raf = requestAnimationFrame(draw)
    }

    restart()

    const root = document.documentElement
    const observer = new MutationObserver(restart)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })

    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [low, high])

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        aria-hidden="true"
        className="sr-only"
      />
      <canvas ref={canvasRef} aria-hidden="true" className={className} />
    </>
  )
}

export { ChromaKeyVideo }
