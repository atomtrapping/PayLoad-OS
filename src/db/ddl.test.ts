/**
 * The three helpers every ledger writes SQL through, against a real engine.
 *
 * Two of them had twelve copies each and one had two copies that were not the
 * same function. The array encoder is the one worth a test with a database
 * behind it: the two copies differed in whether they quoted the elements, both
 * appeared to work, and only one of them is correct. That is the shape of
 * duplication that costs something — not the lines, the divergence nobody can
 * see because the inputs never exercised it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ddlColumns, quoted, sqlArray, sqlText } from './ddl';

let client: PGlite;
beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(`CREATE TABLE holder (id text PRIMARY KEY, note text NOT NULL, rights text[] NOT NULL)`);
});
afterAll(async () => { await client?.close(); });

const rows = async (query: string) => (await client.query(query)).rows as Record<string, unknown>[];

describe('rendering a value into SQL by hand', () => {
  it('doubles an embedded quote rather than ending the literal', async () => {
    await client.exec(`INSERT INTO holder VALUES ('a', ${sqlText("the carrier's own log")}, '{}')`);
    expect(await rows(`SELECT note FROM holder WHERE id = 'a'`)).toEqual([{ note: "the carrier's own log" }]);
  });

  /*
   * The divergence, demonstrated rather than described. Unquoted, PostgreSQL
   * splits on the comma inside the element and reads three rights where two
   * were written — and the rights-inheritance guard compares the wrong set.
   */
  it('keeps a value containing a comma as one array element', async () => {
    const rights = ['deliver, then bill', 'model_training'];
    await client.exec(`INSERT INTO holder VALUES ('b', 'n', ${sqlArray(rights)})`);
    expect(await rows(`SELECT rights, array_length(rights, 1) AS n FROM holder WHERE id = 'b'`))
      .toEqual([{ rights, n: 2 }]);

    // What the unquoted encoding this replaced would have written instead.
    await client.exec(`INSERT INTO holder VALUES ('c', 'n', '{${rights.join(',')}}')`);
    const [split] = await rows(`SELECT array_length(rights, 1) AS n FROM holder WHERE id = 'c'`);
    expect(split.n, 'the unquoted form splits one right into two').toBe(3);
  });

  it('round-trips an ordinary vocabulary unchanged', async () => {
    const rights = ['acquisition', 'customer_delivery', 'normalization'];
    await client.exec(`INSERT INTO holder VALUES ('d', 'n', ${sqlArray(rights)})`);
    expect(await rows(`SELECT rights FROM holder WHERE id = 'd'`)).toEqual([{ rights }]);
  });

  it('renders a closed vocabulary as a SQL IN list', () => {
    expect(quoted(['HUMAN', 'POLICY'])).toBe("'HUMAN', 'POLICY'");
    expect(quoted([])).toBe('');
  });
});

describe('reading back the columns a DDL declares', () => {
  const DDL = `
CREATE TABLE thing (
  thing_id text PRIMARY KEY,
  -- a comment is not a column
  kind text NOT NULL CHECK (kind IN ('A', 'B')),
  made_at timestamptz NOT NULL,
  CONSTRAINT thing_kind_known CHECK (kind <> ''),
  UNIQUE (thing_id, kind)
);

CREATE TABLE other (
  other_id text PRIMARY KEY,
  thing_id text NOT NULL REFERENCES thing (thing_id),
  FOREIGN KEY (thing_id) REFERENCES thing (thing_id)
);
`;

  it('names every column of every table and nothing else', () => {
    expect(ddlColumns(DDL)).toEqual({
      thing: ['thing_id', 'kind', 'made_at'],
      other: ['other_id', 'thing_id'],
    });
  });

  /*
   * The filter that earns its keep. A constraint clause declares no column, and
   * counting one would make the drift check disagree with the table it checks —
   * which is the one thing the drift check exists not to do.
   */
  it('counts no constraint, index or comment line as a column', () => {
    const columns = ddlColumns(DDL);
    for (const table of Object.values(columns)) {
      for (const name of table) expect(name, name).toMatch(/^[a-z_]+$/);
      expect(table).not.toContain('CONSTRAINT');
      expect(table).not.toContain('UNIQUE');
      expect(table).not.toContain('FOREIGN');
    }
  });

  it('returns nothing for a DDL that creates no table', () => {
    expect(ddlColumns('CREATE INDEX a_b ON a (b);')).toEqual({});
  });
});
