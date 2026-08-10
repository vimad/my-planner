// Mongoose surfaces a unique-index violation as a driver-level error with
// code 11000 (not a typed exception) — this narrows an unknown catch value
// to that shape so route handlers can turn it into a 409 instead of falling
// through to the generic 500 handler.
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000
}
