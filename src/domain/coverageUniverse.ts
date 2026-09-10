/**
 * The priority coverage universe, as data.
 *
 * `industrialCorpus.ts` says what evidence is assembled. This says where, for
 * whom, and to what depth — and it exists as a separate module because those
 * are separate questions that a single "regions we cover" list would collapse.
 *
 * THE DISTINCTION THE WHOLE FILE TURNS ON
 *
 * Broad geographic discovery; selective, deep operational coverage;
 * customer-specific decisions. Six regions are the ambition, not a promise of
 * equally deep coverage of six enormous landmasses. `COVERAGE_LEVELS` is what
 * makes that statable rather than a hedge: reference, assessed and monitored
 * are three different things a subject can be, they are maintained at
 * different cost, and each says what may reasonably be sold from it. A point
 * on the map is not a verified facility; an assessed facility is not a
 * monitored supplier.
 *
 * THE UNIT IS A CORRIDOR, NOT A COUNTRY
 *
 * "Cover Vietnam" does not tell an acquisition system which documents matter,
 * which facilities need identity resolution, or what freshness is sufficient.
 * A corridor does: a product or process, its supplier facilities, its
 * transport dependencies, its destination requirements and the buyer's
 * commitments. That has a defined universe of entities, evidence
 * requirements, update frequencies and decisions — which is what makes it
 * maintainable and what makes expansion follow a dependency chain rather than
 * a map.
 *
 * NOTHING HERE IS COVERED YET
 *
 * No region is entered, no corridor is maintained, no subject sits at any
 * coverage level. `coverageStanding()` derives that rather than storing it, so
 * the surface cannot report coverage that no entry records.
 */

/** The geographic specialization, beneath the broader firm mandate rather than in place of it. */
export const GEOGRAPHIC_MANDATE =
  'Notation Systems develops evidence-backed industrial, trade and infrastructure intelligence across selected markets in Asia, Africa, Latin America, the Pacific and Eastern Europe — connecting local records and physical observations to cross-border commercial decisions.';

export const MANDATE_STANDING = 'A geographic specialization beneath the broader firm mandate, not a replacement for it.';

/** The three things that must not be run together when someone says "coverage". */
export const STRATEGIC_DISTINCTION = [
  'broad geographic discovery',
  'selective, deep operational coverage',
  'customer-specific decisions',
] as const;

/** Why the regions are worth the effort, stated so it can be argued with. */
export const COMMERCIAL_HYPOTHESIS =
  'Not that these regions contain less information. That value can be created where a buyer’s decision requires evidence distributed across organizations, languages, physical observations, jurisdictions and incompatible systems.';

export const HYPOTHESIS_COROLLARY =
  'The gap worth pursuing is between available information and a dependable decision. A gap that is hard to close can also be an expensive service burden, so each market still faces an acquisition and delivery test.';

export type RegionId = 'asia' | 'africa' | 'south-america' | 'central-america' | 'pacific' | 'eastern-europe';

export interface CoverageRegion {
  id: RegionId;
  name: string;
  /** The bounded thing to investigate first, rather than the region as a whole. */
  initialScope: string;
  /** The recurring questions this region's product answers. */
  productEmphasis: readonly string[];
  /** Public evidence that exists to build on. Naming it is the point: none of this starts from a vacuum. */
  foundation: string;
  /** What that foundation does not establish, which is where the work is. */
  foundationLimit: string;
  /** A distinction the regional label would otherwise erase. */
  distinction?: string;
}

/**
 * A proposed research and product portfolio. Not a verified ranking of
 * countries by commercial attractiveness, and the regions do not run the same
 * product: the Pacific does not copy the Asian manufacturing product, and
 * African site intelligence does not copy a European parcel model.
 */
export const REGION_STANDING = 'PROPOSED_PORTFOLIO_NOT_A_VERIFIED_RANKING' as const;

