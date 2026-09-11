/**
 * The graph's camera: where the view is, and how it moves.
 *
 * Everything that moves the view goes through here so it all behaves the same
 * way, and the way is Apple's (Designing Fluid Interfaces, WWDC 2018):
 *
 * - **The live value is the only value.** `x`, `y` and `scale` are always what
 *   is on screen, mid-animation included. Grabbing the graph while it is still
 *   gliding into place starts from where it actually is, never from where it
 *   was headed — the old CSS transition got this wrong and the view jumped.
 * - **Springs, not durations.** A critically damped spring (no overshoot) can
 *   be re-targeted at any instant and carries its velocity through, so an
 *   interrupted motion bends rather than restarts.
 * - **Momentum.** Letting go of a pan hands the pointer's velocity to the
 *   spring and aims it at where that throw would come to rest, the same
 *   exponential decay a scroll view uses.
 */

export interface CameraState {
  x: number
  y: number
  scale: number
}

export interface SpringOptions {
  /** Seconds to (effectively) reach the target. Not a duration: a feel. */
  response?: number
  /** Initial velocity in px/s, handed over from a gesture. */
  velocityX?: number
  velocityY?: number
}

/** Apple's default for moving something into place. */
const DEFAULT_RESPONSE = 0.4

/**
 * How quickly a thrown pan loses speed. Apple's scroll views use `0.998`, which
 * suits flicking through a long list but carries a canvas you are positioning
 * too far; `0.99` is Apple's "fast" rate. This sits between them: a throw
 * travels about 0.2s worth of its release speed.
 */
const DECELERATION = 0.995

/** Below this release speed a pan just stops — it was a placement, not a throw. */
const MIN_GLIDE_SPEED = 220

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

export class Camera implements CameraState {
  x = 0
  y = 0
  scale = 1

  private vx = 0
  private vy = 0
  private vs = 0
  private target: CameraState | null = null
  private omega = (2 * Math.PI) / DEFAULT_RESPONSE
  private frame = 0
  private lastTime = 0
  private dirty = false

  constructor(private readonly apply: (state: CameraState) => void) {}

  get moving(): boolean {
    return this.target !== null
  }

  /** Jump, and stop any motion. Applied on the next frame, so a flood of
   *  pointer events costs one style write per frame. */
  set(state: Partial<CameraState>): void {
    this.halt()
    if (state.x !== undefined) this.x = state.x
    if (state.y !== undefined) this.y = state.y
    if (state.scale !== undefined) this.scale = state.scale
    this.schedule()
  }

  /** Stop wherever the view is right now. */
  halt(): void {
    this.target = null
    this.vx = this.vy = this.vs = 0
  }

  /** Spring from the live value to `state`. Interruptible at any frame. */
  animateTo(state: CameraState, options: SpringOptions = {}): void {
    if (reducedMotion.matches) {
      this.set(state)
      return
    }
    this.omega = (2 * Math.PI) / (options.response ?? DEFAULT_RESPONSE)
    if (options.velocityX !== undefined) this.vx = options.velocityX
    if (options.velocityY !== undefined) this.vy = options.velocityY
    this.target = { ...state }
    this.schedule()
  }

  /**
   * Carry a released pan on: project where the throw would stop, then spring
   * there starting at the pointer's own velocity, so the hand-off is seamless.
   */
  glide(
    velocityX: number,
    velocityY: number,
    /**
     * Where the throw is allowed to land. A landing pulled in short of the
     * projection is reached by the same spring, still carrying the throw's
     * velocity, so it eases to a stop against the limit rather than hitting it.
     */
    bound?: (landing: CameraState) => CameraState,
  ): void {
    if (reducedMotion.matches) return
    if (Math.hypot(velocityX, velocityY) < MIN_GLIDE_SPEED) return
    const landing: CameraState = {
      x: this.x + project(velocityX),
      y: this.y + project(velocityY),
      scale: this.scale,
    }
    this.animateTo(bound ? bound(landing) : landing, {
      response: 0.55,
      velocityX,
      velocityY,
    })
  }

  private schedule(): void {
    this.dirty = true
    if (this.frame) return
    this.lastTime = performance.now()
    this.frame = requestAnimationFrame((now) => this.tick(now))
  }

  private tick(now: number): void {
    this.frame = 0
    const dt = Math.min((now - this.lastTime) / 1000, 1 / 30)
    this.lastTime = now

    if (this.target) {
      const [x, vx] = step(this.x, this.vx, this.target.x, this.omega, dt)
      const [y, vy] = step(this.y, this.vy, this.target.y, this.omega, dt)
      const [scale, vs] = step(this.scale, this.vs, this.target.scale, this.omega, dt)
      this.x = x
      this.y = y
      this.scale = scale
      this.vx = vx
      this.vy = vy
      this.vs = vs

      const settled =
        Math.abs(this.target.x - x) < 0.05 &&
        Math.abs(this.target.y - y) < 0.05 &&
        Math.abs(this.target.scale - scale) < 0.0002 &&
        Math.hypot(vx, vy) < 1
      if (settled) {
        this.x = this.target.x
        this.y = this.target.y
        this.scale = this.target.scale
        this.halt()
      }
      this.dirty = true
    }

    if (this.dirty) {
      this.dirty = false
      this.apply(this)
    }
    if (this.target) {
      this.frame = requestAnimationFrame((next) => this.tick(next))
    }
  }
}

/**
 * One frame of a critically damped spring (damping ratio 1), solved exactly
 * rather than integrated, so it is stable at any frame time.
 */
function step(
  value: number,
  velocity: number,
  target: number,
  omega: number,
  dt: number,
): [number, number] {
  const offset = value - target
  const decay = Math.exp(-omega * dt)
  const drift = velocity + omega * offset
  return [
    target + (offset + drift * dt) * decay,
    (velocity - omega * drift * dt) * decay,
  ]
}

/** Apple's projection: where a throw at `velocity` px/s comes to rest. */
function project(velocity: number): number {
  return ((velocity / 1000) * DECELERATION) / (1 - DECELERATION)
}

/**
 * The pointer's velocity at release, from its last few moves. A single delta
 * is noisy; the last ~80ms is what the hand was actually doing.
 */
export class VelocityTracker {
  private samples: { x: number; y: number; t: number }[] = []

  add(x: number, y: number): void {
    const t = performance.now()
    this.samples.push({ x, y, t })
    while (this.samples.length > 2 && t - this.samples[0]!.t > 100) this.samples.shift()
  }

  /** px/s, or zero when the pointer had come to rest before letting go. */
  velocity(): { x: number; y: number } {
    const last = this.samples[this.samples.length - 1]
    const first = this.samples[0]
    if (!last || !first || last === first) return { x: 0, y: 0 }
    if (performance.now() - last.t > 60) return { x: 0, y: 0 }
    const dt = (last.t - first.t) / 1000
    if (dt <= 0) return { x: 0, y: 0 }
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt }
  }
}
