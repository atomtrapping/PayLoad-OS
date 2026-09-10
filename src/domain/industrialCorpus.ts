/**
 * The industrial evidence corpus programme, as data.
 *
 * Eight complementary corpora assembled around one question, rather than a
 * collection of unrelated feeds. `docs/INDUSTRIAL_CORPUS.md` is the prose; this
 * is the part the surfaces read, so the page and the plan cannot drift apart.
 *
 * WHAT THIS FILE IS, AND WHAT IT IS NOT
 *
 * It is a specification and an acquisition shortlist. Nothing in it is
 * integrated, connected, licensed or collected. Every named source carries four
 * gates — access, coverage, cost and redistribution rights — and every one of
 * them is NOT_TESTED, because none has been tested. `acquisitionStanding()`
 * derives the integration state rather than storing it per row, so no entry can
 * quietly come to claim otherwise.
 *
 * That is not modesty. A shortlist that reads as an inventory is the failure
 * this whole substrate exists to prevent: a source named on a page is not a
 * source the system holds, and a corpus described is not a corpus assembled.
 *
 * THE CHAINS ARE THE POINT
 *
 * Each corpus carries the object chains it must keep distinct. A registered
 * office is not a factory; a mapped building is not an operator; a port is not
 * a berth; a statistical unit value is not a quotation; a notification is not
 * an enacted requirement; an announced project is not available capacity. Each
 * chain names the objects in order and the confusions it forbids, so the
 * distinction is enforceable and testable rather than a paragraph someone read
 * once.
 *
 * RIGHTS ARE SEPARATE ENTRIES, AND THE SUBSTRATE ALREADY SAYS SO
 *
 * A single `is_public` flag is inadequate: Overture's attribution obligations
 * vary by theme and upstream contribution, and OpenStreetMap carries its own.
 * The five rights below map onto the `SourceOperation` vocabulary this
 * repository already enforces in `src/data-os/source-policy.ts`, so this
 * programme extends the existing evidence path rather than opening a second
 * one beside it.
 */
import type { SourceOperation } from '@/data-os/contracts';

/** The question the eight corpora exist to answer together. */
export const CENTRAL_QUESTION =
  'Which organization operates which facility, producing or handling what, connected to which markets through which infrastructure, under what constraints — and what evidence supports that account at a particular time?';

export type CorpusId =
  | 'facilities' | 'observations' | 'exposure' | 'logistics'
  | 'trade' | 'economics' | 'requirements' | 'capability';

/**
 * A run of objects that must not be collapsed into one another.
 *
 * `objects` is the chain in order; `forbids` states the specific confusions
 * that collapsing it would produce. Both are load-bearing: the chain says what
 * the distinct things are, and the prohibitions say what someone would
 * otherwise conclude.
 */
export interface ObjectChain {
  /** What the chain is a chain of. */
  of: string;
  objects: readonly string[];
  forbids: readonly string[];
}

export interface IndustrialCorpus {
  id: CorpusId;
  order: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  title: string;
  /** The part of the central question this corpus carries. */
  answers: string;
  /** What is to be assembled, in one sentence. */
  assemble: string;
  chains: readonly ObjectChain[];
  /** The product this corpus enables once it is assembled. Not a product that exists. */
  product: string;
  /** What the corpus does not establish, stated on the surface rather than assumed to be understood. */
  loss: readonly string[];
}

