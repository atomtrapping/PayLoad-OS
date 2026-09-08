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
    { href: '/harvester', label: 'Statutory Harvester', match: /^\/harvester/ },
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

/* ── Moving between destinations ── */

/** One destination, with the area it belongs to. The flat order the rail reads in. */
export interface NavDestination { href: string; label: string; area: NavArea['label']; areaId: NavArea['id']; match: RegExp }

/**
 * Every destination in rail order, anchors excluded.
 *
 * An anchor (`/candidates#cp-acquisitions`) is a second way into a page that is
 * already in this list, so including it would make "next" visit the same page
 * twice and a search offer the same page under two names.
 */
export const NAV_DESTINATIONS: readonly NavDestination[] = NAV_AREAS.flatMap((area) =>
  area.items
    .filter((item) => !item.href.includes('#'))
    .map((item) => ({ href: item.href, label: item.label, area: area.label, areaId: area.id, match: item.match })),
);

/** Where a path sits in the flat order, or -1. */
export function indexOf(pathname: string): number {
  return NAV_DESTINATIONS.findIndex((entry) => entry.match.test(pathname));
}

/**
 * The destination `delta` steps away, wrapping.
 *
 * Wrapping rather than stopping because the rail is a ring of places to be
 * rather than a list with an end: someone stepping past the last area wants the
 * first, not nothing happening.
 */
export function step(pathname: string, delta: number): NavDestination | null {
  if (NAV_DESTINATIONS.length === 0) return null;
  const at = indexOf(pathname);
  const from = at < 0 ? 0 : at;
  const next = (from + delta) % NAV_DESTINATIONS.length;
  return NAV_DESTINATIONS[next < 0 ? next + NAV_DESTINATIONS.length : next];
}

export interface NavMatch { destination: NavDestination; score: number }

const norm = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Rank destinations for a typed query.
 *
 * Four tiers, and the order is the point: an exact label wins over a prefix,
 * a prefix over a word start, a word start over anything the area name happens
 * to contain. Someone typing "rel" wants Releases first and Dispatch Liability
 * never, so a bare substring match on the area is ranked last rather than
 * mixed in with the label matches.
 */
export function searchNav(query: string, destinations: readonly NavDestination[] = NAV_DESTINATIONS): NavMatch[] {
  const q = norm(query);
  if (q === '') return destinations.map((destination, index) => ({ destination, score: 1000 - index }));
  const matches: NavMatch[] = [];
  for (const destination of destinations) {
    const label = norm(destination.label);
    const area = norm(destination.area);
    const href = norm(destination.href);
    let score = 0;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.split(' ').some((word) => word.startsWith(q))) score = 60;
    else if (href.includes(q)) score = 45;
    else if (label.includes(q)) score = 40;
    else if (area.startsWith(q)) score = 20;
    else if (area.includes(q)) score = 10;
    if (score > 0) matches.push({ destination, score });
  }
  // Ties keep rail order, so the list never reshuffles for equally good matches.
  return matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) => (b.match.score - a.match.score) || (a.index - b.index))
    .map((entry) => entry.match);
}
