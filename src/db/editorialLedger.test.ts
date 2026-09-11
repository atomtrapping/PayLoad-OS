/**
 * The newsroom's boundaries, against an actual PostgreSQL engine.
 *
 * The case this file exists for is the loop: the firm publishes a finding, an
 * account repeats it, acquisition admits the repetition, and the corpus quietly
 * acquires a second source for a claim it invented. Every step of that is
 * reasonable, which is why it is refused at the row.
 *
 * A release now rests on an authorization in the execution ledger, of its
 * message's digest, so that ledger is stacked here too.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { NEWSROOM_CLASSES, PUBLICATION_CLASSES, REVIEW_DIMENSIONS } from '@/domain/editorialPlane';
import { DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS } from './discoveryLedger';
import { EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS } from './executionLedger';
import { EDITORIAL_LEDGER_DDL, EDITORIAL_LEDGER_GUARDS, MESSAGE_PARTS, REFUSED_PUBLICATION_CLASSES } from './editorialLedger';

let client: PGlite;
let scenario = 0;

const T_KNOWN = '2026-08-01T08:00:00.000Z';
const T_FOUND = '2026-08-02T09:00:00.000Z';
const T_REVIEW = '2026-08-02T12:00:00.000Z';
const T_PUB = '2026-08-03T09:00:00.000Z';
const T_SEEN = '2026-08-04T09:00:00.000Z';
const T_EXPIRE = '2026-08-30T00:00:00.000Z';
const FP = (n: number) => `sha256:${String(n).repeat(2).padStart(64, '0')}`;
const ARTICLE = FP(4);
const POST = FP(5);
const MESSAGE = `'{"headline":"A documented expansion","claims":["A documented expansion."],"chart":{"kind":"none"},"qualifiers":["Demonstration corpus."],"channelText":"The article."}'::jsonb`;


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
    ${CORPUS_DDL}${EXECUTION_LEDGER_DDL}${EXECUTION_LEDGER_GUARDS}${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}${EDITORIAL_LEDGER_DDL}${EDITORIAL_LEDGER_GUARDS}`);
  await sql(`
    INSERT INTO principal VALUES ('editor:desk', 'HUMAN', 'Desk editor', '${T_KNOWN}');
    INSERT INTO principal VALUES ('agent:desk', 'AGENT', 'Desk agent', '${T_KNOWN}')`);
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
      VALUES ('${id}', 'RUN1', 'SUCCEEDED', 'COMPUTED_RESULT', 'facility:1', 'A documented expansion.', '${T_FOUND}', '{acquisition,normalization}');
      INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind, source_record_id, source_known_at, input_rights)
      VALUES ('I-${id}', '${id}', '${T_FOUND}', 'SOURCE_RECORD', 'REC-1', '${T_KNOWN}', '{acquisition,normalization}')`);
  }
}

const candidate = (id = 'C1', artifact = 'A1') => sql(`
  INSERT INTO story_candidate VALUES ('${id}', '${artifact}', 'COMPUTED_RESULT', 'industrial-development', 'DRAFT', '${T_FOUND}')`);

/** The four questions, answered yes unless one is named to fail or be left out. */
const reviewed = (candidateId = 'C1', over: { fail?: string; omit?: string } = {}) => sql(REVIEW_DIMENSIONS
  .filter((dimension) => dimension !== over.omit)
  .map((dimension) => `INSERT INTO editorial_review VALUES ('RV-${candidateId}-${dimension}', '${candidateId}', '${dimension}', 'reviewer:${dimension.toLowerCase()}',
    ${dimension === 'CONFLICT' ? `'The firm holds nothing in facility:1.'` : 'NULL'}, ${over.fail === dimension ? 'false' : 'true'}, '${T_REVIEW}')`).join(';\n'));

