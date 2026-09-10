/**
 * The newsroom's boundaries, against an actual PostgreSQL engine.
 *
 * The case this file exists for is the loop: the firm publishes a finding, an
 * account repeats it, acquisition admits the repetition, and the corpus quietly
 * acquires a second source for a claim it invented. Every step of that is
 * reasonable, which is why it is refused at the row.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { NEWSROOM_CLASSES, PUBLICATION_CLASSES } from '@/domain/editorialPlane';
import { DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS } from './discoveryLedger';
import { EDITORIAL_LEDGER_DDL, REFUSED_PUBLICATION_CLASSES } from './editorialLedger';
import { ddlColumns } from './ddl';

let client: PGlite;
let scenario = 0;

const T_KNOWN = '2026-08-01T08:00:00.000Z';
const T_FOUND = '2026-08-02T09:00:00.000Z';
const T_PUB = '2026-08-03T09:00:00.000Z';
const T_SEEN = '2026-08-04T09:00:00.000Z';
const FP = (n: number) => `sha256:${String(n).repeat(2).padStart(64, '0')}`;

const CORPUS_DDL = `
CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, data jsonb NOT NULL);
CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
CREATE TABLE corpus_record (record_id text PRIMARY KEY, release_id text NOT NULL, subject_id text NOT NULL, predicate text NOT NULL, known_at timestamptz NOT NULL, UNIQUE (record_id, known_at));
`;

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA ed_${scenario}; SET search_path TO ed_${scenario};
    ${CORPUS_DDL}${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}${EDITORIAL_LEDGER_DDL}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO ed_${scenario}; ${statement}`);
}
async function tx(statement: string) {
  try {
    await client.exec(`SET search_path TO ed_${scenario}; BEGIN; ${statement}; COMMIT;`);
  } catch (error) {
    await client.exec('ROLLBACK').catch(() => {});
    throw error;
  }
}
async function rows(query: string) {
  await client.query(`SET search_path TO ed_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

/** Two mined findings, so a corroboration can point at the wrong one on purpose. */
async function mined() {
  await sql(`
    INSERT INTO corpora VALUES ('c', 'CARAVAN', '{}'::jsonb);
    INSERT INTO releases VALUES ('REL-1', 'c', 'CURRENT', '${T_KNOWN}', '{}'::jsonb);
    INSERT INTO corpus_record VALUES ('REC-1', 'REL-1', 'facility:1', 'expanded', '${T_KNOWN}');
    INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters,
      implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
    VALUES ('W1', 'DESCRIPTIVE', 'COMPUTED_RESULT', '{}'::jsonb, 'm', '{}'::jsonb, 'i', '1', 'o', 'FIXED_POINT', '${FP(1)}');
    INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at, status, input_fingerprint, output_fingerprint)
    VALUES ('RUN1', 'W1', 'COMPUTED_RESULT', 'REL-1', '${T_KNOWN}', '${T_FOUND}', 'SUCCEEDED', '${FP(2)}', '${FP(3)}')`);
  for (const id of ['A1', 'A2']) {
    await tx(`INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, rights)
      VALUES ('${id}', 'RUN1', 'SUCCEEDED', 'COMPUTED_RESULT', 'facility:1', 'A documented expansion.', '${T_FOUND}', '{READ}');
      INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind, source_record_id, source_known_at, input_rights)
      VALUES ('I-${id}', '${id}', '${T_FOUND}', 'SOURCE_RECORD', 'REC-1', '${T_KNOWN}', '{READ}')`);
  }
}

const candidate = (id = 'C1', artifact = 'A1') => sql(`
  INSERT INTO story_candidate VALUES ('${id}', '${artifact}', 'COMPUTED_RESULT', 'industrial-development', 'DRAFT', '${T_FOUND}')`);

const release = (id = 'E1', over: { candidate?: string; artifact?: string; cls?: string; digest?: string; version?: number } = {}) => sql(`
  INSERT INTO editorial_release VALUES ('${id}', '${over.candidate ?? 'C1'}', '${over.artifact ?? 'A1'}',
    '${over.cls ?? 'REPORTING'}', ${over.version ?? 1}, '${over.digest ?? FP(4)}',
    'The commissioning date is not established; the permit is.', '${T_PUB}')`);

const archived = (id = 'P1', release = 'E1', digest = FP(4)) => sql(`
  INSERT INTO channel_publication VALUES ('${id}', 'ARCHIVE', 'ORIGINAL', '${release}', '${digest}', NULL, NULL, '${T_PUB}')`);

