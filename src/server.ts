import type { Register } from '@tanstack/react-router'
import type { RequestHandler } from '@tanstack/react-start/server'
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'

import { cacheControlFor } from '@/lib/cachePolicy'

/**
 * The SSR entry, and the one place the HTML cache policy is applied.
 *
 * TanStack Start would supply this file itself; it is written out to wrap the handler in the two headers
 * below. Everything else is the default: `createStartHandler` + `defaultStreamHandler`, streaming the
 * shell as soon as it exists rather than waiting for every loader.
 *
 * ⚠️ **The policy itself is in `src/lib/cachePolicy.ts` and not here.** This file is excluded from
 * coverage and mutation as a framework entry point, and a rule about who may be served another visitor's
 * page does not belong behind that exclusion. What is left here is plumbing: call, ask, set, return.
 */
const handler = createStartHandler(defaultStreamHandler)

const fetch: RequestHandler<Register> = async (request, opts) => {
	const response = await handler(request, opts)
	const cacheControl = cacheControlFor(request, response)

	if (cacheControl !== undefined) {
		response.headers.set('cache-control', cacheControl)
		// Signed-in and anonymous responses differ, so any shared cache in front must key on that. It
		// cannot be told to key on the cookie's *value* — that would be one cache entry per visitor — so
		// nginx bypasses instead, and this header is the standards-conformant statement of the same fact
		// for anything else in the path.
		response.headers.set('vary', 'cookie')
	}

	return response
}

export default { fetch }
