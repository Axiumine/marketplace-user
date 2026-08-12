import { Link } from '@tanstack/react-router'

import { AuthCard } from '@/features/auth/AuthCard'
import { RegisterForm } from '@/features/auth/RegisterForm'
import { headFor } from '@/lib/seo'

/**
 * `/register`.
 *
 * `noIndex` for the same reason as `/login`, plus one specific to this page: a registration form that
 * ranks is a registration form that bots find. The Turnstile widget and the server-side rate limiter are
 * the defences that matter, but there is no reason to advertise the target as well.
 *
 * The intro line says what the account is *for* before asking for an address. "Create an account" with
 * two fields under it and no stated benefit is the highest-abandonment screen in any funnel.
 */
const head = () =>
	headFor({
		title: 'Create an account',
		description: 'Create an account to save your addresses and order faster.',
		path: '/register',
		noIndex: true
	})

const Register = () => (
	<AuthCard
		title="Create an account"
		intro="Save your addresses once and reuse them. Email and a password is all it takes to start."
		footer={
			<>
				<p>
					Already registered?{' '}
					<Link to="/login" className="underline">
						Sign in
					</Link>
					.
				</p>
				{/* The other half of the choice. It is offered here rather than only in the footer because
				    this is the page a seller lands on when they search for "register": the account this form
				    creates cannot be turned into a shop-owner one later, and the address it consumes cannot
				    be registered again. */}
				<p className="mt-1">
					Want to sell here instead?{' '}
					<Link to="/register/seller" className="underline">
						Apply for a shop-owner account
					</Link>
					.
				</p>
			</>
		}
	>
		<RegisterForm />
	</AuthCard>
)

export const registerRouteOptions = { head, component: Register }
