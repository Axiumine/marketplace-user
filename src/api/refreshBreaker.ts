/**
 * A small circuit breaker for the refresh mutation, one instance per browser `Client`.
 *
 * During a sustained outage, every operation that hits an expired access token calls `refreshAuth`,
 * which without this would fire a fresh `mutate` at the refresh endpoint on every single one of them —
 * no backoff, no relief for a service that is already down. This tracks *consecutive transport
 * failures* (the refresh mutation never got a response at all) and, past the first one, opens a cooldown
 * window during which the caller is told not to bother the network.
 *
 * ⚠️ **Created inside `createGraphQLClient`, never at module scope.** That function builds one `Client`
 * per browser page load (see src/router.tsx) and is never called during server rendering — `createSsrClient`
 * in src/api/ssr.ts has no auth exchange at all, so `refreshAuth` never runs there. A module-scoped `let`
 * here would still be safe by that same argument, but a factory closed over by the client that owns it is
 * the shape that stays safe even if that assumption ever changes, per ADR-019 (a urql client is built fresh
 * per SSR request — nothing here may be shared across requests the way `src/api/tokenStore.ts` already
 * warns about for the access token itself).
 */

const BASE_MS = 1_000
const CAP_MS = 30_000

export interface RefreshBreaker {
	/** True while the cooldown window opened by a previous transport failure has not yet elapsed. */
	isOpen(): boolean
	/**
	 * Records one more consecutive refresh transport failure and opens a cooldown window of
	 * `min(30_000, 1_000 * 2^(n-1))` ms, `n` being the new consecutive count — 1s, 2s, 4s, … capped at 30s.
	 */
	recordFailure(): void
	/** A refresh minted a token: the outage, if there was one, is over. */
	recordSuccess(): void
}

export interface CreateRefreshBreakerOptions {
	/** Injected for deterministic tests; defaults to the real clock. */
	now?: (() => number) | undefined
}

export const createRefreshBreaker = ({ now = Date.now }: CreateRefreshBreakerOptions = {}): RefreshBreaker => {
	let consecutiveFailures = 0
	let openUntil = 0

	const reset = (): void => {
		consecutiveFailures = 0
		openUntil = 0
	}

	/*
	 * The network coming back is the clearest signal there is that a fresh attempt is worth making —
	 * waiting out the rest of an exponential window after that would only delay the customer's next
	 * screen for no reason. `typeof window` guards the SSR/non-browser case; see the module doc above for
	 * why `refreshAuth`, and therefore this breaker, never actually runs there.
	 */
	if (typeof window !== 'undefined') {
		window.addEventListener('online', reset)
	}

	return {
		isOpen: () => now() < openUntil,
		recordFailure: () => {
			consecutiveFailures += 1
			openUntil = now() + Math.min(CAP_MS, BASE_MS * 2 ** (consecutiveFailures - 1))
		},
		recordSuccess: reset
	}
}
