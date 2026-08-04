import { z } from 'zod'

/**
 * The password rules, in one place, mirroring `checkPwdLen` in `@axiumine/koa-utils`.
 *
 * ⚠️ **72 is a bcrypt limit, not a policy choice.** bcrypt silently truncates its input at 72 *bytes* —
 * a longer password is accepted and every character past the 72nd is ignored, so two different
 * passphrases can log into the same account. Rejecting the input is the only honest handling; raising
 * the number here without changing the hash function would produce exactly that bug.
 *
 * ⚠️ It counts **bytes**, and the field the customer types into counts characters. An accented Italian
 * password ("perché…") spends two bytes per accent, so a 70-character passphrase can be 75 bytes and
 * fail server-side while passing a `.max(72)` on the string. `TextEncoder` is what the two sides agree
 * on.
 *
 * Minimum 10 with no composition rules — no "one uppercase, one symbol". Modern guidance (NIST SP
 * 800-63B) drops those outright: they push people towards `Password1!` and towards writing it down,
 * while length is what actually costs an attacker anything.
 */
export const MIN_PWD_LENGTH = 10
export const MAX_PWD_BYTES = 72

const byteLength = (value: string): number => new TextEncoder().encode(value).length

export const PASSWORD_HINT = `At least ${String(MIN_PWD_LENGTH)} characters. Length beats symbols: a phrase you can remember is stronger than a short password full of punctuation.`

export const passwordSchema = z
	.string()
	.min(MIN_PWD_LENGTH, `Use at least ${String(MIN_PWD_LENGTH)} characters.`)
	.refine((value) => byteLength(value) <= MAX_PWD_BYTES, 'That password is too long. Try a shorter phrase.')

/**
 * Adds the "the two fields match" check to a schema that already has both.
 *
 * A `superRefine` rather than a `.refine` on the object, because the error has to land on the *second*
 * field: an object-level issue has no path, and react-hook-form renders it nowhere, leaving a form that
 * refuses to submit with nothing on screen explaining why.
 */
export const matchingPasswords = <T extends { password: string; repeatPassword: string }>(
	value: T,
	ctx: z.RefinementCtx
): void => {
	if (value.password === value.repeatPassword) return

	ctx.addIssue({ code: 'custom', path: ['repeatPassword'], message: 'The two passwords do not match.' })
}
