/** Paid search is a deployment opt-in, including saved legacy credentials. */
export const paidSearchAllowed = () => process.env.GUANYU_ALLOW_PAID_SEARCH === 'true';
// Homepage search has its own switch. A saved search key and account eligibility
// already govern access; this switch can explicitly disable the feature.
export const deepseekNewsSearchAllowed = () => process.env.GUANYU_ALLOW_DEEPSEEK_NEWS_SEARCH !== 'false';

export const customWebResearchEnabled = () => process.env.GUANYU_CUSTOM_WEB_RESEARCH !== 'false';

export function effectiveSearchMode(mode: string) {
  return mode === 'native' && !paidSearchAllowed() ? 'agent' : mode;
}
