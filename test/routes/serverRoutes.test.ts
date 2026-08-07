import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The three **server** routes — `/robots.txt`, `/sitemap.xml` and `/sitemaps/:kind/:cursor`.
 *
 * ⚠️ These are the only files under `src/routes/` with a body, and the only ones this suite touches.
 * The `.tsx` siblings are one-line `createFileRoute(id)(options)` calls and are excluded from both
 * gates; these three are excluded from **coverage** (the whole directory is) but mutated, so this file
 * is the only thing standing between their cache headers, their route ids and a silent 100.
 *
 * `createFileRoute` is mocked rather than driven for real. Un-mocked it returns a `Route` whose `id` is
 * not readable until the generated tree calls `init()`, so the route id — the one token whose mutant
 * turns `/robots.txt` into `""` — would be unassertable. The mock keeps the id and the options object
 * exactly as the module passed them, which is the whole contract these files have with the framework.
 *
 * ⚠️ Every module is imported **inside** the test, after `vi.resetModules()`. All three files do their
 * work at module scope, so their mutants are static: a top-level import would evaluate them once, before
 * Stryker activates anything, and every one of those mutants would survive a suite that asserts the
 * right things.
 */

const mocks = vi.hoisted(() => ({
	createFileRoute: vi.fn((id: string) => (options: unknown) => ({ id, options })),
	createSsrClient: vi.fn(() => ({ marker: 'ssr-client' })),
	collectIndexPaths: vi.fn(async () => ['/sitemaps/companies/start']),
	fetchShard: vi.fn(async () => ({ paths: ['/shop/one', '/shop/two'] })),
	isSitemapKind: vi.fn((value: string) => value === 'companies'),
	sitemapIndexXml: vi.fn((paths: readonly string[]) => `<index>${paths.join('|')}</index>`),
	urlsetXml: vi.fn((paths: readonly string[]) => `<urlset>${paths.join('|')}</urlset>`),
	xmlResponse: vi.fn((body: string) => new Response(body, { headers: { 'x-from': 'xmlResponse' } }))
}))

vi.mock('@tanstack/react-router', () => ({ createFileRoute: mocks.createFileRoute }))
vi.mock('@/api/ssr', () => ({ createSsrClient: mocks.createSsrClient }))
vi.mock('@/lib/sitemap', () => ({
	collectIndexPaths: mocks.collectIndexPaths,
	fetchShard: mocks.fetchShard,
	isSitemapKind: mocks.isSitemapKind,
	sitemapIndexXml: mocks.sitemapIndexXml,
	urlsetXml: mocks.urlsetXml,
	xmlResponse: mocks.xmlResponse
}))

interface FakeRoute {
	readonly id: string
	readonly options: {
		readonly server: {
			readonly handlers: {
				readonly GET: (ctx: { params: { kind: string; cursor: string } }) => Response | Promise<Response>
			}
		}
	}
}

/**
 * ⚠️ Three helpers with three **literal** specifiers, not one helper taking the path as an argument.
 *
 * `import(someVariable)` is not statically analysable, so Vite cannot rewrite it into its own module
 * runner call and the module ends up outside the registry `vi.resetModules()` clears. The suite still
 * passes — the module loads and its exports are real — but it is the *first* evaluation every time,
 * which under Stryker means the un-mutated one: the whole file scored 5% with every module-scope
 * mutant surviving and every handler-body mutant reported as uncovered, while these same assertions
 * were green. Measured, not guessed.
 */
const loadRobots = async (): Promise<FakeRoute> =>
	((await import('../../src/routes/robots[.]txt')) as { Route: unknown }).Route as FakeRoute

const loadSitemapIndex = async (): Promise<FakeRoute> =>
	((await import('../../src/routes/sitemap[.]xml')) as { Route: unknown }).Route as FakeRoute

const loadSitemapShard = async (): Promise<FakeRoute> =>
	((await import('../../src/routes/sitemaps.$kind.$cursor')) as { Route: unknown }).Route as FakeRoute

beforeEach(() => {
	vi.resetModules()
	// `restoreMocks` in vitest.config.ts only reaches spies created by `vi.spyOn`; these are plain
	// `vi.fn`s built in a `vi.hoisted` block, so their call history is ours to clear.
	vi.clearAllMocks()
})

describe('/robots.txt', () => {
	it('registers the literal path, not a nested segment', async () => {
		const route = await loadRobots()

		expect(route.id).toBe('/robots.txt')
	})

	it('serves the five disallow lines and the sitemap pointer, in order', async () => {
		const route = await loadRobots()

		const body = await (await route.options.server.handlers.GET({ params: { kind: '', cursor: '' } })).text()

		expect(body).toBe(
			[
				'User-agent: *',
				'Disallow: /account',
				'Disallow: /login',
				'Disallow: /register',
				'Disallow: /reset-password',
				'',
				'Sitemap: http://127.0.0.1:3045/sitemap.xml',
				''
			].join('\n')
		)
	})

	it('does not disallow /search — a blocked URL never gets to read its own noindex', async () => {
		const route = await loadRobots()

		const body = await (await route.options.server.handlers.GET({ params: { kind: '', cursor: '' } })).text()

		expect(body).not.toContain('/search')
	})

	it('answers as plain text, cacheable by the shared cache for an hour', async () => {
		const route = await loadRobots()

		const response = await route.options.server.handlers.GET({ params: { kind: '', cursor: '' } })

		expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
		expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
	})
})

describe('/sitemap.xml', () => {
	it('registers the escaped literal path rather than /sitemap/xml', async () => {
		const route = await loadSitemapIndex()

		expect(route.id).toBe('/sitemap.xml')
	})

	it('renders the index from a request-scoped SSR client', async () => {
		const route = await loadSitemapIndex()

		const response = await route.options.server.handlers.GET({ params: { kind: '', cursor: '' } })

		expect(mocks.collectIndexPaths).toHaveBeenCalledWith({ marker: 'ssr-client' })
		expect(mocks.sitemapIndexXml).toHaveBeenCalledWith(['/sitemaps/companies/start'])
		expect(await response.text()).toBe('<index>/sitemaps/companies/start</index>')
		expect(response.headers.get('x-from')).toBe('xmlResponse')
	})
})

describe('/sitemaps/$kind/$cursor', () => {
	it('registers both path parameters', async () => {
		const route = await loadSitemapShard()

		expect(route.id).toBe('/sitemaps/$kind/$cursor')
	})

	it('renders one shard for a known kind, passing the cursor through untouched', async () => {
		const route = await loadSitemapShard()

		const response = await route.options.server.handlers.GET({ params: { kind: 'companies', cursor: 'abc123' } })

		expect(mocks.fetchShard).toHaveBeenCalledWith({ marker: 'ssr-client' }, 'companies', 'abc123')
		expect(mocks.urlsetXml).toHaveBeenCalledWith(['/shop/one', '/shop/two'])
		expect(await response.text()).toBe('<urlset>/shop/one|/shop/two</urlset>')
		expect(response.headers.get('x-from')).toBe('xmlResponse')
	})

	it('404s an unknown kind instead of answering an empty urlset', async () => {
		const route = await loadSitemapShard()

		const response = await route.options.server.handlers.GET({ params: { kind: 'nope', cursor: 'start' } })

		expect(response.status).toBe(404)
		expect(await response.text()).toBe('Not found')
		// The 404 is decided before any query is issued — an unknown kind must not reach the backend.
		expect(mocks.fetchShard).not.toHaveBeenCalled()
		expect(mocks.xmlResponse).not.toHaveBeenCalled()
	})
})
