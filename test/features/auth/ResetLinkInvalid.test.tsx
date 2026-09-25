import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ResetLinkInvalid } from '@/features/auth/ResetLinkInvalid'

import { installOnlineListenerGuard } from '../../helpers/onlineListenerGuard'
import { renderWithRouter } from '../../helpers/render'

installOnlineListenerGuard()

describe('ResetLinkInvalid', () => {
	/*
	 * ⚠️ The sentence is read whole, spaces included. The `{' '}` between the text and the link is the only
	 * thing holding them apart — JSX drops the newline itself — so losing it renders "…has been used.Ask for
	 * a new one." with the link swallowing the first word. Asserting the link and the text separately passes
	 * on exactly that markup.
	 */
	it('names the two ways a link stops working, and the way out of both', async () => {
		await renderWithRouter(<ResetLinkInvalid />)

		const link = screen.getByRole('link', { name: 'Ask for a new one' })

		expect(link).toHaveAttribute('href', '/reset-password')
		expect(link.closest('p')?.textContent).toBe(
			'A reset link stops working 60 minutes after it is sent, and again once it has been used. Ask for a new one.'
		)
	})

	/*
	 * ⚠️ It says nothing about *why* this particular link failed, and that is deliberate rather than lazy.
	 * The server answers a wrong hash, a spent hash and an expired hash with one flat 403 so that nothing
	 * on this page reveals whether an address is registered — and the fragment reader cannot tell a
	 * truncated link from one that was never valid either.
	 */
	it('does not claim to know which of them happened', async () => {
		const { container } = await renderWithRouter(<ResetLinkInvalid />)

		expect(container.textContent).not.toMatch(/expired|invalid|already used/i)
	})

	it('matches the snapshot', async () => {
		const { container } = await renderWithRouter(<ResetLinkInvalid />)

		expect(container.firstChild).toMatchSnapshot()
	})
})
