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
 * A QUOTE AND A BUILD ARE TWO SNAPSHOTS
 *
 * Both are kept, and the build cannot precede the quote. A customer billed
 * against one and delivered the other can see the difference, which is the
 * only way an amendment is distinguishable from a substitution.
 *
 * A REFRESH IS A NEW RELEASE
 *
 * Versions strictly increase and the predecessor stays. Nothing here updates a
 * released dossier, because a customer who acted on last quarter's version
 * needs it to still say what it said when they acted.
 *
 * AND NOTHING CAN BE QUOTED AT ALL
 *
 * A quotation names the pricing policy it was priced under. No policy is
 * approved, so the foreign key has nothing to point at and no quotation can be
 * written — which is the structural form of "an agent may not invent a price".
 */
import {
  CANDIDATE_STANDINGS, DOSSIER_FACETS, DOSSIER_STAGES, REUSABLE_STANDINGS,
} from '@/domain/dossierService';
import { DERIVABLE_CLASSES } from '@/domain/discoveryLayer';

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

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

-- The pricing policy a quotation is priced under. There are none.
CREATE TABLE pricing_policy (
  policy_id text PRIMARY KEY,
  approved_by text NOT NULL CHECK (length(btrim(approved_by)) > 0),
  approved_at timestamptz NOT NULL
);

-- What the work was estimated at, against the inventory at the time of asking.
CREATE TABLE dossier_quotation (
  quotation_id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossier_spec (dossier_id),
  -- No approved policy, no quotation. An agent may tailor the package and may
  -- not invent the number.
  pricing_policy_id text NOT NULL REFERENCES pricing_policy (policy_id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (length(currency) = 3),
  -- The corpus as it stood when the quote was given.
  quoted_snapshot text NOT NULL CHECK (quoted_snapshot ~ '^sha256:[a-f0-9]{64}$'),
  quoted_at timestamptz NOT NULL,
  UNIQUE (quotation_id, quoted_snapshot, quoted_at)
);

-- What was compiled, and released.
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
  -- The corpus as it stood when the dossier was BUILT, which may differ.
  built_snapshot text NOT NULL CHECK (built_snapshot ~ '^sha256:[a-f0-9]{64}$'),
  built_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL,
  monitored boolean NOT NULL DEFAULT false,

  CONSTRAINT release_spec FOREIGN KEY (dossier_id, recipient_id) REFERENCES dossier_spec (dossier_id, recipient_id),
  CONSTRAINT release_quotation FOREIGN KEY (quotation_id, quoted_snapshot, quoted_at)
    REFERENCES dossier_quotation (quotation_id, quoted_snapshot, quoted_at),
  -- The build reads the corpus as it stands when it runs, so it cannot have
  -- read it before the quote was given.
  CONSTRAINT release_built_after_quoted CHECK (built_at >= quoted_at),
  CONSTRAINT release_released_after_built CHECK (released_at >= built_at),

  CONSTRAINT release_version_once UNIQUE (dossier_id, version),
  UNIQUE (dossier_release_id, recipient_id),
  UNIQUE (dossier_release_id, version)
);

-- A refresh, which is a new release rather than an edit of the old one.
CREATE TABLE release_succession (
  succession_id text PRIMARY KEY,
  successor_release_id text NOT NULL,
  successor_version integer NOT NULL,
  predecessor_release_id text NOT NULL,
  predecessor_version integer NOT NULL,

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
  CONSTRAINT conclusion_presented_at_its_class CHECK (presented_as = artifact_class)
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

-- Who it was handed to. The recipient is a free column so the wrong one is a
-- row somebody can write and the database can refuse.
CREATE TABLE dossier_delivery (
  delivery_id text PRIMARY KEY,
  dossier_release_id text NOT NULL,
  recipient_id text NOT NULL CHECK (length(btrim(recipient_id)) > 0),
  delivered_at timestamptz NOT NULL,

  CONSTRAINT delivery_goes_to_the_dossiers_recipient FOREIGN KEY (dossier_release_id, recipient_id)
    REFERENCES dossier_release (dossier_release_id, recipient_id)
);

CREATE INDEX conclusion_by_release ON dossier_conclusion (dossier_release_id);
CREATE INDEX release_by_dossier ON dossier_release (dossier_id, version);
CREATE INDEX approval_by_recipient ON customer_approval (recipient_id);
`;

/** The classes a conclusion may carry, for the drift check against the domain. */
export const CONCLUSION_CLASSES = DERIVABLE_CLASSES;

/** Every column the DDL creates, by table, for the drift check. */
export function dossierDdlColumns(ddl = DOSSIER_LEDGER_DDL): Record<string, string[]> {
  const tables: Record<string, string[]> = {};
  for (const match of ddl.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)) {
    const [, table, body] = match;
    tables[table] = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('--') && !/^(CONSTRAINT|UNIQUE|CHECK|FOREIGN KEY|PRIMARY KEY)\b/.test(line))
      .map((line) => line.split(/\s+/)[0])
      .filter((name) => /^[a-z_]+$/.test(name));
  }
  return tables;
}
