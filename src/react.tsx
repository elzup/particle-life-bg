import {
  type CSSProperties,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import { type Controller, mount } from './mount.ts'
import type { Options } from './options.ts'

export type ParticleLifeBgProps = Options & {
  className?: string
  style?: CSSProperties
  /** pause / shuffle などを命令的に呼びたいとき */
  controllerRef?: Ref<Controller | null>
}

// 既定は親いっぱいに敷く。親に position: relative を付ければその背景になる
const FILL: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  pointerEvents: 'none',
}

const delegate = (ref: { current: Controller | null }): Controller => ({
  get canvas() {
    return ref.current?.canvas as HTMLCanvasElement
  },
  get matrix() {
    return ref.current?.matrix ?? []
  },
  setOptions: (patch, mode) => ref.current?.setOptions(patch, mode),
  pause: () => ref.current?.pause(),
  resume: () => ref.current?.resume(),
  shuffle: () => ref.current?.shuffle(),
  respawn: () => ref.current?.respawn(),
  destroy: () => ref.current?.destroy(),
})

export const ParticleLifeBg = ({
  className,
  style,
  controllerRef,
  ...options
}: ParticleLifeBgProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controller = useRef<Controller | null>(null)
  // mount は 1 度だけ。初回の options はこの ref 経由で渡す (deps に入れると毎回作り直してしまう)
  const latest = useRef(options)

  latest.current = options

  useEffect(() => {
    if (!canvasRef.current) return
    const c = mount(canvasRef.current, latest.current)

    controller.current = c
    return () => {
      c.destroy()
      controller.current = null
    }
  }, [])

  // 値が同じなら作り直さないので毎レンダー渡してよい。props から外した値は既定に戻すため replace
  useEffect(() => {
    controller.current?.setOptions(options, 'replace')
  })

  // useImperativeHandle は mount より先 (layout 段階) に走るので、実体ではなく遅延で委譲する窓口を渡す
  useImperativeHandle(controllerRef, () => delegate(controller), [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ ...FILL, ...style }}
    />
  )
}
