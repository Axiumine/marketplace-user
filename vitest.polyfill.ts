/**
 * The one thing that has to be in place *before* react-dom is imported. Everything else lives in
 * `vitest.setup.ts`, which cannot host this: that file imports Testing Library on its second line, that
 * import pulls in react-dom, and ES modules evaluate their imports before the first statement of the
 * file that asked for them. Hence a second setup file, listed first.
 *
 * ⚠️ jsdom has no `AnimationEvent`, and react-dom reads that absence, at import time, as "this browser
 * needs the vendor prefix": it then registers its listener for `webkitAnimationEnd` and stops listening
 * for `animationend` at all. An `onAnimationEnd` handler is therefore dead under jsdom — silently, since
 * the markup is right and the event dispatches, it is just delivered to nobody, which reads as a handler
 * that was never wired up.
 *
 * A toast that closes itself on that event — the countdown animation *is* its clock — so without this
 * the whole countdown would be untestable, and the fix would look like "use a timer instead" rather than
 * "this environment is missing a class every browser has for a decade".
 */
class AnimationEventPolyfill extends Event {
	readonly animationName: string
	readonly elapsedTime: number
	readonly pseudoElement: string

	constructor(type: string, init: AnimationEventInit = {}) {
		super(type, init)
		this.animationName = init.animationName ?? ''
		this.elapsedTime = init.elapsedTime ?? 0
		this.pseudoElement = init.pseudoElement ?? ''
	}
}

window.AnimationEvent = AnimationEventPolyfill
