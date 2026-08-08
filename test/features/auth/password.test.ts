import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { matchingPasswords, MAX_PWD_BYTES, MIN_PWD_LENGTH, PASSWORD_HINT, passwordSchema } from '@/features/auth/password'

const failureOf = (value: string): string | undefined => {
	const result = passwordSchema.safeParse(value)
	return result.success ? undefined : result.error.issues[0]?.message
}

const repeated = (character: string, times: number): string => character.repeat(times)

describe('passwordSchema length', () => {
	it('accepts a passphrase at the minimum', () => {
		expect(failureOf(repeated('a', MIN_PWD_LENGTH))).toBeUndefined()
	})

	it('rejects one character short of it', () => {
		expect(failureOf(repeated('a', MIN_PWD_LENGTH - 1))).toBe('Use at least 10 characters.')
	})

	it('rejects the empty string', () => {
		expect(failureOf('')).toBe('Use at least 10 characters.')
	})

	/*
	 * ⚠️ 72 is a **bcrypt** limit, not a policy choice: bcrypt silently truncates at 72 bytes, so a longer
	 * password is accepted with everything past the 72nd byte ignored — and two different passphrases then
	 * log into the same account. Rejecting the input is the only honest handling.
	 */
	it('accepts a password exactly at the bcrypt limit', () => {
		expect(failureOf(repeated('a', MAX_PWD_BYTES))).toBeUndefined()
	})

	it('rejects one byte past it', () => {
		expect(failureOf(repeated('a', MAX_PWD_BYTES + 1))).toBe('That password is too long. Try a shorter phrase.')
	})
})

describe('passwordSchema byte counting', () => {
	/*
	 * ⚠️ The limit counts **bytes** and the field counts characters. An accented passphrase spends
	 * two bytes per accent, so a `.max(72)` on the string would pass a 70-character password that the
	 * server rejects at 75 bytes — a failure the customer cannot see the cause of. `TextEncoder` is what
	 * the two sides agree on.
	 */
	it('counts a two-byte character twice', () => {
		// 36 × 'é' is 36 characters and 72 bytes: at the limit, and one more would exceed it.
		expect(failureOf(repeated('é', 36))).toBeUndefined()
		expect(failureOf(repeated('é', 37))).toBe('That password is too long. Try a shorter phrase.')
	})

	it('counts a four-byte character four times', () => {
		// An emoji is one UTF-16 surrogate pair and four UTF-8 bytes. 18 of them fill the limit exactly.
		expect(failureOf(repeated('😀', 18))).toBeUndefined()
		expect(failureOf(repeated('😀', 19))).toBe('That password is too long. Try a shorter phrase.')
	})

	// The minimum is characters, not bytes — an accented phrase is not held to a higher standard than an
	// ASCII one for carrying an accent.
	it('counts characters, not bytes, for the minimum', () => {
		expect(failureOf(repeated('é', MIN_PWD_LENGTH))).toBeUndefined()
	})
})

describe('PASSWORD_HINT', () => {
	it('states the minimum the schema enforces', () => {
		expect(PASSWORD_HINT).toContain(String(MIN_PWD_LENGTH))
	})

	/*
	 * No composition rules — no "one uppercase, one symbol". NIST SP 800-63B drops them outright: they
	 * push people towards `Password1!` and towards writing it down, while length is what actually costs an
	 * attacker anything. The hint has to say that, or somebody adds the rules back.
	 */
	it('tells the customer length beats symbols', () => {
		expect(PASSWORD_HINT).toContain('Length beats symbols')
	})
})

const CONFIRMED = z.object({ password: z.string(), repeatPassword: z.string() }).superRefine(matchingPasswords)

describe('matchingPasswords', () => {
	it('accepts two identical passwords', () => {
		expect(CONFIRMED.safeParse({ password: 'a phrase', repeatPassword: 'a phrase' }).success).toBe(true)
	})

	it('rejects two that differ', () => {
		expect(CONFIRMED.safeParse({ password: 'a phrase', repeatPassword: 'a phrasf' }).success).toBe(false)
	})

	/*
	 * ⚠️ The issue lands on `repeatPassword` and not on the object. An object-level issue has no path, and
	 * react-hook-form renders it nowhere — leaving a form that refuses to submit with nothing on screen to
	 * explain why.
	 */
	it('puts the message on the second field', () => {
		const result = CONFIRMED.safeParse({ password: 'a phrase', repeatPassword: '' })

		expect(result.success).toBe(false)
		expect(result.error?.issues[0]?.path).toEqual(['repeatPassword'])
		expect(result.error?.issues[0]?.message).toBe('The two passwords do not match.')
		/*
		 * ⚠️ `code` is asserted too, because it is the only part of the issue nothing else observes. zod
		 * copies whatever string it is handed straight onto the issue, and react-hook-form copies that onto
		 * `errors.repeatPassword.type` — so a wrong code renders identically and only shows up where a caller
		 * branches on the type, or where a zod error map is asked to translate an issue it has never heard of.
		 */
		expect(result.error?.issues[0]?.code).toBe('custom')
	})

	// Case and whitespace are part of a password. Normalising either here would accept a confirmation the
	// server then rejects at login.
	it('compares exactly', () => {
		expect(CONFIRMED.safeParse({ password: 'A Phrase', repeatPassword: 'a phrase' }).success).toBe(false)
		expect(CONFIRMED.safeParse({ password: 'a phrase ', repeatPassword: 'a phrase' }).success).toBe(false)
	})
})