/** An approval in the kernel, of one digest, by the desk editor. */
const approved = (tag: string, digest: string) => sql(`
  INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at)
    VALUES ('P-${tag}', 'EDITORIAL_RELEASE', 'audience:public', 'AGENT', 'agent:desk', '${T_REVIEW}');
  INSERT INTO decision_packet (packet_id, proposal_id, action_kind, action, action_digest, doing_nothing, against, prepared_by_kind, prepared_by, prepared_at)
    VALUES ('K-${tag}', 'P-${tag}', 'EDITORIAL_RELEASE', '{}'::jsonb, '${digest}', 'Nothing is published.', 'It rests on one run.', 'AGENT', 'agent:desk', '${T_REVIEW}');
  INSERT INTO proposal_review (review_id, proposal_id, reviewed_action_digest, response, reviewer_kind, reviewer, reasoning, reviewed_at)
    VALUES ('RV-${tag}', 'P-${tag}', '${digest}', 'APPROVE', 'HUMAN', 'editor:desk', 'Supported and qualified.', '${T_REVIEW}');
  INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by, corpus_release_id, state_revision, policy_version,
    granted_at, expires_at, action_digest, review_response)
    VALUES ('AU-${tag}', 'P-${tag}', 'NARROW_ACTION', 'HUMAN', 'editor:desk', 'REL-1', 1, 'newsroom@1', '${T_REVIEW}', '${T_EXPIRE}', '${digest}', 'APPROVE')`);

const release = (id = 'E1', over: { candidate?: string; artifact?: string; cls?: string; digest?: string; version?: number; channel?: string; message?: string; auth?: string; stillUnknown?: string } = {}) => sql(`
  INSERT INTO editorial_release VALUES ('${id}', '${over.candidate ?? 'C1'}', '${over.artifact ?? 'A1'}',
    '${over.cls ?? 'REPORTING'}', ${over.version ?? 1}, '${over.digest ?? ARTICLE}',
    '${over.stillUnknown ?? 'The commissioning date is not established; the permit is.'}', '${T_PUB}',
    '${over.channel ?? 'ARCHIVE'}', ${over.message ?? MESSAGE}, '${over.auth ?? 'AU-ARTICLE'}')`);

/** A candidate with all four reviews passed and the article approved: what a release rests on. */
async function ready() { await mined(); await candidate(); await reviewed(); await approved('ARTICLE', ARTICLE); }

const archived = (id = 'P1', releaseId = 'E1', digest = ARTICLE) => sql(`
  INSERT INTO channel_publication VALUES ('${id}', 'ARCHIVE', 'ORIGINAL', '${releaseId}', '${digest}', NULL, NULL, '${T_PUB}')`);

describe('the newsroom produces one class', () => {
  beforeEach(ready);

  it('publishes reporting', async () => {
    await release();
    expect(await rows(`SELECT publication_class, channel FROM editorial_release`)).toEqual([{ publication_class: 'REPORTING', channel: 'ARCHIVE' }]);
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
    await expect(release('E1', { stillUnknown: '  ' })).rejects.toThrow(/still_unknown/);
  });
});

describe('four questions before any release', () => {
  beforeEach(async () => { await mined(); await candidate(); await approved('ARTICLE', ARTICLE); });

  it('refuses a release of a candidate nobody reviewed', async () => {
    await expect(release()).rejects.toThrow(/release_before_every_review_passed:0_of_4/);
  });

  it('refuses a release with one question unanswered', async () => {
    await reviewed('C1', { omit: 'PRIVACY' });
    await expect(release()).rejects.toThrow(/release_before_every_review_passed:3_of_4/);
  });

  it('refuses a release with one question answered no', async () => {
    await reviewed('C1', { fail: 'RIGHTS' });
    await expect(release()).rejects.toThrow(/release_before_every_review_passed:3_of_4/);
  });

  it('releases once all four passed', async () => {
    await reviewed();
    await release();
    expect(await rows(`SELECT count(*)::int AS n FROM editorial_release`)).toEqual([{ n: 1 }]);
  });

  it('answers each question once per candidate', async () => {
    await reviewed();
    await expect(sql(`INSERT INTO editorial_review VALUES ('RV-again', 'C1', 'EDITORIAL', 'reviewer:other', NULL, true, '${T_REVIEW}')`))
      .rejects.toThrow(/review_once_per_dimension/);
  });
});