export const CORPORA: readonly IndustrialCorpus[] = [
  {
    id: 'facilities', order: 1, title: 'Facilities, organizations and geographic infrastructure',
    answers: 'Which organization operates which facility, and where it physically is.',
    assemble: 'A versioned geographic baseline around customer facilities, industrial clusters and logistics corridors, with attributable site identities, reported capabilities, location evidence, dependencies and unresolved matches left unresolved.',
    chains: [
      {
        of: 'identity and place',
        objects: ['legal entity', 'operating organization', 'physical facility', 'parcel', 'entrance or access point', 'network connection'],
        forbids: [
          'A registered office is not necessarily a factory.',
          'A mapped building is not necessarily operated by the organization whose name appears nearby.',
          'A port location is not the same object as an individual terminal or berth.',
        ],
      },
    ],
    product: 'A maintained Supplier and Facility Atlas.',
    loss: [
      'Building footprints carry confidence values, not building use, operator or address.',
      'A legal-entity identifier register is not a complete register of all businesses, and it is not a beneficial-ownership register.',
      'A facility’s material families, processes, equipment capabilities and qualifications come from identified evidence. They are never inferred from a company category.',
    ],
  },
  {
    id: 'observations', order: 2, title: 'Satellite imagery and physical-change observations',
    answers: 'What has visibly changed at a site, and when it was observed.',
    assemble: 'A broad screening layer over named facilities and corridors, with detailed observations purchased only for specific sites and specific questions.',
    chains: [
      {
        of: 'observation',
        objects: ['source measurement', 'derived feature or change assessment', 'association with an industrial entity'],
        forbids: [
          '“An externally visible structure changed” is not “the supplier expanded production capacity”.',
          'A surface-temperature product is not a measurement of an internal factory process.',
        ],
      },
    ],
    product: 'A Facility Conditions and Change Register.',
    loss: [
      'For every admitted observation the source asset, acquisition time, footprint, native resolution, processing level, quality masks, retrieval time and processing lineage are retained, or the observation is not admitted.',
      'Production estimation is a separately validated modelling workload, not a reading of an image.',
    ],
  },
  {
    id: 'exposure', order: 3, title: 'Weather, water, environmental exposure and utility dependencies',
    answers: 'What physical and utility conditions a site or corridor was operating under.',
    assemble: 'Forecast and historical conditions around monitored sites and corridors, with local tariffs, outage notices, planned maintenance, water restrictions and written connection-capacity confirmations beside them.',
    chains: [
      {
        of: 'utility dependency',
        objects: ['infrastructure nearby', 'infrastructure connected', 'contracted service', 'confirmed available capacity', 'recorded interruptions'],
        forbids: [
          'Infrastructure near a site is not service connected to it.',
          'Modelled exposure is not a utility supply guarantee, a water right, or a site-specific engineering determination.',
          'Reference information about energy infrastructure is not evidence of spare grid capacity available to a particular customer.',
        ],
      },
    ],
    product: 'A Facility and Corridor Exposure Monitor.',
    loss: [
      'A reanalysis is not the forecast an operator could have seen at the historical decision time. Both are kept, and they are not the same record.',
      'A fire detection is an observation requiring a scoped interpretation, not proof that an identified facility was damaged.',
      'The output of a condition is normally a scoped exception or an evidence request, not an automatic operational shutdown.',
    ],
  },
  {
    id: 'logistics', order: 4, title: 'Ports, shipping, corridors and logistics events',
    answers: 'How goods actually move, and what state a particular movement is in.',
    assemble: 'Network context, market activity and the customer’s own shipment state, kept as three separate things, with local port notices a first-class acquisition target.',
    chains: [
      {
        of: 'movement',
        objects: ['port', 'terminal', 'service', 'voyage', 'vessel', 'shipment', 'container', 'recorded event'],
        forbids: [
          'Maritime disruption monitoring is not proof of a particular container’s status.',
          'A shipment-milestone standard is a convention for exchange, not an unrestricted global shipment database.',
        ],
      },
      {
        of: 'event standing',
        objects: ['planned', 'estimated', 'reported actual', 'independently reconciled'],
        forbids: ['An estimate that later matches an actual was still an estimate when it was recorded. Corrections are retained beside what they corrected.'],
      },
      {
        of: 'charge',
        objects: ['equipment type', 'charge basis', 'currency', 'applicable locations', 'validity period', 'exclusions', 'the agreement supporting the calculation'],
        forbids: [
          'A container-rate benchmark covers its lanes. It is not a bookable, all-in quote for every origin–destination pair.',
          'The customer’s accepted quote and shipment evidence govern invoice reconciliation, not whichever market index is most convenient.',
        ],
      },
    ],
    product: 'Import freight reconciliation, shipment-readiness checks, corridor assessments and open-order exceptions.',
    loss: [
      'A targeted change in a port’s opening hours, restrictions, documentation or terminal fees may matter more to an order than another global macroeconomic feed.',
    ],
  },
  {
    id: 'trade', order: 5, title: 'Trade flows, product classifications and market structure',
    answers: 'Where goods are traded, under which classification, and how the pattern is changing.',
    assemble: 'Merchandise trade by reporter, partner, flow, product classification and period, with the classification edition and revision status preserved.',
    chains: [
      {
        of: 'statistical observation',
        objects: ['reporter', 'partner', 'flow direction', 'product code and edition', 'period', 'value', 'quantity and units', 'source release', 'revision status'],
        forbids: [
          'Aggregate trade data is not a supplier graph. A country exporting a product category does not establish which named facility manufactured a particular shipment.',
          'A statistical unit value is not a supplier quotation. Value divided by quantity is a statistic for that aggregation, not the price of a grade, a specification or an order size.',
        ],
      },
      {
        of: 'shipment-level party',
        objects: ['forwarder', 'exporter', 'seller', 'consignee', 'manufacturer'],
        forbids: ['Commercial customs or bill-of-lading data keeps these distinct, or it is not usable as supplier evidence. Jurisdictions, transport modes, fields and disclosure coverage are tested before purchase, not after.'],
      },
    ],
    product: 'A Product–Market–Corridor Observatory that guides discovery and comparison.',
    loss: ['It does not replace supplier qualification.'],
  },
  {
    id: 'economics', order: 6, title: 'Economics, prices and operating-cost drivers',
    answers: 'What a thing costs, under which terms, and what was actually paid.',
    assemble: 'Economic series that connect to a purchasing or operating calculation, rather than every available macroeconomic indicator.',
    chains: [
      {
        of: 'cost',
        objects: ['market reference', 'quoted commercial terms', 'realized transaction cost'],
        forbids: [
          'An exchange-rate reference, the rate a buyer actually executed, and a rate applicable to a customs calculation are three fields, not one.',
        ],
      },
      {
        of: 'price specificity',
        objects: ['commodity family', 'material grade', 'specification', 'supplier offer', 'order', 'invoice'],
        forbids: ['A broad feedstock benchmark may explain an assumption. It does not stand in for the quoted price of a compounded material.'],
      },
    ],
    product: 'A Comparable Cost and Exposure Dataset for purchase packets, landed-cost scenarios and sensitivity analysis.',
    loss: [
      'Transparent component calculations come before any single “best country to source from” score, and a forecast is identified separately from a historical benchmark.',
    ],
  },
  {
    id: 'requirements', order: 7, title: 'Regulations, tariffs, permits and qualification requirements',
    answers: 'Which rules apply to this product, this origin, this destination, this site and this date.',
    assemble: 'A versioned requirements corpus: issuing authority, original text, translation where used, publication date, effective interval, scope, amendments, exceptions and the source supporting each interpretation.',
    chains: [
      {
        of: 'requirement',
        objects: ['published source', 'interpreted requirement', 'reviewed executable rule', 'assessment under that rule'],
        forbids: [
          'A notification is not an enacted requirement.',
          'An agent may identify and propose a change. It does not silently turn a newly encountered notice into an operational prohibition.',
          'A consolidated administrative list is not itself the law it administers.',
        ],
      },
    ],
    product: 'A Requirements and Change Register, with affected suppliers, orders, materials and sites linked to each requirement.',
    loss: [
      'An import assessment is scoped by the actual product, its composition or application, origin, destination and date. A site assessment includes the intended operation, not merely the parcel.',
      'This is a versioned corpus, not a folder of scraped legal pages.',
    ],
  },
  {
    id: 'capability', order: 8, title: 'Materials, qualifications, projects and private operating evidence',
    answers: 'What this site has documented capability to do, and what the supplied lots actually did.',
    assemble: 'Customer-authorized specifications, data sheets, certificates, laboratory reports, lot histories, inspection findings and qualification decisions, with the measurement context preserved.',
    chains: [
      {
        of: 'measurement context',
        objects: ['property', 'value', 'unit', 'test method', 'conditions', 'specimen or lot', 'issuer', 'applicable specification revision'],
        forbids: ['A value without its method, conditions and specification revision is not a result. It is a number.'],
      },
      {
        of: 'project state',
        objects: ['announced', 'approved', 'funded', 'tendered', 'contracted', 'under construction', 'commissioned'],
        forbids: ['An announcement does not enter the supply model as available production capacity.'],
      },
      {
        of: 'evidence level',
        objects: ['a candidate in a trade category', 'documented capability relevant to an application', 'recorded results for particular supplied lots'],
        forbids: ['These are three different levels of evidence and the difference is the product. They are never presented as one.'],
      },
    ],
    product: 'A maintained Supplier Capability, Qualification and Performance Corpus, with project-demand intelligence as a separate extension.',
    loss: [
      'A visibility-event exchange model is a way to exchange events between organizations. It does not grant access to anyone’s operational data.',
      'The highest-priority private inputs — purchase orders, acknowledged commitments, shipping records, receipts, quality dispositions, invoices, resolved exceptions — are customer-authorized or they are absent.',
    ],
  },
];

