/** Paid search is a deployment opt-in, including saved legacy credentials. */
export const paidSearchAllowed = () => process.env.GUANYU_ALLOW_PAID_SEARCH === 'true';
export const customWebResearchEnabled = () => process.env.GUANYU_CUSTOM_WEB_RESEARCH !== 'false';

export function effectiveSearchMode(mode: string) {
  return mode === 'native' && !paidSearchAllowed() ? 'agent' : mode;
}
