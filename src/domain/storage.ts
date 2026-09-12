/**
 * Polyglot persistence for the corpus, as data. Seven classes of information
 * with different access patterns need different stores; naming a technology
 * here is a candidate until it is selected, and the state below says which.
 * PostgreSQL is the configured transactional adapter. Immutable object adapters
 * are wired to opt-in terminal result retention; existing local evidence stays
 * on its own rail. A separate fixture-only Iceberg projection is a local pilot.
 * None of these implementations proves a running production deployment.
 *
 * The reason to write it down is that a store choice is where the doctrine is
 * easiest to lose. Each class therefore carries the invariant its store must
 * preserve, in the same words the seven rules use, so that adopting one later
 * is a decision made against a stated constraint rather than against a
 * benchmark alone.
 */
import type { Fabric } from './doctrine';

/** What kind of store the access pattern asks for. Closed. */
export type StoreKind = 'OBJECT_STORE' | 'RELATIONAL' | 'LAKEHOUSE' | 'SEARCH_INDEX' | 'GRAPH' | 'VECTOR' | 'GEOSPATIAL';

export const STORE_KIND_LABEL: Record<StoreKind, string> = {
  OBJECT_STORE: 'Immutable object storage',
  RELATIONAL: 'Transactional relational storage',
  LAKEHOUSE: 'Lakehouse over object storage',
  SEARCH_INDEX: 'Search index',
  GRAPH: 'Graph database',
  VECTOR: 'Vector store',
  GEOSPATIAL: 'Geospatial database',
};

/**
 * Implementation and configuration are not proof of a running deployment.
 * A local pilot may have an explicit bridge without being a production service.
 */
export type StorageState = 'ADAPTER_READY' | 'LOCAL_PILOT' | 'LOCAL_FILES' | 'FIXTURE' | 'ABSENT';

export const STORAGE_STATE_LABEL: Record<StorageState, string> = {
  ADAPTER_READY: 'Adapter wired when configured; deployment unverified',
  LOCAL_PILOT: 'Fixture-only local pilot; not a production service',
  LOCAL_FILES: 'Local content-addressed files hold it',
  FIXTURE: 'The committed demonstration stands in its place',
  ABSENT: 'Nothing holds it',
};

export interface StorageClass {
  id: 'artifacts' | 'records' | 'analytics' | 'text' | 'entities' | 'embeddings' | 'geospatial';
  /** The information, named the way the corpus names it. */
  dataClass: string;
  kind: StoreKind;
  /** The access pattern that asks for this kind of store, not a feature list. */
  why: string;
  /** Candidate technologies. A candidate is not a choice and not an endorsement. */
  candidates: readonly string[];
  /** Which fabric owns the information. Storage follows responsibility, never the reverse. */
  fabric: Fabric['id'];
  here: { state: StorageState; what: string; where?: string };
  /** The doctrine this store must not break. Adopting it is a decision against this sentence. */
  invariant: string;
  /** What has to be true before choosing one at all. */
  before: string;
}

