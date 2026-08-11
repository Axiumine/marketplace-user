/**
 * Reads the emailed reset credential out of the URL fragment.
 *
 * The mail sends `https://host/reset-password/confirm#/<address>/<hash>`, built by
 * `marketplace-dev-public-resource/src/lib/access/resetPwdFlowUser.mts` — the trailing `#` on
 * `RESET_PATH_USER` is what puts the pair after the `#` rather than in the path. A fragment is never
 * transmitted (RFC 3986 §3.5), so this is the only reader of it on the platform: no access log, no
 * `Referer`, no proxy cache key and no CDN ever sees these two values.
 *
 * ⚠️ **The caller passes `window.location.hash`, never the router's `location.hash`.** The router runs
 * its copy through `decodePath` (`@tanstack/router-core/dist/esm/router.js:195,211`), which percent-decodes
 * and sanitises before this function could split on `/` — so an escaped separator inside an address would
 * arrive already turned into a real one. The raw fragment is split first and decoded after, in that order.
 *
 * ⚠️ **The hash is taken verbatim and the address is decoded.** koa-utils interpolates the hash raw and
 * the address through `encodeURI` (`SocketLabsLib.mjs:280-283`), and `z.email()` — the only gate a
 * registered address passes, `RegisterForm.tsx:34` — accepts nothing outside ASCII, so `encodeURI` is the
 * identity on every address this platform can hold. Decoding is therefore for links something rewrote in
 * transit rather than for links as sent; decoding the hash as well would corrupt a legitimate one the
 * moment it contained a `%`.
 */
export interface ResetCredential {
	/** The address the link was sent to, decoded. Submitted to the mutation, never rendered. */
	readonly email: string
	/** The one-time hash, exactly as the mail wrote it. Submitted to the mutation, never rendered. */
	readonly hash: string
}

/** What `window.location.hash` holds when the fragment is one this app wrote: `#` then the pair. */
const PREFIX = '#/'

/**
 * `decodeURIComponent` that cannot throw.
 *
 * It raises a `URIError` on a lone `%` and on an escape sequence that is not valid UTF-8 (`%FF`), both
 * of which reach this app as an ordinary URL somebody typed or a mail client mangled. The empty string
 * is the right fallback rather than the input: an address that cannot be decoded is not an address, and
 * the caller already refuses an empty half.
 */
const decodeOrEmpty = (value: string): string => {
	try {
		return decodeURIComponent(value)
	} catch {
		return ''
	}
}

/**
 * The pair, or `undefined` if this fragment is not a reset link.
 *
 * Every rejection is one state for the caller — there is nothing to tell a customer apart from "the link
 * did not arrive whole", and inventing three messages for a truncated link, a missing fragment and a
 * mangled address would say more about the parser than about what to do next.
 */
export const readResetCredential = (fragment: string): ResetCredential | undefined => {
	if (!fragment.startsWith(PREFIX)) return undefined

	const pair = fragment.slice(PREFIX.length)
	const separator = pair.indexOf('/')

	// Exactly one separator. `-1` is a fragment with no hash at all, and `slice` would read that as an
	// offset from the end and hand back a plausible-looking pair built from a link that has none.
	if (separator === -1 || pair.includes('/', separator + 1)) return undefined

	const email = decodeOrEmpty(pair.slice(0, separator))
	const hash = pair.slice(separator + 1)

	// An empty half is a link that lost a segment somewhere, or an address that would not decode. Neither
	// is worth a round trip: the server answers both with the same flat 403 a spent hash gets.
	if (email === '' || hash === '') return undefined

	return { email, hash }
}
