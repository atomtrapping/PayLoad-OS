import { readFile } from 'node:fs/promises';
import { terminalCall } from './terminal.mjs';
try {
  if (!process.env.PAYLOAD_TERMINAL_TOKEN) throw new Error('TERMINAL_TOKEN_REQUIRED');
  const input = process.argv[2] ? await readFile(process.argv[2], 'utf8') : '{"command":"discover"}';
  if (Buffer.byteLength(input) > 65536) throw new Error('TERMINAL_REQUEST_LIMIT');
  const result = await terminalCall({ origin: process.env.PAYLOAD_TERMINAL_ORIGIN ?? 'http://127.0.0.1:3000', token: process.env.PAYLOAD_TERMINAL_TOKEN, command: JSON.parse(input) });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'TERMINAL_FAILED'}\n`); process.exitCode = 1; }
