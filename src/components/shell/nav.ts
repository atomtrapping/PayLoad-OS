/**
 * The primary navigation as data. Payload OS is the terminal; the products are
 * the Caravan, Tradewind and Landshark APIs, so the products lead and the means
 * of production follow. Every page route appears here exactly once, which is
 * what lets the top bar name where you are; nav.test.ts holds that true.
 * Acquisitions live on the rail page, so that area opens it at its section.
 */
export interface NavItem { href: string; label: string; match: RegExp }
export interface NavArea { id: 'products' | 'acquisition' | 'corpus' | 'notations' | 'inquiry' | 'coordination'; label: string; activity: string; items: readonly NavItem[] }

export const NAV_AREAS: readonly NavArea[] = [
  { id: 'products', label: 'Products', activity: 'The three APIs, what they deliver, and how a customer reads them', items: [
    { href: '/products', label: 'Products', match: /^\/products/ },
    { href: '/api', label: 'API', match: /^\/api/ },
    { href: '/stream', label: 'Stream', match: /^\/stream/ },
    { href: '/releases', label: 'Releases', match: /^\/releases/ },
    { href: '/retractions', label: 'Retractions', match: /^\/retractions/ },
    { href: '/model', label: 'Operating model', match: /^\/(model|product)$/ },
  ] },
  { id: 'acquisition', label: 'Acquisition', activity: 'Coverage, sources, collection attempts and failures', items: [
    { href: '/candidates#cp-acquisitions', label: 'Acquisitions', match: /^\/candidates/ },
    { href: '/evidence', label: 'Evidence', match: /^\/evidence/ },
  ] },
  { id: 'corpus', label: 'Corpus', activity: 'How a product\u2019s corpus is made: candidates, builds and the path', items: [
    { href: '/production', label: 'Production', match: /^\/production/ },
    { href: '/candidates', label: 'Candidates', match: /^\/candidates/ },
  ] },
  { id: 'notations', label: 'Notations', activity: 'Author, relate and preserve interpretations', items: [
    { href: '/notations', label: 'Notations', match: /^\/notations/ },
  ] },
  { id: 'inquiry', label: 'Inquiry', activity: 'Explore evidence, compare observations, investigate questions', items: [
    { href: '/frontier', label: 'Frontier Wedges', match: /^\/frontier/ },
    { href: '/cases', label: 'Cases', match: /^\/cases/ },
    { href: '/rulings', label: 'Rulings', match: /^\/rulings/ },
    { href: '/factoring', label: 'Factoring Desk', match: /^\/factoring/ },
    { href: '/dispatch-liability', label: 'Dispatch Liability', match: /^\/dispatch-liability/ },
    { href: '/replay', label: 'Replay', match: /^\/replay/ },
    { href: '/profiles', label: 'Profiles', match: /^\/profiles/ },
    { href: '/earth', label: 'Earth Twin', match: /^\/earth/ },
    { href: '/spatial', label: 'Spatial Inquiry', match: /^\/spatial/ },
    { href: '/compute/observations', label: 'Observations', match: /^\/compute\/observations/ },
    { href: '/compute/registration', label: 'Registration', match: /^\/compute\/registration/ },
    { href: '/compute/clearance', label: 'Clearance', match: /^\/compute\/clearance/ },
  ] },
  { id: 'coordination', label: 'Coordination', activity: 'Participants, requests, results and blockers', items: [
    { href: '/agents', label: 'Stable', match: /^\/agents/ },
    { href: '/board', label: 'Board', match: /^\/board/ },
  ] },
];

export const PRIMARY_NAV = NAV_AREAS.flatMap((a) => a.items);

/** The area and item a path belongs to, for the top bar's context line. */
export function locate(pathname: string): { area: NavArea; item: NavItem } | null {
  for (const area of NAV_AREAS) for (const item of area.items) if (item.match.test(pathname) && !item.href.includes('#')) return { area, item };
  for (const area of NAV_AREAS) for (const item of area.items) if (item.match.test(pathname)) return { area, item };
  return null;
}
