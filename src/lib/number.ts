/**
 * `Number.isFinite`, as a type guard.
 *
 * The standard function is declared `(value: unknown) => boolean`, so it narrows nothing: every caller
 * that wants to *use* the value afterwards has to precede it with a `typeof value === 'number'` test
 * whose only job is to satisfy the compiler. That test is dead weight at runtime — `Number.isFinite`
 * does not coerce, so a string, a `null` or an `undefined` fails it on its own — and a dead branch is
 * exactly what neither gate here can pass: it cannot be covered and its mutant cannot be killed.
 *
 * One predicate, asserted once, in one place. `NaN` and both infinities are excluded, which is the
 * point at every call site: a `NaN` is a `number` that passes every type check and plots nowhere.
 */
export const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value)