export const COVERAGE_REGIONS: readonly CoverageRegion[] = [
  {
    id: 'asia', name: 'Asia',
    initialScope: 'Selected manufacturing clusters in countries such as India, Vietnam, Malaysia and Indonesia, with others included when a customer’s dependency chain requires them.',
    productEmphasis: ['supplier-site identity', 'capability and qualification evidence', 'material purchasing', 'production commitments', 'shipment exceptions'],
    foundation: 'Regional development-bank resources covering trade, investment, integration and port traffic.',
    foundationLimit: 'Regional integration statistics describe a region. They do not identify which facility made a particular shipment, and the same reports that show deepening integration also show continuing supply-chain vulnerability.',
  },
  {
    id: 'africa', name: 'Africa',
    initialScope: 'Selected industrial and export corridors — a North African manufacturing corridor, or a southern or eastern African facility-to-port network.',
    productEmphasis: ['facility and infrastructure evidence', 'qualified suppliers', 'site feasibility', 'water and transport exposure'],
    foundation: 'Continental imagery and derived products, including surface-water observations, coastal change and land-cover context.',
    foundationLimit: 'Derived continental products are useful inputs. They are not substitutes for facility-specific records, and they answer no question about who operates a site.',
  },
  {
    id: 'south-america', name: 'South America',
    initialScope: 'A defined material or industrial supply chain in Brazil, Chile, Peru or Colombia.',
    productEmphasis: ['material-origin and processor relationships', 'supplier qualification', 'inland-to-port dependencies', 'comparable cost assessments'],
    foundation: 'Official open trade files with product classifications, partner countries, transport modes, quantities and values.',
    foundationLimit: 'A strong statistical baseline that establishes no individual factory transaction.',
  },
  {
    id: 'central-america', name: 'Central America',
    initialScope: 'A specific importing, manufacturing or distribution corridor involving countries such as Panama, Costa Rica or Guatemala.',
    productEmphasis: ['logistics commitments', 'border and document readiness', 'freight-cost reconciliation', 'industrial-site screening'],
    foundation: 'Regional trade-statistics, tariff and trade platforms, and canal-authority advisories, tariffs, regulations and transit statistics.',
    foundationLimit: 'Published advisories and transit statistics describe the waterway and the region, not a particular consignment’s readiness.',
  },
  {
    id: 'pacific', name: 'Pacific',
    initialScope: 'Named island supply networks, ports, infrastructure projects and facilities, rather than a generic supplier directory.',
    productEmphasis: ['resupply dependencies', 'project procurement', 'transport exposure', 'coastal and site monitoring'],
    foundation: 'Development analysis of geographic dispersion and exposure to external and climatic shocks, and climate-resilient transport infrastructure programmes.',
    foundationLimit: 'Constraint analysis explains why resupply is fragile. It does not say which shipment is late.',
    distinction: 'Pacific Island economies are distinguished from the broader Pacific Rim. Australia, New Zealand, Japan and others may appear as customers, suppliers, service providers or network dependencies; the regional label does not dictate the role.',
  },
  {
    id: 'eastern-europe', name: 'Eastern Europe and adjacent industrial corridors',
    initialScope: 'Country-specific clusters and routes, with Eastern, Central and Southeastern European jurisdictions distinguished in the actual coverage model.',
    productEmphasis: ['industrial supplier comparison', 'facility and utility evidence', 'cross-border logistics', 'jurisdiction-specific requirements'],
    foundation: 'Detailed trade and manufacturing-related statistics, and a published trans-European transport-network reference.',
    foundationLimit: 'Neither eliminates the need for local site and operational evidence.',
    distinction: '"Eastern Europe" is not one jurisdiction. The coverage model names countries, not the label.',
  },
];

/**
 * The three geographic dimensions, kept apart.
 *
 * Collapsing them produces the design error this whole section exists to
 * avoid: treating every transaction as "the rest of the world supplies the
 * West", which bakes a sales sequence into the data model.
 */
export interface GeographicDimension { dimension: string; determines: string }

