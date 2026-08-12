import { Link } from '@tanstack/react-router'

import { AuthCard } from '@/features/auth/AuthCard'
import { SellerRegisterForm } from '@/features/auth/SellerRegisterForm'
import { headFor } from '@/lib/seo'

/**
 * `/register/seller`.
 *
 * ⚠️ **A second registration, not a second way into the first one.** `/register` writes a `user` and
 * this writes a `shopOwner` — two collections, two service pairs, two apps (ADR-002: the role *is* the
 * collection). Nothing later can move an account from one to the other, so the two forms have to be two
 * pages a person chooses between, and the copy on each has to say plainly who it is for.
 *
 * `noIndex` for the reasons `/register` carries it — a registration form that ranks is one bots find —
 * and for one more: this page is an application to trade here, and the queue behind it is an operator's
 * working list rather than an audience to grow.
 */
const head = () =>
	headFor({
		title: 'Sell on Marketplace',
		description: 'Apply for a shop-owner account and start selling on Marketplace.',
		path: '/register/seller',
		noIndex: true
	})

const RegisterSeller = () => (
	<AuthCard
		title="Sell on Marketplace"
		intro="Apply for a shop-owner account. Email and a password to start — your shop, your company details and your catalogue come after we approve you."
		footer={
			<>
				<p>
					Buying rather than selling?{' '}
					<Link to="/register" className="underline">
						Create a customer account
					</Link>
					.
				</p>
				{/* No "already registered? sign in" link, and its absence is deliberate: `/login` on this
				    site signs a customer in against the `user` collection and would refuse a seller with
				    the same message it gives a wrong password. The shop area is a different app on a
				    different address, and the activation email is what carries the link to it. */}
				<p className="mt-1">Shop owners sign in through the link in their activation email — the shop area is a separate app.</p>
			</>
		}
	>
		<SellerRegisterForm />
	</AuthCard>
)

export const registerSellerRouteOptions = { head, component: RegisterSeller }
