import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `serve.mjs` — `yarn start`, and the only source file in this repo outside `src/`.
 *
 * It is forty-seven lines with no exports: three top-level statements that read `PORT`, refuse
 * anything that is not a usable port, and hand the build's `fetch` to srvx. Nothing imports it, so
 * the only way to exercise it is to import it for its side effects, once per case, with `srvx` and
 * `process.exit` replaced — which is what the helper below does.
 *
 * ⚠️ **`vi.resetModules()` before every import is what makes the cases independent.** A module is
 * evaluated once per registry, so without the reset the second `import()` returns the first case's
 * cached module and asserts nothing at all — while passing, because the first case already called
 * `serve`. The reset applies to the handler double as well, which is why its `fetch` is read back
 * *after* each boot rather than imported at the top of this file: a top-level import would hold the
 * first registry's function and compare it against a later one, which is a difference no message
 * can show.
 */

const { serve } = vi.hoisted(() => ({ serve: vi.fn() }))

vi.mock('srvx/node', () => ({ serve }))

/** What a real `process.exit` does to the lines after it, in a form a test can observe. */
class Exited extends Error {
	readonly code: number | undefined

	constructor(code: number | undefined) {
		super(`process.exit(${code})`)
		this.code = code
	}
}

let exit: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
let log: ReturnType<typeof vi.spyOn>

beforeEach(() => {
	serve.mockClear()
	exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
		throw new Exited(code as number | undefined)
	})
	error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
	log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
	vi.unstubAllEnvs()
})

/** Boot the adapter with one `PORT` value — `undefined` for a variable that is not set at all. */
const boot = async (port: string | undefined): Promise<void> => {
	vi.stubEnv('PORT', port)
	vi.resetModules()

	// @ts-expect-error - plain JavaScript with no declaration file, and none is wanted: what this
	// import is for is the module's side effects, and typing them would mean typing `undefined`.
	await import('../serve.mjs')
}

/** The `fetch` the double exported into the registry the adapter was just booted in. */
const servedHandler = async (): Promise<unknown> => (await import('./doubles/ssrHandler')).default.fetch

/** Boot on a port that is served, and answer with what srvx was handed. */
const bootServed = async (port: string): Promise<Record<string, unknown>> => {
	await boot(port)

	expect(serve).toHaveBeenCalledTimes(1)

	return serve.mock.calls[0]?.[0] as Record<string, unknown>
}

/** Boot expecting the refusal, and answer with the message it printed. */
const bootRefused = async (port: string | undefined): Promise<string> => {
	await expect(boot(port)).rejects.toThrow(Exited)

	expect(exit).toHaveBeenCalledWith(1)
	expect(serve).not.toHaveBeenCalled()
	expect(log).not.toHaveBeenCalled()
	expect(error).toHaveBeenCalledTimes(1)

	return String(error.mock.calls[0]?.[0])
}

describe('the SSR adapter', () => {
	it('serves the build handler on the configured port, bound to loopback', async () => {
		// The handler by identity, not a wrapper around it: forwarding the build's own `fetch` is the
		// whole job of this file, and an adapter that rebuilt it would answer every request itself.
		expect(await bootServed('3045')).toStrictEqual({
			fetch: await servedHandler(),
			port: 3045,
			hostname: '127.0.0.1'
		})
		expect(exit).not.toHaveBeenCalled()
	})

	it('says where it is listening, on the address it actually bound', async () => {
		await boot('3045')

		expect(log).toHaveBeenCalledWith('marketplace-user SSR listening on http://127.0.0.1:3045')
	})

	// ⚠️ 127.0.0.1 rather than 0.0.0.0 is a security property, not a default — this process has no
	// authentication of its own, so reachable from the LAN it is a way around every rate limit and
	// cache rule nginx enforces in front of it. Asserted on its own so that widening it fails here
	// and not only in a message somebody could dismiss as cosmetic.
	it('never binds an address other than the loopback one', async () => {
		expect((await bootServed('1')).hostname).toBe('127.0.0.1')
	})

	it('refuses a PORT that is not set, naming what it read', async () => {
		expect(await bootRefused(undefined)).toBe('PORT must be an integer between 1 and 65535, got undefined')
	})

	it('refuses a PORT that is not a number, quoting it back', async () => {
		expect(await bootRefused('http')).toBe('PORT must be an integer between 1 and 65535, got "http"')
	})

	// `Number('')` is 0, not NaN, so an empty variable is refused by the lower bound rather than by the
	// integer check — the two arms are different code and this is the one that reaches the second.
	it('refuses an empty PORT', async () => {
		expect(await bootRefused('')).toBe('PORT must be an integer between 1 and 65535, got ""')
	})

	it('refuses a fractional PORT', async () => {
		expect(await bootRefused('3045.5')).toBe('PORT must be an integer between 1 and 65535, got "3045.5"')
	})

	// The four boundary values, in pairs, because every one of them is one character away from the
	// other member of its pair: 0 is refused and 1 is served, 65536 is refused and 65535 is served.
	it('refuses port 0 and serves port 1', async () => {
		expect(await bootRefused('0')).toBe('PORT must be an integer between 1 and 65535, got "0"')

		expect(await bootServed('1')).toStrictEqual({
			fetch: await servedHandler(),
			port: 1,
			hostname: '127.0.0.1'
		})
	})

	it('refuses port 65536 and serves port 65535', async () => {
		expect(await bootRefused('65536')).toBe('PORT must be an integer between 1 and 65535, got "65536"')

		expect(await bootServed('65535')).toStrictEqual({
			fetch: await servedHandler(),
			port: 65535,
			hostname: '127.0.0.1'
		})
	})

	it('refuses a negative PORT', async () => {
		expect(await bootRefused('-1')).toBe('PORT must be an integer between 1 and 65535, got "-1"')
	})
})