export const GEOGRAPHIC_DIMENSIONS: readonly GeographicDimension[] = [
  { dimension: 'Customer location', determines: 'Who pays, which decision they own, and which obligations apply to them.' },
  { dimension: 'Asset and counterparty location', determines: 'Where evidence must be acquired and interpreted.' },
  { dimension: 'Trade and dependency network', determines: 'Which additional jurisdictions, facilities, services and routes must be represented.' },
];

export const COMMERCIALIZATION = 'Western-buyer-led commercialization; geographically neutral infrastructure.';

export const COMMERCIALIZATION_NOTES = [
  'Canadian, U.S. and European manufacturers, importers and distributors can be the initial sales focus without designing every transaction as a supply from elsewhere to the West.',
  'A regional manufacturer, local exporter, infrastructure operator or investor buying the same class of evidence-backed service later must not require a conceptual redesign.',
  'North American and Western European data stays in the corpus. The destination side — receiving facilities, requirements, costs, customers and comparative alternatives — is half of every corridor.',
  'Mexico and relevant Caribbean gateways remain eligible when the actual customer corridor requires them. The regional focus guides investment; it does not truncate the network.',
] as const;

/** The maintained object. Each part is required; a corridor missing one of them is a country dossier. */
export const CORRIDOR_UNIT = [
  'product or process', 'supplier facilities', 'transport dependencies',
  'destination requirements', 'buyer commitments',
] as const;

export const CORRIDOR_EXAMPLE =
  'Injection-moulded industrial components from a named manufacturing cluster to a particular Canadian buyer, through the actual ports, carriers and receiving facilities involved.';

export const CORRIDOR_RULES = [
  'A country dossier is useful context. The maintained object is the corridor.',
  '“Cover Vietnam” does not tell an acquisition system which documents matter, which facilities need identity resolution, or what freshness is sufficient. A corridor does.',
  'A dependency chain that crosses regional categories — produced in one country, compounded in a second, converted in a third, shipped through a fourth — stays one connected inquiry.',
  'Two suppliers in different countries are not independent alternatives if they share an upstream processor, a transport route, or another critical dependency.',
  'Geographic expansion need not proceed country by country. A customer’s dependency chain is often the better expansion path.',
] as const;

export type CoverageLevelId = 'REFERENCE' | 'ASSESSED' | 'MONITORED';

export interface CoverageLevel {
  id: CoverageLevelId;
  order: 1 | 2 | 3;
  name: string;
  /** What is actually maintained at this level. */
  maintains: string;
  /** What may reasonably be sold from it. */
  mayBeSold: string;
  /** The claim this level does not support, stated where someone would otherwise assume it. */
  doesNotSupport: string;
}

export const COVERAGE_LEVELS: readonly CoverageLevel[] = [
  { id: 'REFERENCE', order: 1, name: 'Reference coverage',
    maintains: 'Geographic and statistical context, source catalogues and basic entity candidates.',
    mayBeSold: 'Discovery and contextual analysis, with limitations visible.',
    doesNotSupport: 'A point on the map is not a verified facility.' },
  { id: 'ASSESSED', order: 2, name: 'Assessed coverage',
    maintains: 'Resolved identities, assembled evidence, domain evaluation and documented review.',
    mayBeSold: 'A purchasing packet, facility dossier or site screen.',
    doesNotSupport: 'An assessed facility is not a continuously monitored supplier.' },
  { id: 'MONITORED', order: 3, name: 'Monitored coverage',
    maintains: 'Continuing updates, freshness requirements, dependencies and owned exceptions.',
    mayBeSold: 'A recurring intelligence service, exposure feed or operational monitor.',
    doesNotSupport: 'Monitoring is not a guarantee about the subject. It is a commitment about the updates.' },
];

/** How a subject moves up, and why it is not maintained at maximum frequency everywhere. */
export const PROMOTION_RULE =
  'A customer request promotes a bounded subject from reference coverage into assessment; demonstrated recurring demand justifies monitoring. Broad reference coverage across the regions is therefore possible without pretending to offer the same assurance everywhere.';

/** What a regional evidence module carries. Modules, not separate platforms. */
export const REGIONAL_MODULE_CONTENTS = [
  'source adapters', 'identifiers', 'original-language terminology', 'translation handling',
  'relevant spatial layers', 'requirements', 'local verification channels',
] as const;

