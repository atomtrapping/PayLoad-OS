/**
 * Three names, kept apart on purpose.
 *
 * The temptation as this system grows is to let one word absorb the others,
 * and the absorption is not cosmetic: each collapse licenses a specific bad
 * decision.
 *
 *   PayloadOS is the substrate — identity, evidence, state, computation,
 *   policy, execution. It is what the planes are made of.
 *
 *   The Payload Control Plane is the authority — observe, propose, authorize,
 *   execute, verify. Agents operate through it and nothing operates around it.
 *
 *   The Payload Terminal is the human control surface — the command bar, the
 *   world, the context rail, the workspaces, the alerts, the approvals. It is
 *   what a person touches.
 *
 * The Terminal is not the OS. The Control Plane is not the database. The
 * database is not the corpus. The agent is not the authority. Each of those
 * four sentences prevents a particular thing being built: a UI that holds
 * state, a control plane that becomes a schema, a corpus that is confused with
 * its storage, and an agent that grants itself permission.
 *
 * WHAT CHANGES WHEN A UI BECOMES A CONTROL SURFACE
 *
 * A dashboard displays information about the firm. A control surface exposes
 * the firm's computational state and offers bounded mechanisms for changing
 * it. The difference is not visual — it is that the second one can be wrong in
 * ways that cost money, so every path through it that changes anything has to
 * be a proposal that something with authority accepts.
 *
 * Which is what keeps the command bar from being a chatbot. A chatbot turns
 * intent into action. This turns intent into a query or a proposal, and then
 * the policy, the authorization, the execution and the audit happen where they
 * already happen for everything else.
 *
 * THE DISCIPLINE THAT IS EASY TO LOSE
 *
 * Ten planes under one surface is one ERP away from a monolith, and a monolith
 * is the failure mode this architecture exists to avoid: the point of a shared
 * substrate is that the services and stores underneath stay separable while
 * appearing coherent to the operator. Coherence is a property of the identity,
 * the authority and the computational contracts — not of everything living in
 * one process.
 *
 * NOTHING HERE IS OPERATED
 *
 * The planes are the ambition. `planeStanding()` counts the ones this
 * repository actually surfaces and says what the rest are, rather than drawing
 * ten boxes and letting the drawing imply they exist.
 */

/* ── The three names ── */

export const LAYER_NAMES = ['PayloadOS', 'Payload Control Plane', 'Payload Terminal'] as const;
export type LayerName = typeof LAYER_NAMES[number];

export interface LayerContract {
  name: LayerName;
  is: string;
  madeOf: readonly string[];
  /** What collapsing it into another would license. */
  collapsing: string;
}

export const LAYER_CONTRACTS: readonly LayerContract[] = [
  {
    name: 'PayloadOS',
    is: 'The substrate: what the planes are made of.',
    madeOf: ['identity', 'evidence', 'state', 'computation', 'policy', 'execution'],
    collapsing: 'Collapsed into the Terminal, the interface starts holding state, and the firm’s state becomes whatever the last screen said.',
  },
  {
    name: 'Payload Control Plane',
    is: 'The authority: the machinery through which anything changes.',
    madeOf: ['observe', 'propose', 'authorize', 'execute', 'verify'],
    collapsing: 'Collapsed into the database, authority becomes a column somebody can update, and the boundary an agent cannot cross becomes one it can write to.',
  },
  {
    name: 'Payload Terminal',
    is: 'The human control surface: what a person actually operates.',
    madeOf: ['command bar', 'world', 'context rail', 'workspaces', 'alerts', 'approvals'],
    collapsing: 'Collapsed into the control plane, the surface acquires authority of its own, and clicking becomes deciding.',
  },
];

export function layerContract(name: LayerName): LayerContract {
  const found = LAYER_CONTRACTS.find((entry) => entry.name === name);
  if (!found) throw new Error(`CONTROL_PLANE_UNKNOWN_LAYER:${name}`);
  return found;
}

/** The four sentences, each preventing a particular thing being built. */
export const SEPARATIONS: readonly string[] = [
  'The Terminal is not the OS.',
  'The Control Plane is not the database.',
  'The database is not the corpus.',
  'The agent is not the authority.',
];

/* ── The planes ── */

/**
 * What the surface can observe or control. `surfaced` says whether this
 * repository has a route for it today — the honest half of the diagram.
 */
export interface OperatingPlane {
  plane: string;
  controls: string;
  surfaced: boolean;
}

export const OPERATING_PLANES: readonly OperatingPlane[] = [
  { plane: 'Corpus', controls: 'Sources, observations, entities, provenance, releases', surfaced: true },
  { plane: 'Acquisition', controls: 'Collection attempts, ingestion jobs, evidence gaps', surfaced: true },
  { plane: 'Compute', controls: 'Mining, models, simulations, graph and spatial workloads', surfaced: true },
  { plane: 'Intelligence', controls: 'Findings, predictions, anomalies, opportunities', surfaced: false },
  { plane: 'Products', controls: 'Caravan, Tradewind and Landshark outputs', surfaced: true },
  { plane: 'Commercial', controls: 'Accounts, opportunities, engagement proposals', surfaced: false },
  { plane: 'Operations', controls: 'Authorized procurement, logistics and workflows', surfaced: false },
  { plane: 'Agents', controls: 'Tasks, permissions, proposals, executions', surfaced: true },
  { plane: 'Infrastructure', controls: 'Services, jobs, failures, compute and storage health', surfaced: true },
  { plane: 'Governance', controls: 'Rights, policy, approvals, audit, verification', surfaced: true },
];

