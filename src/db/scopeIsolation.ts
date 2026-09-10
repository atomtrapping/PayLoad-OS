/**
 * Scope isolation, in the database.
 *
 * `src/domain/governedScopes.ts` states the boundary. This is where a query
 * that looks entirely reasonable still cannot cross it.
 *
 * TWO CONSTRAINTS, AND THEY REFUSE DIFFERENT ROWS
 *
 * The holder check refuses a crossing between two different holders: a
 * customer's records and the firm's reusable corpus have different owners, so
 * one cannot feed the other whatever the class rule says. The flow check
 * refuses a crossing between two classes even when the holder is the same.
 *
 * That distinction matters more than it looks. For the sentence this module is
 * named for — a customer's private contract cannot reach the reusable corpus —
 * the holder check already refuses the row, and a test written from that
 * sentence would pass with the flow check deleted. The flow check is the sole
 * refuser in exactly one place: a crossing between two of the firm's own
 * classes, which is why the test for it is written at RESEARCH_ACCOUNT into
 * FIRM_OPERATIONAL, where both scopes are the firm's and only the class rule
 * stands between them.
 *
 * LEARNING IS A SEPARATE TABLE BECAUSE IT IS A SEPARATE FAILURE
 *
 * A read that was permitted and a fit that was not are different events. A
 * model fitted on a customer's private constraint carries it wherever the model
 * goes and cannot be asked to forget, so training inputs are recorded
 * separately with their own check rather than being one more kind of read.
 *
 * THE DOOR IS A COLUMN, NOT A CONVENTION
 *
 * Every scope names its admission authority, and a record carries the authority
 * that admitted it, tied to the scope by a composite key. A record admitted
 * through some other authority does not go in. That is what "one door per
 * governed object" means concretely, and it says nothing about how many
 * servers there are.
 *
 * AND NOTHING IS ISOLATED YET
 *
 * No customer is onboarded, so no customer-private scope exists. The tables
 * are empty and `scopeStanding()` derives that rather than printing it.
 */
import {
  BOUNDARY_SURFACES, HOLDER_PARTITIONED, PERMITTED_FLOWS, SCOPE_CLASSES, SCOPE_CONTRACTS,
  TRAINABLE_SCOPES,
} from '@/domain/governedScopes';

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/** The permitted (from, to) class pairs, derived from the flow table. */
const FLOWS = PERMITTED_FLOWS.map((flow) => `('${flow.from}', '${flow.to}')`).join(', ');

/**
 * The classes whose holder is the firm. A crossing between two of these is the
 * only place the flow check is the sole refuser, which is where its test lives.
 */
export const FIRM_HELD_CLASSES: readonly string[] =
  SCOPE_CLASSES.filter((cls) => SCOPE_CONTRACTS[cls].holder === 'FIRM');