export const STORAGE_CLASSES: readonly StorageClass[] = [
  {
    id: 'artifacts',
    dataClass: 'Raw artifacts and retained result bytes, with their distinct capture or custody receipts',
    kind: 'OBJECT_STORE',
    why: 'Written once, addressed by content and read with explicit byte limits. Retention and permitted use belong to each source, not to the storage adapter.',
    candidates: ['Exoscale SOS, selected remote adapter target', 'Local immutable files for qualification', 'WARC for captured web material'],
    fabric: 'acquisition',
    here: { state: 'ADAPTER_READY', what: 'Opt-in terminal artifact publication connects a durable PostgreSQL outbox to conditional immutable object writes and verified exact-version readback. Local and Exoscale SOS adapters are available; SOS remains unqualified against the provider. The legacy synchronous evidence rail still writes local immutable files with acquisition receipts: selecting terminal retention does not redirect or migrate that history.', where: '/control' },
    invariant: 'Evidence is not state. Bytes stay append-only and content-addressed, a record of what a source said, never an assertion about the world.',
    before: 'Current source-use and reviewed-action authority are required before storage calls. Provider conformance, authentic TLS, interruption recovery and a retention and recall policy per source remain necessary before production remote custody is accepted.',
  },
  {
    id: 'records',
    dataClass: 'Admission rulings, served records, releases and transactional control history',
    kind: 'RELATIONAL',
    why: 'Transactions bind records to their rulings, ancestry and serving projections; bounded consistent reads preserve temporal and permission semantics.',
    candidates: ['PostgreSQL, selected and wired through pg and drizzle-orm'],
    fabric: 'corpus',
    here: { state: 'ADAPTER_READY', what: 'Configured PostgreSQL adapters hold corpus tables, admission history and terminal control state. Successful opted-in results and their publication outbox entries commit together; object custody and verified lake projection acknowledgements remain separate derived receipts. Without a configured corpus database, the surface declares its demonstration source. Implementation and connection settings do not establish deployment, backups or managed-database recovery.', where: '/stream' },
    invariant: 'Canonical state is not the entire corpus, and valid time is not knowledge time. A snapshot is a version, so table time travel must never be confused with the record\'s own two clocks.',
    before: 'An admission authority is required. src/db/admitRecords.ts remains the one door and never supplies its own authority. Complete declared serving projections, transactional ruling and ancestry binding, and validated readback are required for admitted rows. Incomplete or mismatched history refuses rather than gaining invented metadata. Production migration, restricted-role operation and recovery still need qualification.'
  },
  {
    id: 'analytics',
    dataClass: 'Versioned derived terminal-result indexes and analytical snapshots',
    kind: 'LAKEHOUSE',
    why: 'Columnar snapshot reads preserve analytical versions separately from operational transactions and original evidence or result bytes.',
    candidates: ['Apache Iceberg v2 with Parquet', 'PyIceberg local SQLite catalog for qualification', 'A production catalog remains unselected'],
    fabric: 'projection',
    here: { state: 'LOCAL_PILOT', what: 'tools/terminal_lake writes real Iceberg and Parquet through a local SQLite catalog. The explicit terminal lake bridge accepts only fixture-only published results after current permission and exact artifact-byte verification, then requires fresh-process snapshot readback before a PostgreSQL derived projection acknowledgement. This is connected local qualification, not real-data admission, a production cloud catalog or customer delivery.' },
    invariant: 'Evidence is not state, and valid time is not knowledge time. Iceberg commit time is neither clock. A derived snapshot acknowledgement preserves exact membership and earlier correction history without becoming canonical authority.',
    before: 'Real-data source-use authority, production object and catalog custody, retained snapshot policy and independently qualified recovery are required before expanding this explicit fixture-only projection.',
  },
  {
    id: 'text',
    dataClass: 'Full text and facets over records, artifacts and their extracted fields',
    kind: 'SEARCH_INDEX',
    why: 'Ranked retrieval and faceted counts, which a columnar scan answers slowly and a graph answers not at all.',
    candidates: ['OpenSearch', 'Elasticsearch'],
    fabric: 'projection',
    here: { state: 'ABSENT', what: 'Search is in-memory filtering over the committed fixtures on each page; nothing is indexed.', where: '/cases' },
    invariant: 'Projection never mutates its source, and identity survives representation. An index is a derived view that must be rebuildable from the corpus and must never become the place a fact lives.',
    before: 'Rights evaluation at query time, so that an index cannot return to an audience what the source registration denies it.',
  },
  {
    id: 'entities',
    dataClass: 'Entities and the explicit relationships between them',
    kind: 'GRAPH',
    why: 'Traversal over declared edges: lineage, supersession, identity links, incidence between records and subjects.',
    candidates: ['Neo4j', 'Memgraph', 'ArangoDB'],
    fabric: 'corpus',
    here: { state: 'FIXTURE', what: 'The projection compiler emits a record-to-subject incidence graph from the edges a record already names; the notation kernel holds authored relations with their inverses.', where: '/notations' },
    invariant: 'An edge requires evidence. Visual adjacency is not a semantic edge, geographic proximity is not a causal relationship, and a store that makes edges cheap to create must not make them cheap to assert.',
    before: 'One identity authority. A graph over unresolved identities multiplies the ambiguity instead of recording it.',
  },
  {
    id: 'embeddings',
    dataClass: 'Embeddings computed over artifacts and records',
    kind: 'VECTOR',
    why: 'Approximate nearest-neighbour retrieval for candidate generation, where an exact index has no answer to give.',
    candidates: ['Qdrant', 'Milvus', 'pgvector'],
    fabric: 'compute',
    here: { state: 'ABSENT', what: 'No embedding is computed anywhere in this repository, and no model is trained or served.', where: '/model' },
    invariant: 'Computation produces derived objects, not truth. Embedding similarity is not a canonical relation: a neighbour is a candidate for a human or a validation boundary to judge, never an admitted link.',
    before: 'A declared model, version and input scope per embedding, so a vector can be traced to what produced it and recomputed. Customers apply their own inference to the corpus; this store would serve retrieval, not sell a model.',
  },
  {
    id: 'geospatial',
    dataClass: 'Geodetic positions, footprints and the frames they are declared in',
    kind: 'GEOSPATIAL',
    why: 'Spatial predicates and indexes over declared geometry, with the coordinate reference system carried by the store rather than by convention.',
    candidates: ['PostGIS on PostgreSQL'],
    fabric: 'projection',
    here: { state: 'FIXTURE', what: 'Positions are declared as corpus records and resolved by the projection compiler; the Earth Twin draws one point per declared position and shows the refusal where none exists.', where: '/earth' },
    invariant: 'A projection changes representation, not identity or authority. A coordinate is only as good as the frame and the transform that produced it, and no graph layout or model geometry becomes a geographic position without an explicit transform and evidence for that interpretation.',
    before: 'Frames and transforms as first-class corpus objects, which the recorded-observation contract already models and the corpus does not yet carry.',
  },
];