/** The four tests every proposed integration must pass before it is one. */
export const GATES = ['ACCESS', 'COVERAGE', 'COST', 'REDISTRIBUTION_RIGHTS'] as const;
export type GateId = typeof GATES[number];
export type GateState = 'NOT_TESTED' | 'PASSED' | 'FAILED';

export interface AcquisitionCandidate {
  id: string;
  name: string;
  corpus: CorpusId;
  /** What the source provides, in its own terms. */
  provides: string;
  /** The role proposed for it here. A proposal, not an integration. */
  proposedRole: string;
  /** Obligations and limits known before any test is run. */
  knownLimits: readonly string[];
  /** Whether acquiring it involves a commercial agreement. Nothing here is purchased. */
  commercial: boolean;
  gates: Readonly<Record<GateId, GateState>>;
}

/** Every gate on every candidate, because none has been tested. */
const UNTESTED: Readonly<Record<GateId, GateState>> = Object.freeze({
  ACCESS: 'NOT_TESTED', COVERAGE: 'NOT_TESTED', COST: 'NOT_TESTED', REDISTRIBUTION_RIGHTS: 'NOT_TESTED',
});

const candidate = (
  id: string, name: string, corpus: CorpusId, provides: string, proposedRole: string,
  knownLimits: readonly string[] = [], commercial = false,
): AcquisitionCandidate => ({ id, name, corpus, provides, proposedRole, knownLimits, commercial, gates: UNTESTED });

