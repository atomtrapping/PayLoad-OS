/**
 * Dossier delivery, in the database.
 *
 * `src/domain/dossierService.ts` states the contract. This is where the
 * expensive mistakes stop depending on anyone remembering it.
 *
 * THE RECIPIENT IS A FREE COLUMN ON PURPOSE
 *
 * A first draft of this schema determined the recipient once, on the spec, and
 * let every table below inherit it. That is tidier and it is useless: if a
 * delivery cannot name a recipient of its own, then delivering customer A's
 * dossier to customer B is not a row the schema can represent — and a failure
 * that cannot be represented cannot be refused, cannot be tested, and will
 * eventually happen in application code where no constraint is looking.
 *
 * So `dossier_delivery` carries its own recipient, tied to the release's by a
 * composite key. The wrong recipient is a row somebody can write, and it is a
 * row the database does not accept.
 *
 * AN APPROVAL BELONGS TO ONE CUSTOMER AND ONE APPLICATION
 *
 * A customer-approved supplier carries the customer and the application that
 * approved it, and the corpus-level candidate table accepts only the two
 * standings the corpus owns. There is no column in which a corpus candidate
 * can be CUSTOMER_APPROVED, so one buyer's qualification work cannot be
 * promoted into inventory sold to the next.
 *
 * THE ESTIMATE IS A COUNT AND THE PRICE IS A POLICY
 *
 * A coverage row per facet says what the inventory held. An estimate is a
 * count of units over those rows, with its method named. A quotation carries
 * the estimate's units and the policy's unit rate, both tied to their rows by
 * composite key, and a CHECK requires the amount to be their product. An
 * agent can produce every row above the quotation and cannot produce the
 * rate, and the quotation cannot carry a number the two do not multiply to.
 *
 * A RELEASE IS AUTHORIZED TWICE, AND BOTH TIMES OF A DIGEST
 *
 * Once by the customer, who accepted a quotation: the release carries the
 * quotation's digest and the authorization the customer's approval produced,
 * tied by (authorization, digest) into the execution ledger. Once by a
 * reviewer, who approved this release: the release carries its own digest —
 * over its conclusions and snapshots — and the authorization that approval
 * produced, tied the same way. A release compiled against a quote the
 * customer did not accept has no scope authorization to name; a release
 * edited after review has a digest no authorization carries. Both are rows the
 * database refuses, and one authorization releases one version.
 *
 * A QUOTE AND A BUILD ARE TWO SNAPSHOTS
 *
 * Both are kept, and the build cannot precede the quote. A customer billed
 * against one and delivered the other can see the difference, which is the
 * only way an amendment is distinguishable from a substitution.
 *
 * A REFRESH IS A NEW RELEASE, AND A DELIVERY IS A DISPATCH
 *
 * Versions strictly increase and the predecessor stays. A delivery names the
 * execution attempt that carried it, so "delivered" is an outcome the action
 * layer recorded — CONFIRMED, REJECTED or OUTCOME_UNKNOWN — and not a column
 * somebody set. What the receipt rests on is a required sentence, and in the
 * demonstration that sentence says the receipt was simulated locally.
 *
 * AND AGAINST THE REAL CORPUS NOTHING CAN BE QUOTED
 *
 * A quotation names the pricing policy it was priced under. No policy is
 * approved for the real corpus, so the foreign key has nothing to point at
 * and no quotation can be written — which is the structural form of "an agent
 * may not invent a price". The demonstration seeds one, and says so.
 */
import {
  CANDIDATE_STANDINGS, COVERAGE_LEVELS, DOSSIER_FACETS, DOSSIER_STAGES, REUSABLE_STANDINGS,
} from '@/domain/dossierService';
import { DERIVABLE_CLASSES } from '@/domain/discoveryLayer';
import { quoted } from './ddl';

