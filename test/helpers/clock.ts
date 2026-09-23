/**
 * A clock a test can move by hand, for asserting a timing window's edges on exact milliseconds rather than
 * racing the real one.
 */
export const clock = (start = 0): { now: () => number; advance: (ms: number) => number } => {
	let current = start
	return { now: () => current, advance: (ms: number) => (current += ms) }
}
