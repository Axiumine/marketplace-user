import type { ReactElement } from 'react'

import { AccountGate } from '@/features/account/AccountGate'

import type { GraphQLReplies } from './graphql'
import { stubGraphQL } from './graphql'
import type { MeFixture } from './me'
import { FULL_ME, meReply } from './me'
import type { RouterRenderResult } from './render'
import { CUSTOMER_EMAIL, renderWithRouter } from './render'

export interface AccountRenderOptions {
	/** The account the gate loads. */
	me?: MeFixture
	/** Replies for whatever the screen under test sends, merged over the `Me` reply. */
	replies?: GraphQLReplies
	path?: string
}

export interface AccountRenderResult extends RouterRenderResult {
	readonly stub: ReturnType<typeof stubGraphQL>
}

/**
 * Mounts a private-area screen inside the real `AccountGate`.
 *
 * The gate is not stubbed out and `MeContext` is not provided by hand: `useMe` is non-nullable precisely
 * because the gate resolved it, and a test that supplied the context directly would assert against a
 * shape no request ever produced. It also means every screen here is exercised through the same `Me`
 * query, the same auth exchange and the same cache the app ships.
 */
export const renderInAccount = async (
	ui: ReactElement,
	{ me = FULL_ME, replies = {}, path = '/account' }: AccountRenderOptions = {}
): Promise<AccountRenderResult> => {
	const stub = stubGraphQL({ ...meReply(me), ...replies })
	const result = await renderWithRouter(<AccountGate>{ui}</AccountGate>, {
		token: 'access-token',
		session: CUSTOMER_EMAIL,
		path
	})

	return { ...result, stub }
}
