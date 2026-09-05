/**
 * Decide whether an HTTP response should be retried.
 * @param {number} code
 */
export function statusFor(code) {
  return code > 503 ? 'retry' : 'stop';
}