export const ACQUISITION_CANDIDATES: readonly AcquisitionCandidate[] = [
  candidate('overture-maps', 'Overture Maps', 'facilities',
    'Buildings, places, transportation, addresses, administrative divisions and reference identifiers.',
    'A versioned geographic baseline around customer facilities, industrial clusters and logistics corridors.',
    ['Attribution obligations vary by theme and by upstream contribution, so one flag cannot express them.']),
  candidate('openstreetmap', 'OpenStreetMap', 'facilities',
    'Community-maintained transport and geographic data.',
    'Road and rail context, access-network candidates and spatial relationships, supplemented by authoritative local information.',
    ['ODbL and attribution requirements need explicit handling.']),
  candidate('google-open-buildings', 'Google Open Buildings', 'facilities',
    'Building footprints and confidence values across covered regions, including substantial African and Asian coverage.',
    'Candidate physical structures to associate with known sites.',
    ['Supplies no building use, operator or address.']),
  candidate('gleif', 'GLEIF', 'facilities',
    'Legal-entity identifiers, reference information and reported relationship data.',
    'External identifiers and organization crosswalks.',
    ['Not a complete register of all businesses, and not a beneficial-ownership register.']),
  candidate('jurisdiction-registries', 'Jurisdiction-specific registries and site records', 'facilities',
    'Company registries, industrial-estate directories, operating permits, cadastral records, utility service documents and customer-confirmed site information.',
    'The authoritative local layer that decides which mapped object is which operator’s facility.',
    ['Jurisdiction by jurisdiction: coverage, form and access differ everywhere and none of it generalises.']),

  candidate('sentinel-2', 'Copernicus Sentinel-2', 'observations',
    'Optical observations for externally visible site conditions, land cover and change.',
    'Area-of-interest searches and quality-filtered retrieval around named facilities and corridors.',
    ['Start from appropriate processed products rather than every available processing level.']),
  candidate('sentinel-1', 'Copernicus Sentinel-1', 'observations',
    'Radar observations supporting selected water, surface and change assessments.',
    'A radar workflow for the questions radar suits.',
    ['General radar workflows stay separate from specialised interferometric processing.']),
  candidate('landsat-c2', 'USGS Landsat Collection 2', 'observations',
    'Longer historical context, surface reflectance and surface-temperature products.',
    'Historical baselines with quality masks and product limitations preserved.',
    ['Surface-temperature values are not direct measurements of internal factory processes.']),
  candidate('digital-earth-africa', 'Digital Earth Africa', 'observations',
    'Regional imagery access and derived products, including water observations, waterbodies, coastlines and composites.',
    'Reuse of suitable regional products before building equivalent continental processing.',
    ['Its catalogue distinguishes maintained services from external datasets; that distinction has to survive into ours.']),
  candidate('copernicus-data-space', 'Copernicus Data Space', 'observations',
    'Catalogue and access mechanisms including STAC, OData, S3 and processing services.',
    'The acquisition interface: search first, then retrieve or process selected assets rather than copying archives locally.',
    ['A catalogue interface complements the identity and access model here; it does not replace it.']),
  candidate('commercial-imagery', 'Planet, Airbus OneAtlas, ICEYE', 'observations',
    'Commercial optical monitoring, imagery access and radar observations.',
    'Archive access or tasking for named customer assets.',
    ['Buy the capability a question needs, not an undifferentiated global subscription.'], true),

  candidate('ecmwf-open-data', 'ECMWF Open Data', 'exposure',
    'Issued weather and wave forecasts relevant to monitored sites and corridors.',
    'The forecast run and valid time as they stood at decision time, archived where permitted.',
    ['The public service maintains a rolling collection: later retrieval is not a substitute for preserving what was available then.']),
  candidate('era5', 'ERA5', 'exposure',
    'Historical meteorological context and scenario baselines.',
    'Historical context and scenario baselines, with dataset revisions preserved.',
    ['A reanalysis is not the forecast an operator could have seen at the historical decision time.']),
  candidate('nasa-firms', 'NASA FIRMS', 'exposure',
    'Fire-related satellite observations and associated alert inputs.',
    'Detections as observations requiring a scoped interpretation.',
    ['A detection is not proof that an identified facility was damaged.']),
  candidate('wri-aqueduct', 'WRI Aqueduct', 'exposure',
    'Water-stress and flood-risk screening context.',
    'Screening context for exposure questions.',
    ['Modelled exposure is not a supply guarantee, a water right, or a site-specific engineering determination.']),
  candidate('global-energy-monitor', 'Global Energy Monitor', 'exposure',
    'Reference information about energy and heavy-industrial infrastructure.',
    'Locating dependencies and industrial context.',
    ['Not evidence of spare grid capacity available to a particular customer.']),
  candidate('local-utility-records', 'Local utility tariffs, notices and confirmations', 'exposure',
    'Tariffs, outage notices, planned maintenance, water restrictions and written connection-capacity confirmations.',
    'The layer that separates infrastructure nearby from service actually contracted and confirmed.',
    ['Local, written and site-specific; nothing here generalises from a regional model.']),

  candidate('port-authorities', 'Port and terminal authorities', 'logistics',
    'Published tariffs, service notices, restrictions, operating information and infrastructure documents where available.',
    'Targeted notice and document acquisition for the ports customers actually use.',
    ['Availability and form differ port by port.']),
  candidate('imf-portwatch', 'IMF PortWatch', 'logistics',
    'Maritime disruption monitoring and related activity context.',
    'A baseline for investigating broader maritime changes.',
    ['Not proof of a particular container’s status.']),
  candidate('vessel-tracking', 'Kpler / MarineTraffic', 'logistics',
    'Licensed vessel-tracking and maritime information services.',
    'Vessel and port-event observations where coverage, latency and permitted use justify the purchase.',
    ['Coverage, latency and permitted use are the purchase test, not the feature list.'], true),
  candidate('dcsa-integrations', 'Carrier and terminal integrations using DCSA conventions', 'logistics',
    'Structured shipment milestones and tracking events.',
    'Customer-authorized operational inputs.',
    ['DCSA is a standard, not an unrestricted global shipment database.']),
  candidate('freightos-fbx', 'Freightos Baltic Index', 'logistics',
    'Container-rate benchmarks for its covered lanes.',
    'Market context for price comparisons.',
    ['Not a bookable, all-in quote for every origin–destination pair.'], true),

  candidate('un-comtrade', 'UN Comtrade / UN Statistics trade resources', 'trade',
    'Merchandise trade by reporting country, partner, product classification and period, with classification and correspondence resources.',
    'The base statistical layer, with classification edition and revision status retained.',
    ['Aggregate trade is not a supplier graph.']),
  candidate('us-census-trade', 'U.S. Census International Trade API', 'trade',
    'Destination-specific U.S. trade analysis, including relevant product, partner and port datasets.',
    'Destination-market analysis for the first Western destination in scope.'),
  candidate('statcan-wds', 'Statistics Canada Web Data Service', 'trade',
    'Canadian statistical series, metadata, bulk tables and change-oriented acquisition.',
    'Canadian series for selected trade and economic datasets.'),
  candidate('wto-statistics', 'WTO statistics resources', 'trade',
    'Harmonized trade and tariff statistical context and comparative series.',
    'Comparative context across reporters.'),
  candidate('shipment-level-customs', 'Commercial shipment-level customs or bill-of-lading data', 'trade',
    'Shipment-level records where jurisdictions disclose them.',
    'Considered later, after testing the actual jurisdictions, transport modes, fields and disclosure coverage.',
    ['Forwarders, exporters, sellers, consignees and manufacturers must stay distinct or it is not supplier evidence.'], true),

  candidate('world-bank-indicators', 'World Bank Indicators API', 'economics',
    'Cross-country economic and development series.',
    'Contextual comparisons.'),
  candidate('world-bank-pink-sheet', 'World Bank Commodity Price Data (Pink Sheet)', 'economics',
    'Historical commodity benchmarks and separately identified forecasts.',
    'Benchmark history, with forecasts kept identifiably separate.',
    ['A forecast is not a historical benchmark and is never merged into one series.']),
  candidate('eia-open-data', 'EIA Open Data', 'economics',
    'Energy-market series and relevant fuel and electricity context.',
    'Energy cost drivers, with geographic coverage checked rather than assumed.'),
  candidate('national-statistics', 'National statistical offices and central banks', 'economics',
    'Local inflation, industrial production, labour, currency and other relevant series.',
    'The local series a calculation actually needs.'),
  candidate('customer-commercial-records', 'Customer and supplier commercial records', 'economics',
    'Actual quotations, payment terms, utility contracts, price adjustments and realized invoices.',
    'The realized-cost layer that market references cannot supply.',
    ['Customer-authorized or absent.']),

  candidate('eu-access2markets', 'EU Access2Markets', 'requirements',
    'Product- and market-specific information on tariffs, origin, customs procedures and requirements.',
    'Requirement acquisition with the underlying sources retained.'),
  candidate('usitc-hts', 'USITC Harmonized Tariff Information', 'requirements',
    'U.S. tariff classification and schedule resources.',
    'Declared-product assessment for the U.S. destination.'),
  candidate('wto-eping', 'WTO ePing', 'requirements',
    'SPS/TBT notifications and related regulatory developments.',
    'Change monitoring, with notifications investigated rather than enacted.',
    ['A notification must remain distinguishable from an enacted requirement.']),
  candidate('ofac-sanctions', 'OFAC Sanctions List Service', 'requirements',
    'Official downloadable list data and changes.',
    'Scoped screening workflows.'),
  candidate('canada-sanctions', 'Canadian official sanctions sources', 'requirements',
    'Canadian screening inputs and links to governing regulations.',
    'Canadian screening for the Ontario and Great Lakes scope.',
    ['Canada states that its consolidated autonomous list is administrative and does not itself have force of law.']),
  candidate('national-authorities', 'National customs, environmental, planning and standards authorities', 'requirements',
    'Origin-, transit-, destination- and site-specific rules.',
    'The rules the chosen customer workflow actually turns on.'),

  candidate('customer-qualification-records', 'Customer-authorized specifications and qualification records', 'capability',
    'Specifications, technical and safety data sheets, certificates, laboratory reports, lot histories, inspection findings and qualification decisions.',
    'The evidence that separates a trade-category candidate from a qualified supplier with recorded lot results.',
    ['Customer-authorized or absent. The measurement context is retained with every value.']),
  candidate('world-bank-projects', 'World Bank Projects & Operations', 'capability',
    'Project and procurement records.',
    'Industrial expansion and infrastructure projects, with their state kept explicit.',
    ['An announcement is not available production capacity.']),
  candidate('gs1-epcis', 'GS1 EPCIS', 'capability',
    'An exchange model for visibility events across organizations.',
    'The exchange shape for authorized partner events.',
    ['A standard, not access to anyone’s operational data.']),
  candidate('customer-operating-history', 'Customer operating histories', 'capability',
    'Purchase orders, acknowledged commitments, shipping records, receipts, quality dispositions, invoices and resolved exceptions.',
    'The highest-priority private input, and the one that makes the rest answerable.',
    ['Customer-authorized or absent.']),
];