export const SCOPE_ISOLATION_DDL = `
CREATE TABLE governed_scope (
  scope_id text PRIMARY KEY,
  scope_class text NOT NULL CHECK (scope_class IN (${quoted(SCOPE_CLASSES)})),
  -- Whose records these are. The firm, or one named counterparty.
  holder_id text NOT NULL CHECK (length(btrim(holder_id)) > 0),
  -- The door: who may admit a record into this scope. Not where the bytes live.
  admission_authority text NOT NULL CHECK (length(btrim(admission_authority)) > 0),
  opened_at timestamptz NOT NULL,

  -- The one uniqueness that constrains data rather than restating the key:
  -- a holder gets one scope of each class, so "the customer's private scope"
  -- names exactly one thing.
  CONSTRAINT scope_one_per_holder_and_class UNIQUE (holder_id, scope_class),

  -- Composite targets. These restate the primary key on purpose: they exist so
  -- children can tie to a column, and they constrain no data of their own.
  UNIQUE (scope_id, scope_class),
  UNIQUE (scope_id, holder_id),
  UNIQUE (scope_id, admission_authority)
);

-- A record, and the scope that holds it.
CREATE TABLE scoped_record (
  record_key text PRIMARY KEY,
  scope_id text NOT NULL,
  scope_class text NOT NULL,
  holder_id text NOT NULL,
  -- The canonical identity. Deliberately NOT unique: the same entity appears in
  -- many scopes, and that is the property the whole substrate is built on.
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  -- The authority that actually admitted it, tied to the scope's door below.
  admitted_by text NOT NULL,
  admitted_at timestamptz NOT NULL,

  CONSTRAINT record_scope FOREIGN KEY (scope_id, scope_class) REFERENCES governed_scope (scope_id, scope_class),
  CONSTRAINT record_holder FOREIGN KEY (scope_id, holder_id) REFERENCES governed_scope (scope_id, holder_id),
  -- The door. A record admitted through some other authority does not go in.
  CONSTRAINT record_admitted_through_the_scopes_door FOREIGN KEY (scope_id, admitted_by)
    REFERENCES governed_scope (scope_id, admission_authority)
);

-- One record read by a computation that produced something in another scope.
CREATE TABLE scope_crossing (
  crossing_id text PRIMARY KEY,
  surface text NOT NULL CHECK (surface IN (${quoted(BOUNDARY_SURFACES)})),

  -- Where it was read from, denormalised and tied.
  from_scope_id text NOT NULL,
  from_scope_class text NOT NULL,
  from_holder_id text NOT NULL,
  -- Where the result landed, likewise.
  to_scope_id text NOT NULL,
  to_scope_class text NOT NULL,
  to_holder_id text NOT NULL,
  crossed_at timestamptz NOT NULL,

  CONSTRAINT crossing_from_class FOREIGN KEY (from_scope_id, from_scope_class) REFERENCES governed_scope (scope_id, scope_class),
  CONSTRAINT crossing_from_holder FOREIGN KEY (from_scope_id, from_holder_id) REFERENCES governed_scope (scope_id, holder_id),
  CONSTRAINT crossing_to_class FOREIGN KEY (to_scope_id, to_scope_class) REFERENCES governed_scope (scope_id, scope_class),
  CONSTRAINT crossing_to_holder FOREIGN KEY (to_scope_id, to_holder_id) REFERENCES governed_scope (scope_id, holder_id),

  -- A crossing out of a holder-partitioned scope stays with that holder. This
  -- is what refuses one customer's record reaching another customer, and one
  -- customer's record reaching the firm's reusable corpus.
  CONSTRAINT crossing_stays_with_its_holder CHECK (
    from_scope_class NOT IN (${quoted(HOLDER_PARTITIONED)}) OR from_holder_id = to_holder_id
  ),

  -- And a crossing between classes is one the flow table permits. Between two
  -- of the firm's own classes this is the only thing standing in the way.
  CONSTRAINT crossing_is_a_permitted_flow CHECK (
    from_scope_class = to_scope_class OR (from_scope_class, to_scope_class) IN (${FLOWS})
  )
);

-- What a model was fitted on. Separate from a read, because it is a separate
-- failure and it cannot be undone.
CREATE TABLE training_input (
  training_input_id text PRIMARY KEY,
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  scope_id text NOT NULL,
  scope_class text NOT NULL,
  fitted_at timestamptz NOT NULL,

  CONSTRAINT training_scope FOREIGN KEY (scope_id, scope_class) REFERENCES governed_scope (scope_id, scope_class),
  -- A model is fitted only on scopes that permit it. A customer's private
  -- records are not training data, and neither is a live account's fills.
  CONSTRAINT training_only_on_trainable_scopes CHECK (scope_class IN (${quoted(TRAINABLE_SCOPES)}))
);

CREATE INDEX scoped_record_by_entity ON scoped_record (entity_id);
CREATE INDEX crossing_by_from ON scope_crossing (from_scope_id, crossed_at);
CREATE INDEX training_by_model ON training_input (model_id);
`;

/** Every column the DDL creates, by table, for the drift check. */
export function scopeDdlColumns(ddl = SCOPE_ISOLATION_DDL): Record<string, string[]> {
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