/** Repository implementation state, not an assertion about externally running services. */
export const STORAGE_PRESENT_STATE = {
  summary: 'PostgreSQL is the configured relational adapter, not the lakehouse. Object adapters are wired to opt-in terminal result publication; legacy local evidence is unchanged and Exoscale SOS remains provider-unqualified. A separate fixture-only Iceberg local pilot has an explicit verified bridge and PostgreSQL acknowledgements. Graphs remain fixture-based and vectors absent. Installed dependencies do not prove running services or production deployment.',
  roots: 'Legacy evidence uses operator-selected .payload/* roots; local object retention and tools/terminal_lake require explicit dedicated roots, not implicit deployment paths',
  dependencies: 'package.json declares pg and drizzle-orm for PostgreSQL and @aws-sdk/client-s3 for the SOS adapter. tools/terminal_lake/requirements.lock.txt separately pins optional Python Iceberg, Arrow and SQL catalog dependencies. No graph, vector, search-index or geospatial database dependency is declared.',
  /** Application adapters wired when explicitly configured, not observed deployed services. */
  wired: ['OBJECT_STORE', 'RELATIONAL'] as const,
} as const;

/** The order a store earns its place, from the sequencing the classes state. */
export const STORAGE_SEQUENCE: readonly string[] = [
  'Qualify remote object custody before production use. The connected terminal outbox requires verified readback; it neither migrates legacy evidence nor turns an installed SDK into provider qualification.',
  'Admission precedes canonical serving: one door binds authority, complete declared serving projections, rulings and ancestry transactionally, with validated readback. Demonstration and refused histories are not promoted by moving storage.',
  'The fixture-only Iceberg bridge is a derived projection of retained terminal results. Preserve earlier snapshots and verify fresh-process readback; qualify real-data authority and production catalog custody before widening it.',
  'Search and geospatial are projections of an admitted corpus and are rebuildable from it; they can arrive late and be rebuilt.',
  'The graph waits on one identity authority, and the vector store on declared models with recomputable inputs.',
];
