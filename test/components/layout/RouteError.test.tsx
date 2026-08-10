import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CombinedError } from '@urql/core'
import { GraphQLError } from 'graphql'
import { describe, expect, it, vi } from 'vitest'

import { RouteError } from '@/components/layout/RouteError'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { renderWithRouter } from '../../helpers/render'

const HOME: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } }
}

const GENERIC = 'Error while communicating with the server'

const mount = async (error: Error) => {
	const reset = vi.fn()
	stubGraphQL(HOME)
	const result = await renderWithRouter(<RouteError error={error} reset={reset} />)

	return { ...result, reset }
}

/** A urql error the way the exchanges build one, with the platform's `http.status` transport on it. */
const graphQLFailure = (message: string, extensions: Record<string, unknown> = {}) =>
	new CombinedError({ graphQLErrors: [new GraphQLError(message, { extensions })] })

describe('RouteError', () => {
	it('says something went wrong', async () => {
		await mount(new Error('boom'))

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong')
	})

	it('offers a way back to the home page', async () => {
		await mount(new Error('boom'))

		expect(screen.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/')
	})

	/*
	 * `reset` re-runs the loader that failed. Most failures here are a transient upstream, and re-running
	 * one loader is a better answer than a reload of the whole document — which on this app means a second
	 * SSR pass through the same upstream that just refused.
	 */
	it('re-runs the loader rather than reloading the document', async () => {
		const { reset } = await mount(new Error('boom'))

		await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

		expect(reset).toHaveBeenCalledTimes(1)
	})
})

describe('RouteError message', () => {
	it("prefers the backend's description", async () => {
		await mount(graphQLFailure('Bad request', { http: { status: 400 }, description: 'That city does not exist' }))

		expect(screen.getByText('That city does not exist')).toBeInTheDocument()
	})

	it('falls back to the error title when there is no description', async () => {
		await mount(graphQLFailure('Shop not available'))

		expect(screen.getByText('Shop not available')).toBeInTheDocument()
	})

	/*
	 * ⚠️ The raw error is never rendered, and this is the assertion that says so. This component runs
	 * inside the SSR pass, so whatever it prints is HTML served to an anonymous visitor — and a urql
	 * transport failure's message carries the internal address of the resource service
	 * (`ECONNREFUSED 127.0.0.1:4027`).
	 */
	it('never puts a network error message on the page', async () => {
		const error = new CombinedError({ networkError: new Error('ECONNREFUSED 127.0.0.1:4027') })
		await mount(error)

		expect(screen.queryByText(/127\.0\.0\.1/)).not.toBeInTheDocument()
		expect(screen.getByText(GENERIC)).toBeInTheDocument()
	})

	/*
	 * ⚠️ The boundary is typed to receive `Error`, not `CombinedError`. A loader may throw a plain one and
	 * a component may throw a string, and reading `.graphQLErrors[0]` off either would throw a *second*
	 * time from inside the boundary meant to contain the first — which React renders as an empty document.
	 */
	it('survives a plain Error, and drops its message', async () => {
		await mount(new Error('Cannot read properties of undefined'))

		expect(screen.getByText(GENERIC)).toBeInTheDocument()
		expect(screen.queryByText(/Cannot read properties/)).not.toBeInTheDocument()
	})

	it('survives a thrown value that is not an Error at all', async () => {
		await mount('the loader threw a string' as unknown as Error)

		expect(screen.getByText(GENERIC)).toBeInTheDocument()
	})
})

describe('RouteError snapshot', () => {
	it('renders', async () => {
		await mount(new Error('boom'))

		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