describe('the approval is of a message, for a channel', () => {
  beforeEach(ready);

  it('carries the message with every part the review was of', () => {
    expect(MESSAGE_PARTS).toEqual(['headline', 'claims', 'chart', 'qualifiers', 'channelText']);
    expect(EDITORIAL_LEDGER_DDL).toContain(`message ?& array['headline', 'claims', 'chart', 'qualifiers', 'channelText']`);
  });

  it('refuses a message missing one of its parts', async () => {
    await expect(release('E1', { message: `'{"headline":"h","claims":[],"qualifiers":[],"channelText":"t"}'::jsonb` }))
      .rejects.toThrow(/release_message_has_its_parts/);
  });

  /*
   * A rewritten headline is a different digest, so it is a different message,
   * so it does not inherit an approval granted for something else.
   */
  it('refuses a release whose digest is not the one that was approved', async () => {
    await expect(release('E1', { digest: FP(9) })).rejects.toThrow(/release_approved_as_this_message|foreign key/i);
  });

  it('refuses a release with no approval behind it', async () => {
    await expect(release('E1', { auth: 'AU-NOBODY' })).rejects.toThrow(/release_approved_as_this_message|foreign key/i);
  });

  /* The post is a different message from the article, and it is reviewed as itself. */
  it('refuses the post under the article’s approval, and releases it under its own', async () => {
    await release();
    await expect(release('E2', { channel: 'SYNDICATED_POST', digest: ARTICLE })).rejects.toThrow(/editorial_release_authorization_once/);
    await approved('POST', POST);
    await release('E2', { channel: 'SYNDICATED_POST', digest: POST, auth: 'AU-POST' });
    expect(await rows(`SELECT channel FROM editorial_release ORDER BY channel`)).toEqual([{ channel: 'ARCHIVE' }, { channel: 'SYNDICATED_POST' }]);
  });

  it('refuses publishing text that is not the text that was reviewed', async () => {
    await release();
    await expect(sql(`INSERT INTO channel_publication VALUES ('P1', 'ARCHIVE', 'ORIGINAL', 'E1', '${FP(9)}', NULL, NULL, '${T_PUB}')`))
      .rejects.toThrow(/channel_carries_the_reviewed_message|foreign key/i);
  });

  /* The article's digest on the post's channel is a message nobody reviewed for that channel. */
  it('refuses publishing the article’s message on the post’s channel', async () => {
    await release(); await archived();
    await expect(sql(`INSERT INTO channel_publication VALUES ('P2', 'SYNDICATED_POST', 'ORIGINAL', 'E1', '${ARTICLE}', 'P1', NULL, '${T_PUB}')`))
      .rejects.toThrow(/channel_carries_the_reviewed_message|foreign key/i);
  });

  it('publishes the text that was', async () => {
    await release(); await archived();
    expect(await rows(`SELECT message_digest FROM channel_publication`)).toEqual([{ message_digest: ARTICLE }]);
  });
});

describe('being repeated is not being confirmed', () => {
  beforeEach(async () => { await ready(); await release(); });

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

  it('lets an independent observation corroborate anything', async () => {
    await sql(`INSERT INTO external_observation VALUES ('O2', 'account:elsewhere', 'Saw the new line running.', NULL, NULL, '${T_SEEN}')`);
    await sql(`INSERT INTO corroboration VALUES ('K2', 'O2', 'INDEPENDENT', 'A1', 'COMPUTED_RESULT', '${T_SEEN}')`);
    expect(await rows(`SELECT observation_ancestry_key FROM corroboration`)).toEqual([{ observation_ancestry_key: 'INDEPENDENT' }]);
  });

  /*
   * The laundering route, closed: a repetition cannot be offered as if it were
   * independent, because the ancestry column it would have to lie about is
   * generated and tied.
   */
  it('refuses a corroboration that claims independence for a repetition', async () => {
    await sql(`INSERT INTO external_observation VALUES ('O1', 'account:someone', 'The facility expanded.', 'A1', 'E1', '${T_SEEN}')`);
    await expect(sql(`INSERT INTO corroboration VALUES ('K1', 'O1', 'INDEPENDENT', 'A1', 'COMPUTED_RESULT', '${T_SEEN}')`))
      .rejects.toThrow(/corroboration_observation|foreign key/i);
  });

  it('refuses a corroboration that invents an ancestry', async () => {
    await sql(`INSERT INTO external_observation VALUES ('O2', 'account:elsewhere', 'Saw the new line running.', NULL, NULL, '${T_SEEN}')`);
    await expect(sql(`INSERT INTO corroboration VALUES ('K2', 'O2', 'A2', 'A1', 'COMPUTED_RESULT', '${T_SEEN}')`))
      .rejects.toThrow(/corroboration_observation|foreign key/i);
  });

  it('refuses an ancestry that names no real release', async () => {
    await expect(sql(`INSERT INTO external_observation VALUES ('O1', 'account:someone', 'x', 'A1', 'E-NOPE', '${T_SEEN}')`))
      .rejects.toThrow(/observation_ancestry|foreign key/i);
  });
});

