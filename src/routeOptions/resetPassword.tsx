import { Link } from '@tanstack/react-router'

import { AuthCard } from '@/features/auth/AuthCard'
import { ResetRequestForm } from '@/features/auth/ResetRequestForm'
import { headFor } from '@/lib/seo'

/**
 * `/reset-password` — the first half of recovery: ask for the mail.
 *
 * The second half lives at `/reset-password/$email/$hash`, which is the link the mail contains. Two
 * routes rather than one screen with a mode flag, because the two halves are reached in different
 * sessions, on different devices as often as not, and share no state whatsoever.
 */
const head = () =>
	headFor({
		title: 'Reset your password',
		description: 'Ask for a link to set a new password.',
		path: '/reset-password',
		noIndex: true
	})

const ResetPassword = () => (
	<AuthCard
		title="Reset your password"
		intro="Enter the address you registered with and we will send you a link to set a new password."
		footer={
			<>
				Remembered it?{' '}
				<Link to="/login" className="underline">
					Sign in
				</Link>
				.
			</>
		}
	>
		<ResetRequestForm />
	</AuthCard>
)

export const resetPasswordRouteOptions = { head, component: ResetPassword }