export const MONOLITH_WARNING =
  'Ten planes under one surface is one decision away from an ERP. The substrate supplies shared state, identity, authority and computational contracts; it does not supply one process. The services and stores underneath stay separable, and the coherence the operator sees is a property of the contracts rather than of the deployment.';

/* ── The command bar ── */

/**
 * What an instruction becomes. The second step is the whole difference between
 * a control surface and a chatbot: intent becomes a question or a request, and
 * never an action.
 */
export const INTENT_PIPELINE = ['Intent', 'Query or proposal', 'Policy', 'Authorization', 'Execution', 'Audit'] as const;

/** The two things an instruction may become, and nothing else. */
export const INTENT_OUTCOMES = ['QUERY', 'PROPOSAL'] as const;
export type IntentOutcome = typeof INTENT_OUTCOMES[number];

export const COMMAND_BAR_RULE =
  'The command bar translates intent into a bounded operation. An instruction becomes a query or a proposal; it never becomes an execution. That is the difference between a chatbot interface and an operating surface, and it is the reason the bar can be given to someone who is in a hurry.';

/**
 * Instructions a reader would actually type, each with what it resolves to.
 * Both kinds are present deliberately: a list where everything is a query
 * would make the boundary look like a limitation rather than a shape.
 */
export interface CommandExample {
  instruction: string;
  becomes: IntentOutcome;
  /** The plane it acts on. */
  plane: string;
}

export const COMMAND_EXAMPLES: readonly CommandExample[] = [
  { instruction: 'show corridors with increasing port congestion', becomes: 'QUERY', plane: 'Intelligence' },
  { instruction: 'find manufacturers with concentrated supply exposure', becomes: 'QUERY', plane: 'Compute' },
  { instruction: 'show the evidence behind this supplier relationship', becomes: 'QUERY', plane: 'Corpus' },
  { instruction: 'show failed acquisition jobs', becomes: 'QUERY', plane: 'Acquisition' },
  { instruction: 'compare the predicted shipment state with observations', becomes: 'QUERY', plane: 'Compute' },
  { instruction: 'run dependency analysis on this company', becomes: 'PROPOSAL', plane: 'Compute' },
  { instruction: 'draft an engagement proposal for these accounts', becomes: 'PROPOSAL', plane: 'Commercial' },
  { instruction: 'run landed-cost alternatives', becomes: 'PROPOSAL', plane: 'Operations' },
];

/* ── The twin as a control surface ── */

/**
 * Why the map stops being ornamental.
 *
 * A facility on a screen is worth something when clicking it traverses the
 * state rather than opening a description of it. These are the traversals the
 * world model has to support to be an interface to the firm rather than a
 * picture of the world.
 */
export const TWIN_TRAVERSALS: readonly string[] = [
  'Evidence', 'Ownership', 'Materials', 'Suppliers', 'Shipments', 'Routes', 'Risk', 'Models',
  'Commercial relationships', 'Agent activity',
];

/**
 * And the states it must be able to distinguish visually. A renderer that
 * cannot tell observed from predicted will imply a certainty the evidence layer
 * does not have — and it will imply it more convincingly than prose ever could,
 * because a shape on a map does not look like a claim.
 */
export const TWIN_STATES = ['observed', 'canonical', 'inferred', 'predicted', 'stale', 'uncertain', 'unavailable'] as const;

export const TWIN_RULE =
  'The twin is a projection over canonical state and computational output, never a source of truth and never a second database. It must distinguish observed, canonical, inferred, predicted, stale, uncertain and unavailable, because a shape on a map does not look like a claim and will be believed like a fact.';

/* ── The firm as state ── */

/**
 * Normally a firm's state is spread across email, a CRM, chat, spreadsheets, an
 * ERP, several databases and the heads of the people who work there. This names
 * the components of one coherent state model instead — coherent, deliberately
 * not singular, because one model is a contract and one database is a monolith.
 */
export const FIRM_STATE_COMPONENTS = ['corpus', 'compute', 'commercial', 'operations', 'agents', 'infrastructure'] as const;

/** The questions the surface should be able to answer about the firm itself. */
export const FIRM_QUESTIONS: readonly string[] = [
  'What are we acquiring?',
  'What did we learn?',
  'What computations are running?',
  'What opportunities were discovered?',
  'What are agents proposing?',
  'What requires approval?',
  'What did we execute?',
  'What happened afterwards?',
  'Which predictions were wrong?',
];

export const FIRM_LOOP = ['Observe', 'Understand', 'Decide', 'Act', 'Measure', 'Learn'] as const;

/**
 * The last question is the one that makes the loop a loop, and the one a
 * dashboard never asks. It is answerable here only because predictions are a
 * class that carries a horizon and a validation state.
 */
export const WHY_PROVENANCE_MATTERS_HERE =
  'Because provenance is preserved, the surface can show why the system believes what it believes rather than presenting a generated conclusion as an unexplained truth. A control surface that cannot answer "on what evidence" is a dashboard with buttons.';

/* ── Standing ── */

export function planeStanding(planes: readonly OperatingPlane[] = OPERATING_PLANES) {
  const surfaced = planes.filter((plane) => plane.surfaced);
  return {
    planes: planes.length,
    surfaced: surfaced.length,
    notSurfaced: planes.length - surfaced.length,
    awaiting: planes.filter((plane) => !plane.surfaced).map((plane) => plane.plane),
    /* Queries outnumber proposals, and that is the shape rather than a gap. */
    queries: COMMAND_EXAMPLES.filter((example) => example.becomes === 'QUERY').length,
    proposals: COMMAND_EXAMPLES.filter((example) => example.becomes === 'PROPOSAL').length,
    executionsFromIntent: 0,
  } as const;
}