describe('a platform is a channel, not the archive', () => {
  beforeEach(async () => { await ready(); await release(); await approved('POST', POST); await release('E2', { channel: 'SYNDICATED_POST', digest: POST, auth: 'AU-POST' }); });

  it('archives an original', async () => {
    await archived();
    expect(await rows(`SELECT channel FROM channel_publication`)).toEqual([{ channel: 'ARCHIVE' }]);
  });

  /* A post with no article behind it is a claim with no address. */
  it('refuses a syndicated post with no archived article behind it', async () => {
    await archived();
    await expect(sql(`INSERT INTO channel_publication VALUES ('P2', 'SYNDICATED_POST', 'ORIGINAL', 'E2', '${POST}', NULL, NULL, '${T_PUB}')`))
      .rejects.toThrow(/only_the_archive_originates/);
  });

  it('refuses an archive entry that claims to distribute something else', async () => {
    await archived();
    await expect(sql(`INSERT INTO channel_publication VALUES ('P2', 'ARCHIVE', 'ORIGINAL', 'E1', '${ARTICLE}', 'P1', NULL, '${T_PUB}')`))
      .rejects.toThrow(/only_the_archive_originates/);
  });

  it('distributes a post that names its article', async () => {
    await archived();
    await sql(`INSERT INTO channel_publication VALUES ('P2', 'SYNDICATED_POST', 'ORIGINAL', 'E2', '${POST}', 'P1', NULL, '${T_PUB}')`);
    expect(await rows(`SELECT archived_publication_id FROM channel_publication WHERE channel = 'SYNDICATED_POST'`))
      .toEqual([{ archived_publication_id: 'P1' }]);
  });

  /* An approved queue and an account that answers everyone are different projects. */
  it('refuses an automated reply with no platform approval', async () => {
    await archived();
    await expect(sql(`INSERT INTO channel_publication VALUES ('P2', 'SYNDICATED_POST', 'AUTOMATED_REPLY', 'E2', '${POST}', 'P1', NULL, '${T_PUB}')`))
      .rejects.toThrow(/automated_reply_is_approved/);
  });

  it('refuses a platform approval on a post that is not an automated reply', async () => {
    await expect(sql(`INSERT INTO channel_publication VALUES ('P1', 'ARCHIVE', 'ORIGINAL', 'E1', '${ARTICLE}', NULL, 'ticket-88', '${T_PUB}')`))
      .rejects.toThrow(/automated_reply_is_approved/);
  });
});

describe('the conflict review names what the firm holds', () => {
  beforeEach(async () => { await mined(); await candidate(); });

  it('refuses a conflict review that does not', async () => {
    await expect(sql(`INSERT INTO editorial_review VALUES ('RV1', 'C1', 'CONFLICT', 'reviewer:x', NULL, true, '${T_REVIEW}')`))
      .rejects.toThrow(/review_conflict_names_the_holdings/);
  });

  it('accepts one that does', async () => {
    await sql(`INSERT INTO editorial_review VALUES ('RV1', 'C1', 'CONFLICT', 'reviewer:x', 'The firm holds nothing in facility:1.', true, '${T_REVIEW}')`);
    expect(await rows(`SELECT passed FROM editorial_review`)).toEqual([{ passed: true }]);
  });

  it('does not require holdings on the other three dimensions', async () => {
    await sql(`INSERT INTO editorial_review VALUES ('RV1', 'C1', 'EDITORIAL', 'reviewer:x', NULL, true, '${T_REVIEW}')`);
    expect(await rows(`SELECT dimension FROM editorial_review`)).toEqual([{ dimension: 'EDITORIAL' }]);
  });
});

describe('nothing has been published', () => {
  it('holds no candidate, review, release, publication or corroboration', async () => {
    for (const table of ['story_candidate', 'editorial_review', 'editorial_release', 'channel_publication', 'external_observation', 'corroboration']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });
});