/**
 * The rights a source registration has to answer separately.
 *
 * Each maps onto the `SourceOperation` this repository already evaluates, so
 * the programme extends `src/data-os/source-policy.ts` rather than inventing a
 * second permission model beside it. A single public/not-public flag cannot
 * express any of these.
 */
export interface SeparateRight {
  right: string;
  operation: SourceOperation;
  question: string;
}

export const SEPARATE_RIGHTS: readonly SeparateRight[] = [
  { right: 'Storage', operation: 'INGEST', question: 'May the retrieved bytes be retained here, and for how long?' },
  { right: 'Report display', operation: 'PUBLISH', question: 'May this be shown to a customer, a tenant, or the public?' },
  { right: 'Derived product', operation: 'DERIVE', question: 'May something computed from it be sold or delivered?' },
  { right: 'Raw redistribution', operation: 'EXPORT', question: 'May the source material itself leave this system?' },
  { right: 'Model training', operation: 'MODEL_TRAINING', question: 'May it be used to fit a model?' },
];

/** What the source registry has to record for every source, whether or not it is integrated. */
export const SOURCE_REGISTRY_FIELDS = [
  'coverage', 'refresh behaviour', 'expected latency', 'authentication', 'rate limits',
  'schema and parser version', 'retention rules', 'attribution', 'permitted outputs',
] as const;

