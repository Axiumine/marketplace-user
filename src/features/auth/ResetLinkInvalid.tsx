import { Link } from '@tanstack/react-router'

/**
 * The one way out of a reset that cannot proceed, written once because it is reached from two places.
 *
 * A hash that the server refused (wrong, spent, or older than 60 minutes) and a link that arrived without
 * its fragment are the same situation for the person reading the page: the link they have is not going to
 * work and they need another one. `ResetConfirmForm` shows this under the server's message, the confirm
 * route shows it instead of the form, and both say the same sentence because it is this component.
 *
 * ⚠️ **No `FormStatus` here, deliberately.** The status element stays where each caller puts it: inside
 * the form it must be mounted before the message appears, or the live region announces nothing (see
 * `FormStatus`). This is only the explanation and the link out.
 */
export const ResetLinkInvalid = () => (
	<p className="text-sm text-slate-600">
		A reset link stops working 60 minutes after it is sent, and again once it has been used.{' '}
		<Link to="/reset-password" className="underline">
			Ask for a new one
		</Link>
		.
	</p>
)