/** What the shared substrate keeps supplying, in every region. */
export const SHARED_SUBSTRATE = [
  'identity', 'provenance', 'state', 'access', 'computation records', 'releases', 'warrants',
] as const;

export const MODULE_RULE =
  'Regional differences belong in the evidence and the interpretation, not in independent databases that gradually disagree about the same organization or shipment.';

/** The design rule that keeps a coverage gap from becoming a judgment about a supplier. */
export const SEPARATION_RULE = 'Jurisdiction, observed condition and evidentiary uncertainty must remain separate.';

export const SEPARATION_PROHIBITIONS = [
  'Missing information does not become a negative supplier judgment.',
  'A country-level statistic does not become a facility-level fact.',
  'A remotely sensed change does not become proof of ownership, capacity or material quality.',
] as const;

export const CONFIRMATION_ROUTE =
  'Where remote observation cannot answer the question, the system names the confirmation needed and routes it to an appropriate provider. Local inspectors, laboratories, engineers, registry specialists and authorized operators are evidence partners, not intermediaries the architecture assumes it can eliminate.';

export interface ExpansionStep { order: 1 | 2 | 3; step: string; why: string }

export const EXPANSION_SEQUENCE: readonly ExpansionStep[] = [
  { order: 1, step: 'Select one buyer and a live purchasing or supplier-review problem.',
    why: 'Its actual candidate suppliers and requirements choose the first origin market, rather than a map choosing it.' },
  { order: 2, step: 'Add a contrasting sourcing option for the same product or process.',
    why: 'This is the test of whether a genuinely comparable decision can be produced across jurisdictions, rather than unrelated regional reports accumulating.' },
  { order: 3, step: 'Maintain the selected network.',
    why: 'The successful packet becomes qualification-change monitoring, order exceptions, facility exposure and repeat-purchase support.' },
];

/** How the second market is chosen. */
export const SECOND_MARKET_TEST = [
  'customer demand', 'accessible evidence', 'rights to deliver the result',
  'local verification options', 'sustainable maintenance cost',
] as const;

export const NOT_A_REASON = 'Filling another continent on the map.';

/** What to build first within this mandate. */
export const FIRST_WORKFLOW =
  'Adopt all six regions as the coverage ambition, and commercialize one industrial workflow across a small number of connected markets first: supplier–facility–material–route evidence, rather than a generic geopolitical intelligence product or a new commodity-trading service.';

export function regionById(id: RegionId): CoverageRegion | null {
  return COVERAGE_REGIONS.find((region) => region.id === id) ?? null;
}

export function coverageLevelById(id: CoverageLevelId): CoverageLevel | null {
  return COVERAGE_LEVELS.find((level) => level.id === id) ?? null;
}

/**
 * What is actually covered, derived rather than stored.
 *
 * A declared region is an intention. A corridor is the maintained object, and
 * there are none: no subject sits at any coverage level, because no subject
 * has been entered. The counts are computed from an empty corridor table so
 * that the first real corridor changes them by existing, and nothing else can.
 */
export interface Corridor {
  id: string;
  product: string;
  originRegion: RegionId;
  level: CoverageLevelId;
}

/** No corridor is maintained. The table is here so that adding one is the only way to change the count. */
export const CORRIDORS: readonly Corridor[] = [];

export function coverageStanding(corridors: readonly Corridor[] = CORRIDORS) {
  const atLevel = (level: CoverageLevelId) => corridors.filter((corridor) => corridor.level === level).length;
  return {
    regionsDeclared: COVERAGE_REGIONS.length,
    regionStanding: REGION_STANDING,
    corridorsMaintained: corridors.length,
    reference: atLevel('REFERENCE'),
    assessed: atLevel('ASSESSED'),
    monitored: atLevel('MONITORED'),
    regionsEntered: new Set(corridors.map((corridor) => corridor.originRegion)).size,
    coverage: 'DECLARED_AMBITION_ONLY' as const,
  };
}