/** Times that must not be collapsed, by the kind of thing being recorded. */
export interface ClockSet {
  kind: string;
  times: readonly string[];
  collapsing: string;
}

export const CLOCKS: readonly ClockSet[] = [
  { kind: 'Satellite observation', times: ['acquisition', 'processing', 'publication', 'retrieval', 'admission'],
    collapsing: 'When the sensor saw it, when the product was made, and when this system knew it are three different facts.' },
  { kind: 'Weather forecast', times: ['issue or run time', 'forecast-valid time'],
    collapsing: 'A forecast for Tuesday issued on Monday is not a forecast for Tuesday issued on Sunday, and neither is an observation of Tuesday.' },
  { kind: 'Trade statistic', times: ['described period', 'release date', 'revision'],
    collapsing: 'A revised figure for a past period is a new record about that period, not a correction of what was known then.' },
  { kind: 'Regulation', times: ['publication', 'effective interval', 'amendment', 'interpretation approval'],
    collapsing: 'When a rule was published, when it bites, and when this system accepted a reading of it are separate.' },
  { kind: 'Shipment event', times: ['planned', 'estimated', 'reported actual', 'received', 'corrected'],
    collapsing: 'An estimate that turned out right was still an estimate, and a correction does not erase what was reported.' },
];

/** Do not backdate knowledge. */
export const KNOWLEDGE_RULE =
  'A newly acquired record describing an earlier event does not move the time this system knew it.';

