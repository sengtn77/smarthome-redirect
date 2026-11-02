/**
 * Decides where the OAuth redirect page should forward the browser.
 *
 * Returns the candidate redirect URL, or `null` if the input is invalid. The
 * result may still be rejected by `location.replace` (unparseable URL), and the
 * caller must treat that throw as invalid.
 *
 * @param {string} search The page's `location.search`, including the leading `?`.
 * @returns {string | null}
 */
export function resolveTarget(search) {
  try {
    const state = JSON.parse(new URLSearchParams(search).get('state'));
    const target = String(state.r);
    if (/^(exp|exps|smarthome):\/\//.test(target)) {
      const hasQuery = target.indexOf('?') !== -1;
      return target + (hasQuery ? '&' : '') + (hasQuery ? search.slice(1) : search);
    }
  } catch (e) {}
  return null;
}
