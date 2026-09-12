import { installCoordinationSchema } from '../src/coordination/schema';
import { configureCoordination, readCoordinationConfigurationFile } from '../src/coordination/admin';
import { postgresTerminalDatabase } from '../src/terminal/database';

const args = process.argv.slice(2);
if (!(args.length === 1 && args[0] === 'migrate') && !(args.length === 3 && args[0] === 'configure' && args[1] === '--request')) {
  throw new Error('Usage: coordination:admin -- migrate | configure --request <operator-json>');
}
let input: unknown;
if (args[0] === 'configure') {
  input = readCoordinationConfigurationFile(args[2]);
}
const { createPool } = await import('../src/db');
const pool = createPool();
try {
  const database = postgresTerminalDatabase(pool);
  if (args[0] === 'migrate') { await installCoordinationSchema(database); process.stdout.write('Coordination schema ready. No membership imported or workers launched.\n'); }
  else { await configureCoordination(database, input); process.stdout.write('Explicit coordination configuration committed. No terminal grants changed.\n'); }
} finally { await pool.end(); }