/** An acquisition failure is a coverage fact, not an empty result. */
export const SILENCE_RULE =
  '“Nothing was found” and “the source was unavailable, incomplete, or not searched” are different answers. Acquisition failures belong in coverage records, never in apparently clean operational results.';

export interface AcquisitionPattern {
  id: string;
  name: string;
  handles: readonly string[];
}

export const ACQUISITION_PATTERNS: readonly AcquisitionPattern[] = [
  { id: 'structured-api', name: 'Structured API collector', handles: ['pagination', 'incremental cursors', 'quotas', 'retries', 'source response capture'] },
  { id: 'bulk-release', name: 'Bulk-release collector', handles: ['download manifests', 'release comparison', 'schema changes', 'reproducible subsets'] },
  { id: 'geospatial-catalogue', name: 'Geospatial catalogue collector', handles: ['area and time searches', 'quality filters', 'selected imagery retrieval', 'processing manifests'] },
  { id: 'document-monitor', name: 'Document and notice monitor', handles: ['attributable versions of tariffs, circulars, permits and regulatory texts', 'extraction changes that stay reviewable'] },
  { id: 'partner-events', name: 'Partner-event receiver', handles: ['authorized carrier, supplier, sensor or customer events', 'duplicate handling', 'correction handling'] },
  { id: 'customer-files', name: 'Customer-file intake', handles: ['spreadsheets', 'quotations', 'certificates', 'exports', 'the same evidence path as everything else'] },
];

/** The one path every corpus goes through. Eight corpora, not eight platforms. */
export const ACQUISITION_PATH = [
  'customer question or watchlist', 'source selection and rights check', 'bounded acquisition',
  'retained source artifact', 'extraction and normalization', 'identity, time and geometry resolution',
  'typed observations and claims', 'domain computations', 'quality and freshness checks',
  'corpus release, API, packet or alert',
] as const;

export interface BuildPhase {
  order: 1 | 2 | 3 | 4;
  title: string;
  build: string;
  deliverable: string;
  validation: string;
}

export const BUILD_PHASES: readonly BuildPhase[] = [
  { order: 1, title: 'Establish the objects',
    build: 'Customer records, one suitable geographic baseline, relevant registry sources, identity crosswalks and the source-rights registry.',
    deliverable: 'A reviewed supplier and site atlas.',
    validation: 'False matches, duplicate sites, ambiguous addresses and missing evidence.' },
  { order: 2, title: 'Add decision context',
    build: 'Selected trade series, imagery around those sites, port notices, reference costs and applicable requirements.',
    deliverable: 'A facility-and-corridor decision packet.',
    validation: 'Every material conclusion has a traceable basis and explicit limitations.' },
  { order: 3, title: 'Maintain change',
    build: 'Incremental notices, source releases, customer events, freshness rules, deadlines and reconciliation.',
    deliverable: 'A monitored service.',
    validation: 'Stale sources, late corrections, lost events, changed schemas and false alerts.' },
  { order: 4, title: 'Buy specific missing evidence',
    build: 'Targeted imagery, maritime data, inspection, laboratory or specialist inputs.',
    deliverable: 'Paid sources added only where they resolve a demonstrated gap.',
    validation: 'Permitted use supports the product, or the purchase does not happen.' },
];

