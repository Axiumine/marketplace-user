import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

/*
 * The `no-restricted-syntax` block in `eslint.config.js`, proved one selector at a time.
 *
 * A rule nobody exercises is a comment, and in this repo it is worse than that: every block in the flat
 * config is scoped to a glob, so a rule filed under the wrong one is inert and reads exactly like a rule
 * that holds. Each fixture below is the *exact* shape the block exists to refuse — including the
 * assignment form the backend audit actually found, which a `Property`-only selector would let through —
 * and the last one is the compliant shape, which must stay silent.
 *
 * ⚠️ **The lint path matters as much as the code.** `lintText` is given a path under `src/`, which is
 * where `Sentry.init` lives and what the block has to cover; passing a bare filename would lint against
 * no glob at all and pass whatever the config said.
 *
 * The fixtures are `.ts.fixture` rather than `.ts` on purpose: a real `.ts` under `test/` would be linted
 * by `yarn lint` and report the very findings it is here to contain, and adding it to `ignores` would
 * then hide it from this suite too.
 */

// Resolved from the working directory rather than from `import.meta.url`: vite rewrites that to a
// non-file URL in the transformed module and `readFile` refuses it. Every script here runs vitest from
// the repo root.
const FIXTURES = join(process.cwd(), 'test/fixtures/restrictedSyntax')

const TLS_MESSAGE = 'E12-S04: certificate verification stays on.'
const PII_MESSAGE = 'E12-S04: the blanket Sentry PII flag is absent by decision, not set to false.'
const HOOKS_MESSAGE = 'E12-S22: `beforeSend` and `beforeSendTransaction` are wired together or not at all.'

const lintFixture = async (name: string) => {
	const code = await readFile(join(FIXTURES, `${name}.ts.fixture`), 'utf8')
	const [result] = await new ESLint().lintText(code, { filePath: 'src/restrictedSyntaxFixture.ts' })

	return (result?.messages ?? []).filter((message) => message.ruleId === 'no-restricted-syntax')
}

describe('the no-restricted-syntax block fires on every shape it names', () => {
	it.each([
		['assignment-reject-unauthorized', TLS_MESSAGE],
		['property-reject-unauthorized', TLS_MESSAGE],
		['computed-property-reject-unauthorized', TLS_MESSAGE],
		['send-default-pii', PII_MESSAGE],
		['member-node-tls-reject-unauthorized', TLS_MESSAGE],
		['literal-node-tls-reject-unauthorized', TLS_MESSAGE],
		['before-send-without-transaction', HOOKS_MESSAGE]
	])('reports %s exactly once', async (fixture, expected) => {
		const messages = await lintFixture(fixture)

		expect(messages).toHaveLength(1)
		expect(messages[0]?.message).toContain(expected)
		expect(messages[0]?.severity).toBe(2)
	})
})

describe('the block stays silent on the shape this app carries', () => {
	it('reports nothing on the compliant init options', async () => {
		expect(await lintFixture('compliant')).toStrictEqual([])
	})
})