describe('the newsroom produces one class', () => {
  beforeEach(async () => { await mined(); await candidate(); });

  it('publishes reporting', async () => {
    await release();
    expect(await rows(`SELECT publication_class FROM editorial_release`)).toEqual([{ publication_class: 'REPORTING' }]);
  });

  /*
   * The other three carry different obligations and are not values this column
   * holds — the same shape as AGENT not being an authorizing principal.
   */
  it('refuses advertising, a recommendation and an execution', async () => {
    for (const [index, cls] of REFUSED_PUBLICATION_CLASSES.entries()) {
      await expect(release(`E${index}`, { cls }), cls).rejects.toThrow(/publication_class/);
    }
  });

  it('keeps the domain and the schema agreeing about which class that is', () => {
    expect(NEWSROOM_CLASSES).toEqual(['REPORTING']);
    expect(REFUSED_PUBLICATION_CLASSES).toEqual(['ADVERTISING', 'INVESTMENT_RECOMMENDATION', 'TRADING_EXECUTION']);
    expect(PUBLICATION_CLASSES).toHaveLength(4);
  });

  /* An article listing only what is settled describes a settled question. */
  it('refuses a release that does not say what remains unknown', async () => {
    await expect(sql(`INSERT INTO editorial_release VALUES ('E1', 'C1', 'A1', 'REPORTING', 1, '${FP(4)}', '  ', '${T_PUB}')`))
      .rejects.toThrow(/still_unknown/);
  });
});

describe('being repeated is not being confirmed', () => {
  beforeEach(async () => { await mined(); await candidate(); await release(); });

  /*
   * The loop, refused. The observation descends from the finding published as
   * E1, and it is offered in support of that same finding — which is the corpus
   * confirming its own claim through its circulation.
   */
  it('refuses an observation corroborating the finding it descends from', async () => {
    await sql(`INSERT INTO external_observation VALUES ('O1', 'account:someone', 'The facility expanded.', 'A1', 'E1', '${T_SEEN}')`);
    await expect(sql(`INSERT INTO corroboration VALUES ('K1', 'O1', 'A1', 'A1', 'COMPUTED_RESULT', '${T_SEEN}')`))
      .rejects.toThrow(/repetition_is_not_corroboration/);
  });

  /* A repetition may still corroborate a DIFFERENT finding. It is not poisoned. */
  it('lets a repetition corroborate a finding it did not come from', async () => {
    await sql(`INSERT INTO external_observation VALUES ('O1', 'account:someone', 'The facility expanded.', 'A1', 'E1', '${T_SEEN}')`);
    await sql(`INSERT INTO corroboration VALUES ('K1', 'O1', 'A1', 'A2', 'COMPUTED_RESULT', '${T_SEEN}')`);
    expect(await rows(`SELECT corroborates_artifact_id FROM corroboration`)).toEqual([{ corroborates_artifact_id: 'A2' }]);
  });

  /* A genuinely independent observation carries no ancestry and corroborates freely. */
  it('lets an independent observation corroborate anything', async () => {
    await sql(`INSERT INTO external_observation VALUES ('O2', 'account:regulator', 'Permit issued.', NULL, NULL, '${T_SEEN}')`);
    await sql(`INSERT INTO corroboration VALUES ('K1', 'O2', 'INDEPENDENT', 'A1', 'COMPUTED_RESULT', '${T_SEEN}')`);
    expect(await rows(`SELECT observation_ancestry_key FROM corroboration`)).toEqual([{ observation_ancestry_key: 'INDEPENDENT' }]);
  });

  /*
   * And the ancestry cannot be dropped on the way in. Claiming independence for
   * an observation that has a parent fails the composite key, which is the only
   * reason the comparison above can be trusted.
   */
  it('refuses a corroboration that claims independence for a repetition', async () => {
    await sql(`INSERT INTO external_observation VALUES ('O1', 'account:someone', 'The facility expanded.', 'A1', 'E1', '${T_SEEN}')`);
    await expect(sql(`INSERT INTO corroboration VALUES ('K1', 'O1', 'INDEPENDENT', 'A1', 'COMPUTED_RESULT', '${T_SEEN}')`))
      .rejects.toThrow(/corroboration_observation|foreign key/i);
  });

  /*
   * And the sentinel cannot be forged the other way either: naming a real
   * ancestry the observation does not have fails the same key.
   */
  it('refuses a corroboration that invents an ancestry', async () => {
    await sql(`INSERT INTO external_observation VALUES ('O2', 'account:regulator', 'Permit issued.', NULL, NULL, '${T_SEEN}')`);
    await expect(sql(`INSERT INTO corroboration VALUES ('K1', 'O2', 'A1', 'A2', 'COMPUTED_RESULT', '${T_SEEN}')`))
      .rejects.toThrow(/corroboration_observation|foreign key/i);
  });

  it('refuses an ancestry that names no real release', async () => {
    await expect(sql(`INSERT INTO external_observation VALUES ('O1', 'account:someone', 'x', 'A1', 'E-NOPE', '${T_SEEN}')`))
      .rejects.toThrow(/observation_ancestry|foreign key/i);
  });
});