/**
 * The illustrative first scope. These are proposed limits, not promises about
 * available coverage, and the distinction is the whole point of stating them.
 */
export const FIRST_RELEASE_SCOPE = {
  standing: 'PROPOSED_SCOPE_LIMIT_NOT_A_COVERAGE_PROMISE',
  supplierFacilities: 25,
  ports: '2–3',
  productFamilies: 1,
  originJurisdictions: 1,
  destinationMarkets: 1,
  extends: 'The Ontario and Great Lakes work, by attaching selected overseas suppliers and their routes to the same customer and facility identities.',
} as const;

/** Source priority within the first scope. Order prevents a disconnected satellite archive. */
export const FIRST_SCOPE_PRIORITY = [
  'customer records and identity evidence',
  'geographic context and official requirements',
  'selected trade, port and economic context',
  'targeted imagery and hazard observations, alongside the specific questions they answer',
] as const;

export interface CoverageMeasure { id: string; measure: string; why: string }

export const DECISION_COVERAGE_MEASURES: readonly CoverageMeasure[] = [
  { id: 'assets-resolved', measure: 'Proportion of customer assets correctly resolved', why: 'The atlas is the foundation; an unresolved asset makes every later answer about it unusable.' },
  { id: 'questions-supported', measure: 'Required questions supported by current evidence', why: 'A corpus is measured by the decisions it covers, not the bytes it holds.' },
  { id: 'unresolved-matches', measure: 'Unresolved identity matches', why: 'Left visible rather than guessed; a forced match is worse than an open one.' },
  { id: 'update-failures', measure: 'Source-update failures', why: 'A failure is a coverage fact. It never presents as a clean result.' },
  { id: 'review-effort', measure: 'Review effort', why: 'What a maintained corpus actually costs to keep true.' },
  { id: 'false-alerts', measure: 'False alerts', why: 'An alert nobody trusts is worse than no alert.' },
  { id: 'cost-per-refresh', measure: 'Cost per refreshed facility or completed packet', why: 'The unit that decides whether the product can be sold.' },
];

/** The test a proposed purchase has to pass. */
export const PURCHASE_TEST =
  'Will this additional source change a decision, close a required evidence gap, or materially reduce the cost of maintaining the product?';

/** The first valuable assembled object, and the thing every product is a view of. */
export const FIRST_ASSEMBLED_OBJECT =
  'A supplier–facility–material–route–requirement dossier that remains current.';

export const THE_ASSET =
  'The connection between physical observations, commercial records and institutional rules and actual customer dependencies — not the volume of downloaded data.';

export function corpusById(id: CorpusId): IndustrialCorpus | null {
  return CORPORA.find((corpus) => corpus.id === id) ?? null;
}

export function candidatesFor(id: CorpusId): AcquisitionCandidate[] {
  return ACQUISITION_CANDIDATES.filter((entry) => entry.corpus === id);
}

/**
 * What this programme currently is, derived rather than stored.
 *
 * Every count here is computed from the tables above, so the surface cannot
 * report an integration that no entry records. `integrated` is not a field
 * anywhere: it is the number of candidates whose four gates have all passed,
 * which is the only definition under which it could ever become non-zero.
 */
export function acquisitionStanding(candidates: readonly AcquisitionCandidate[] = ACQUISITION_CANDIDATES) {
  const passed = (entry: AcquisitionCandidate) => GATES.every((gate) => entry.gates[gate] === 'PASSED');
  const openGates = candidates.flatMap((entry) =>
    GATES.filter((gate) => entry.gates[gate] !== 'PASSED').map((gate) => ({ candidate: entry.id, gate })));
  return {
    corpora: CORPORA.length,
    candidates: candidates.length,
    integrated: candidates.filter(passed).length,
    commercial: candidates.filter((entry) => entry.commercial).length,
    openGates: openGates.length,
    gatesPerCandidate: GATES.length,
    connectionEstablished: false,
    liveCollectionEnabled: false,
    currentRightsGrant: false,
    coverage: 'DECLARED_ACQUISITION_SHORTLIST_ONLY' as const,
  };
}
