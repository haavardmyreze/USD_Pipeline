/**
 * Showing and hiding layers so they leave the way they came.
 *
 * "If something disappears one way, we expect it to emerge from where it
 * came." Until now panels, sheets and overlays animated in and then simply
 * vanished. These two helpers give every layer a symmetric exit: the CSS for
 * `[data-presence='out']` describes where a layer rests when it is away, and
 * the same transition carries it there and back.
 *
 * Both are interruptible. Showing a layer that is halfway out reverses it from
 * where it is rather than finishing the exit first.
 */

const exits = new WeakMap<HTMLElement, () => void>()

/** Bring a layer in from its resting "out" state. */
export function present(layer: HTMLElement): void {
  cancelExit(layer)
  const wasHidden = layer.hidden
  layer.hidden = false
  if (wasHidden) {
    // Start from the resting state so there is something to transition from.
    layer.dataset.presence = 'out'
    void layer.offsetWidth
  }
  layer.dataset.presence = 'in'
}

/** Send a layer out, and hide it once it has arrived there. */
export function dismiss(layer: HTMLElement, after?: () => void): void {
  if (layer.hidden) {
    after?.()
    return
  }
  cancelExit(layer)
  layer.dataset.presence = 'out'

  const duration = longestTransition(layer)
  if (duration === 0) {
    finish(layer, after)
    return
  }

  // `transitionend` can be missed (an interrupted or a zero-length property),
  // so a timer is the backstop rather than the mechanism.
  const timer = window.setTimeout(() => finish(layer, after), duration + 40)
  exits.set(layer, () => window.clearTimeout(timer))
}

/** True while a layer is visible or on its way in. */
export function isPresent(layer: HTMLElement): boolean {
  return !layer.hidden && layer.dataset.presence !== 'out'
}

function finish(layer: HTMLElement, after?: () => void): void {
  exits.delete(layer)
  if (layer.dataset.presence === 'out') layer.hidden = true
  after?.()
}

function cancelExit(layer: HTMLElement): void {
  exits.get(layer)?.()
  exits.delete(layer)
}

/** The longest transition on the layer or its direct children, in ms. */
function longestTransition(layer: HTMLElement): number {
  let longest = 0
  for (const element of [layer, ...Array.from(layer.children)]) {
    const style = getComputedStyle(element)
    const durations = style.transitionDuration.split(',').map(seconds)
    const delays = style.transitionDelay.split(',').map(seconds)
    durations.forEach((duration, index) => {
      longest = Math.max(longest, duration + (delays[index] ?? 0))
    })
  }
  return longest
}

function seconds(value: string): number {
  const number = parseFloat(value)
  if (!Number.isFinite(number)) return 0
  return value.trim().endsWith('ms') ? number : number * 1000
}
