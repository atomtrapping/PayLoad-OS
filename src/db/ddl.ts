/**
 * The two things every ledger in this directory needs, in one place.
 *
 * Twelve modules under src/db had each grown their own copy of both functions
 * below — byte-identical bodies under twelve different names, because each new
 * ledger was written by copying the shape of the one before it. Twelve names
 * for one function is worse than the duplication: a reader meeting
 * `warrantDdlColumns` reasonably assumes it knows something about warrants,
 * and it does not. It parses a string.
 *
 * Neither of these carries doctrine. `quoted` renders a closed vocabulary into
 * a SQL IN list, and `ddlColumns` reads back the columns a DDL declares. What
 * the vocabulary means and what the columns are for stays with the ledger that
 * declares them.
 */

/**
 * A closed vocabulary as a SQL list, so a CHECK is written from the same array
 * the domain exports and the two cannot drift.
 *
 * There is no escaping here and there should not be: every caller passes a
 * literal `as const` array of identifiers it wrote itself. A value that needed
 * escaping would be a value arriving from somewhere, and a vocabulary that
 * arrives from somewhere is not closed.
 */
export const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * Every column a DDL creates, by table.
 *
 * The drift check reads this and compares it with what the application thinks
 * the table has, so a column added to one and not the other is caught by a
 * test rather than by a query at runtime. Constraint lines are skipped: a
 * `CONSTRAINT`, `UNIQUE`, `CHECK`, `FOREIGN KEY` or `PRIMARY KEY` clause
 * declares no column, and counting one as a column would make the drift check
 * disagree with the table it is checking.
 */
export function ddlColumns(ddl: string): Record<string, string[]> {
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

/**
 * One value as a SQL string literal, with embedded quotes doubled.
 *
 * For tests and seed scripts that write statements by hand. Application code
 * goes through the driver's parameter binding and never needs this.
 */
export const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * A list of values as a SQL array literal, with every element quoted.
 *
 * The quoting is the whole point and it was the difference between two copies
 * of this helper that carried the same name one directory apart. Unquoted,
 * PostgreSQL splits an element on the comma inside it: `{deliver, then bill,
 * model_training}` is read back as three elements, not two, so a rights array
 * silently gains a member and loses the one it split. Quoted, it is two.
 *
 * Nothing in the corpus carries a comma in a right today, which is why both
 * encodings appeared to work and why only one of them is correct.
 */
export const sqlArray = (values: readonly string[]) => `'{${values.map((value) => `"${value}"`).join(',')}}'`;
