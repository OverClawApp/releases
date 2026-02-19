import { useEffect, useRef, useState } from 'react'

interface ScreenSaverProps {
  active: boolean
  onDismiss?: () => void
}

function getAccentColor(): string {
  const style = getComputedStyle(document.documentElement)
  return style.getPropertyValue('--accent-blue').trim() || '#EF4444'
}

export default function ScreenSaver({ active, onDismiss }: ScreenSaverProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (active) { setVisible(true); setFading(false) }
    else if (visible) {
      setFading(true)
      const t = setTimeout(() => { setVisible(false); setFading(false) }, 600)
      return () => clearTimeout(t)
    }
  }, [active])

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let w = 0, h = 0
    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const color = getAccentColor()
    let blinkTimer = 0, blinking = false, blinkProgress = 0
    let breathPhase = 0

    const draw = (_time: number) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, w, h)

      breathPhase += 0.008
      const cx = w / 2
      const cy = h / 2
      const u = Math.min(w, h) * 0.06

      // Blink
      blinkTimer++
      if (!blinking && blinkTimer > 250 + Math.random() * 200) { blinking = true; blinkTimer = 0; blinkProgress = 0 }
      if (blinking) {
        blinkProgress += 0.15
        if (blinkProgress >= 2) { blinking = false; blinkProgress = 0; blinkTimer = 0 }
      }
      const openAmount = blinking ? (blinkProgress < 1 ? 1 - blinkProgress : blinkProgress - 1) : 1

      // Eyes — simple filled squares
      const eyeSize = u * 1.4
      const eyeSpacing = u * 2.5
      const eyeY = cy - u * 0.5
      const eyeH = eyeSize * openAmount

      ctx.fillStyle = color
      // Left eye
      ctx.fillRect(cx - eyeSpacing - eyeSize / 2, eyeY - eyeH / 2, eyeSize, Math.max(eyeH, 2))
      // Right eye
      ctx.fillRect(cx + eyeSpacing - eyeSize / 2, eyeY - eyeH / 2, eyeSize, Math.max(eyeH, 2))

      // Mouth — simple filled rectangle, slight breathing width
      const mouthW = u * 3 + Math.sin(breathPhase) * u * 0.2
      const mouthH = u * 0.4
      const mouthY = cy + u * 2.2
      ctx.fillStyle = color
      ctx.fillRect(cx - mouthW / 2, mouthY, mouthW, mouthH)

      // Status text
      ctx.fillStyle = color
      ctx.globalAlpha = 0.15
      ctx.font = `${Math.round(u * 0.4)}px "SF Mono", "Fira Code", monospace`
      ctx.textAlign = 'center'
      ctx.fillText('[ CONNECTED VIA WEB RELAY ]', cx, h - u * 1.5)
      ctx.globalAlpha = 1

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, cursor: 'none',
        opacity: fading ? 0 : 1, transition: 'opacity 0.6s ease',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