export const DOSSIER_LEDGER_DDL = `
-- What was asked, and by whom.
CREATE TABLE dossier_spec (
  dossier_id text PRIMARY KEY,
  recipient_id text NOT NULL CHECK (length(btrim(recipient_id)) > 0),
  question text NOT NULL CHECK (length(btrim(question)) > 0),
  stage text NOT NULL CHECK (stage IN (${quoted(DOSSIER_STAGES)})),
  asked_at timestamptz NOT NULL,
  UNIQUE (dossier_id, recipient_id)
);

-- One facet of the question. Nine possible; a spec asks for the ones it needs.
CREATE TABLE dossier_facet (
  dossier_facet_id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossier_spec (dossier_id),
  facet text NOT NULL CHECK (facet IN (${quoted(DOSSIER_FACETS)})),
  CONSTRAINT facet_once_per_dossier UNIQUE (dossier_id, facet)
);

-- What the inventory held for one facet, at the time of asking.
CREATE TABLE dossier_coverage (
  coverage_id text PRIMARY KEY,
  dossier_facet_id text NOT NULL UNIQUE REFERENCES dossier_facet (dossier_facet_id),
  level text NOT NULL CHECK (level IN (${quoted(COVERAGE_LEVELS)})),
  artifacts_available integer NOT NULL CHECK (artifacts_available >= 0),
  runs_represented integer NOT NULL CHECK (runs_represented >= 0),
  -- Which artifacts, so the count is a count of something a reader can open.
  artifact_ids text[] NOT NULL DEFAULT '{}',
  basis text NOT NULL CHECK (length(btrim(basis)) > 0),
  assessed_at timestamptz NOT NULL,
  -- NONE means none, and none means NONE.
  CONSTRAINT coverage_none_is_zero CHECK ((level = 'NONE') = (artifacts_available = 0)),
  CONSTRAINT coverage_names_what_it_counts CHECK (cardinality(artifact_ids) = artifacts_available)
);

-- Units of work, counted over the coverage rows by a named method.
CREATE TABLE dossier_estimate (
  estimate_id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossier_spec (dossier_id),
  method text NOT NULL CHECK (length(btrim(method)) > 0),
  units integer NOT NULL CHECK (units > 0),
  per_facet jsonb NOT NULL,
  estimate_digest text NOT NULL CHECK (estimate_digest ~ '^sha256:[a-f0-9]{64}$'),
  estimated_at timestamptz NOT NULL,
  CONSTRAINT estimate_per_facet_is_array CHECK (jsonb_typeof(per_facet) = 'array'),
  UNIQUE (estimate_id, units)
);

-- The pricing policy a quotation is priced under, with the rate it sets.
CREATE TABLE pricing_policy (
  policy_id text PRIMARY KEY,
  approved_by text NOT NULL CHECK (length(btrim(approved_by)) > 0),
  approved_at timestamptz NOT NULL,
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor > 0),
  currency text NOT NULL CHECK (length(currency) = 3),
  unit text NOT NULL CHECK (length(btrim(unit)) > 0),
  UNIQUE (policy_id, unit_price_minor, currency)
);

-- What the work was quoted at: the estimate's units at the policy's rate.
CREATE TABLE dossier_quotation (
  quotation_id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossier_spec (dossier_id),
  -- No approved policy, no quotation. An agent may tailor the package and may
  -- not invent the number.
  pricing_policy_id text NOT NULL,
  unit_price_minor bigint NOT NULL,
  currency text NOT NULL,
  estimate_id text NOT NULL,
  units integer NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  -- The corpus as it stood when the quote was given.
  quoted_snapshot text NOT NULL CHECK (quoted_snapshot ~ '^sha256:[a-f0-9]{64}$'),
  quoted_at timestamptz NOT NULL,
  -- The digest of the quotation as put to the customer. Their acceptance is of this.
  quotation_digest text NOT NULL CHECK (quotation_digest ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT quotation_policy FOREIGN KEY (pricing_policy_id, unit_price_minor, currency)
    REFERENCES pricing_policy (policy_id, unit_price_minor, currency),
  CONSTRAINT quotation_estimate FOREIGN KEY (estimate_id, units) REFERENCES dossier_estimate (estimate_id, units),
  -- The one arithmetic that is a single-row fact.
  CONSTRAINT quotation_is_units_at_the_rate CHECK (amount_minor = units * unit_price_minor),
  UNIQUE (quotation_id, quoted_snapshot, quoted_at),
  UNIQUE (quotation_id, quotation_digest)
);

-- What was compiled, and released, under two authorizations.
CREATE TABLE dossier_release (
  dossier_release_id text PRIMARY KEY,
  dossier_id text NOT NULL,
  -- Carried here rather than looked up, so the delivery below can be tied to it.
  recipient_id text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  quotation_id text NOT NULL,
  -- Denormalised from the quotation and tied, so the ordering check below is
  -- about the quote that actually priced this work.
  quoted_snapshot text NOT NULL,
  quoted_at timestamptz NOT NULL,
  quotation_digest text NOT NULL,
  -- The customer's acceptance of that quotation: an authorization in the
  -- execution ledger, of that digest.
  scope_authorization_id text NOT NULL,
  -- The corpus as it stood when the dossier was BUILT, which may differ.
  built_snapshot text NOT NULL CHECK (built_snapshot ~ '^sha256:[a-f0-9]{64}$'),
  built_at timestamptz NOT NULL,
  -- The digest of the compiled release, and the reviewer's approval of it.
  release_digest text NOT NULL CHECK (release_digest ~ '^sha256:[a-f0-9]{64}$'),
  authorization_id text NOT NULL,
  released_at timestamptz NOT NULL,
  monitored boolean NOT NULL DEFAULT false,

  CONSTRAINT release_spec FOREIGN KEY (dossier_id, recipient_id) REFERENCES dossier_spec (dossier_id, recipient_id),
  CONSTRAINT release_quotation FOREIGN KEY (quotation_id, quoted_snapshot, quoted_at)
    REFERENCES dossier_quotation (quotation_id, quoted_snapshot, quoted_at),
  CONSTRAINT release_quotation_digest FOREIGN KEY (quotation_id, quotation_digest)
    REFERENCES dossier_quotation (quotation_id, quotation_digest),
  -- The customer accepted THIS quotation. No acceptance, no release.
  CONSTRAINT release_scope_accepted FOREIGN KEY (scope_authorization_id, quotation_digest)
    REFERENCES execution_authorization (authorization_id, action_digest),
  -- A reviewer approved THIS release. A release edited after review has a
  -- digest no authorization carries.
  CONSTRAINT release_reviewed FOREIGN KEY (authorization_id, release_digest)
    REFERENCES execution_authorization (authorization_id, action_digest),
  CONSTRAINT release_two_authorizations CHECK (authorization_id <> scope_authorization_id),
  -- The build reads the corpus as it stands when it runs, so it cannot have
  -- read it before the quote was given.
  CONSTRAINT release_built_after_quoted CHECK (built_at >= quoted_at),
  CONSTRAINT release_released_after_built CHECK (released_at >= built_at),

  CONSTRAINT release_version_once UNIQUE (dossier_id, version),
  -- One approval releases one version.
  CONSTRAINT release_authorization_once UNIQUE (authorization_id),
  UNIQUE (dossier_release_id, recipient_id),
  UNIQUE (dossier_release_id, version)
);

-- A refresh or a correction, which is a new release rather than an edit of the old one.
CREATE TABLE release_succession (
  succession_id text PRIMARY KEY,
  successor_release_id text NOT NULL,
  successor_version integer NOT NULL,
  predecessor_release_id text NOT NULL,
  predecessor_version integer NOT NULL,
  -- Why. A refresh says the corpus moved; a correction names what was wrong.
  because text NOT NULL CHECK (length(btrim(because)) > 0),

  CONSTRAINT succession_successor FOREIGN KEY (successor_release_id, successor_version)
    REFERENCES dossier_release (dossier_release_id, version),
  CONSTRAINT succession_predecessor FOREIGN KEY (predecessor_release_id, predecessor_version)
    REFERENCES dossier_release (dossier_release_id, version),
  -- Forward only. This also refuses a release succeeding itself, since a
  -- version cannot exceed itself.
  CONSTRAINT succession_moves_forward CHECK (successor_version > predecessor_version),
  CONSTRAINT succession_predecessor_once UNIQUE (predecessor_release_id)
);

-- What the dossier concluded, per facet.
CREATE TABLE dossier_conclusion (
  conclusion_id text PRIMARY KEY,
  dossier_release_id text NOT NULL REFERENCES dossier_release (dossier_release_id),
  facet text NOT NULL CHECK (facet IN (${quoted(DOSSIER_FACETS)})),
  statement text NOT NULL CHECK (length(btrim(statement)) > 0),
  -- What the evidence did not cover. Never blank: an omitted gap reads as
  -- completeness, and a customer cannot ask about a hole they cannot see.
  not_covered text NOT NULL CHECK (length(btrim(not_covered)) > 0),
  -- Where it came from, and the class it actually carries.
  artifact_id text NOT NULL,
  artifact_class text NOT NULL,
  -- And the class the dossier presents it as.
  presented_as text NOT NULL,

  CONSTRAINT conclusion_artifact FOREIGN KEY (artifact_id, artifact_class)
    REFERENCES derived_artifact (artifact_id, claim_class),
  -- A dossier is a serving surface and being well-written does not exempt it.
  CONSTRAINT conclusion_presented_at_its_class CHECK (presented_as = artifact_class),
  CONSTRAINT conclusion_once_per_facet UNIQUE (dossier_release_id, facet)
);

-- A supplier the corpus surfaced. The corpus owns two standings and not the third.
CREATE TABLE corpus_candidate (
  candidate_id text PRIMARY KEY,
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  -- CUSTOMER_APPROVED is absent. There is no column here in which one buyer's
  -- qualification work becomes a property of the supplier.
  standing text NOT NULL CHECK (standing IN (${quoted(REUSABLE_STANDINGS)})),
  found_at timestamptz NOT NULL
);

-- And a supplier one customer approved, for one application.
CREATE TABLE customer_approval (
  approval_id text PRIMARY KEY,
  entity_id text NOT NULL,
  recipient_id text NOT NULL CHECK (length(btrim(recipient_id)) > 0),
  -- The specification it was approved against. A different application is a
  -- different question, even for the same buyer.
  application text NOT NULL CHECK (length(btrim(application)) > 0),
  standing text NOT NULL CHECK (standing IN (${quoted(CANDIDATE_STANDINGS)})),
  approved_at timestamptz NOT NULL,

  -- Only the customer-held standing lives here, and only with both of the
  -- things that scope it.
  CONSTRAINT approval_is_customer_held CHECK (standing = 'CUSTOMER_APPROVED'),
  CONSTRAINT approval_once UNIQUE (entity_id, recipient_id, application)
);

-- Who it was handed to, and the dispatch that handed it. The recipient is a
-- free column so the wrong one is a row somebody can write and the database
-- can refuse.
CREATE TABLE dossier_delivery (
  delivery_id text PRIMARY KEY,
  dossier_release_id text NOT NULL,
  recipient_id text NOT NULL CHECK (length(btrim(recipient_id)) > 0),
  -- The execution attempt that carried it. Delivered is what the action
  -- layer recorded, not a column somebody set.
  attempt_id text NOT NULL UNIQUE REFERENCES execution_attempt (attempt_id),
  -- What the receipt rests on. In the demonstration: a local simulation.
  receipt_basis text NOT NULL CHECK (length(btrim(receipt_basis)) > 0),
  delivered_at timestamptz NOT NULL,

  CONSTRAINT delivery_goes_to_the_dossiers_recipient FOREIGN KEY (dossier_release_id, recipient_id)
    REFERENCES dossier_release (dossier_release_id, recipient_id)
);

CREATE INDEX conclusion_by_release ON dossier_conclusion (dossier_release_id);
CREATE INDEX release_by_dossier ON dossier_release (dossier_id, version);
CREATE INDEX approval_by_recipient ON customer_approval (recipient_id);
CREATE INDEX coverage_by_facet ON dossier_coverage (dossier_facet_id);
`;

/** The classes a conclusion may carry, for the drift check against the domain. */
export const CONCLUSION_CLASSES = DERIVABLE_CLASSES;