describe('a platform is a channel, not the archive', () => {
  beforeEach(async () => { await mined(); await candidate(); await release(); });

  it('archives an original', async () => {
    await archived();
    expect(await rows(`SELECT channel FROM channel_publication`)).toEqual([{ channel: 'ARCHIVE' }]);
  });

  /* A post with no article behind it is a claim with no address. */
  it('refuses a syndicated post with no archived article behind it', async () => {
    await archived();
    await expect(sql(`INSERT INTO channel_publication VALUES ('P2', 'SYNDICATED_POST', 'ORIGINAL', 'E1', '${FP(4)}', NULL, NULL, '${T_PUB}')`))
      .rejects.toThrow(/only_the_archive_originates/);
  });

  it('refuses an archive entry that claims to distribute something else', async () => {
    await archived();
    await expect(sql(`INSERT INTO channel_publication VALUES ('P2', 'ARCHIVE', 'ORIGINAL', 'E1', '${FP(4)}', 'P1', NULL, '${T_PUB}')`))
      .rejects.toThrow(/only_the_archive_originates/);
  });

  it('distributes a post that names its article', async () => {
    await archived();
    await sql(`INSERT INTO channel_publication VALUES ('P2', 'SYNDICATED_POST', 'ORIGINAL', 'E1', '${FP(4)}', 'P1', NULL, '${T_PUB}')`);
    expect(await rows(`SELECT archived_publication_id FROM channel_publication WHERE channel = 'SYNDICATED_POST'`))
      .toEqual([{ archived_publication_id: 'P1' }]);
  });

  /* An approved queue and an account that answers everyone are different projects. */
  it('refuses an automated reply with no platform approval', async () => {
    await archived();
    await expect(sql(`INSERT INTO channel_publication VALUES ('P2', 'SYNDICATED_POST', 'AUTOMATED_REPLY', 'E1', '${FP(4)}', 'P1', NULL, '${T_PUB}')`))
      .rejects.toThrow(/automated_reply_is_approved/);
  });

  it('refuses a platform approval on a post that is not an automated reply', async () => {
    await expect(sql(`INSERT INTO channel_publication VALUES ('P1', 'ARCHIVE', 'ORIGINAL', 'E1', '${FP(4)}', NULL, 'ticket-88', '${T_PUB}')`))
      .rejects.toThrow(/automated_reply_is_approved/);
  });
});

describe('the approval was of a message', () => {
  beforeEach(async () => { await mined(); await candidate(); await release(); });

  /*
   * A rewritten headline is a different digest, so it is a different message,
   * so it does not inherit an approval granted for something else.
   */
  it('refuses publishing text that is not the text that was reviewed', async () => {
    await expect(sql(`INSERT INTO channel_publication VALUES ('P1', 'ARCHIVE', 'ORIGINAL', 'E1', '${FP(9)}', NULL, NULL, '${T_PUB}')`))
      .rejects.toThrow(/channel_carries_the_reviewed_message|foreign key/i);
  });

  it('publishes the text that was', async () => {
    await archived();
    expect(await rows(`SELECT message_digest FROM channel_publication`)).toEqual([{ message_digest: FP(4) }]);
  });
});

describe('the conflict review names what the firm holds', () => {
  beforeEach(async () => { await mined(); await candidate(); });

  it('refuses a conflict review that does not', async () => {
    await expect(sql(`INSERT INTO editorial_review VALUES ('V1', 'C1', 'CONFLICT', 'operator:jo', NULL, true, '${T_FOUND}')`))
      .rejects.toThrow(/review_conflict_names_the_holdings/);
  });

  it('accepts one that does', async () => {
    await sql(`INSERT INTO editorial_review VALUES ('V1', 'C1', 'CONFLICT', 'operator:jo', 'No position in the subject or its parent.', true, '${T_FOUND}')`);
    expect(await rows(`SELECT dimension FROM editorial_review`)).toEqual([{ dimension: 'CONFLICT' }]);
  });

  it('does not require holdings on the other three dimensions', async () => {
    await sql(`INSERT INTO editorial_review VALUES ('V1', 'C1', 'PRIVACY', 'operator:jo', NULL, true, '${T_FOUND}')`);
    expect(await rows(`SELECT count(*)::int AS n FROM editorial_review`)).toEqual([{ n: 1 }]);
  });
});

describe('nothing has been published', () => {
  it('holds no candidate, review, release, publication or corroboration', async () => {
    for (const table of ['story_candidate', 'editorial_review', 'editorial_release',
      'channel_publication', 'external_observation', 'corroboration']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });

  it('creates the columns the drift check names', () => {
    expect(ddlColumns(EDITORIAL_LEDGER_DDL)['external_observation']).toContain('descends_from_artifact_id');
    expect(ddlColumns(EDITORIAL_LEDGER_DDL)['channel_publication']).toContain('archived_publication_id');
    expect(ddlColumns(EDITORIAL_LEDGER_DDL)['editorial_release']).toContain('still_unknown');
  });
});
