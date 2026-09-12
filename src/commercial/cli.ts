import { writeFileSync } from 'node:fs';
import { readBoundedSourceRequest } from '../acquisition/request-file';
import { evaluateCommercialRequest } from './agent';
import { commercialExample, FIRM_COMMERCIAL_CATALOG } from './catalog';
import { commercialRegistration } from './definition';

export const COMMERCIAL_USAGE = `Notation Systems commercial agent — local decision support
npm run agent:commercial -- catalog
npm run agent:commercial -- registration
npm run agent:commercial -- example [--output <new-file.json>]
npm run agent:commercial -- evaluate --request <file.json> [--output <new-report.json>]
Inputs are capped at 32 KiB. Outputs are create-only. No contact, signature, spending or delivery is implemented.`;

export function runCommercialCli(args: readonly string[], io: { stdout(text: string): void; stderr(text: string): void }): number {
  try {
    if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
      io.stdout(COMMERCIAL_USAGE); return 0;
    }
    const command = args[0];
    if (!['catalog', 'registration', 'example', 'evaluate'].includes(command) || args.length % 2 !== 1) throw new Error('Invalid command');
    const options: Record<string, string> = {};
    for (let i = 1; i < args.length; i += 2) {
      if (!['--request', '--output'].includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid options');
      options[args[i]] = args[i + 1];
    }
    if ((command === 'evaluate') !== Boolean(options['--request']) || (['catalog', 'registration'].includes(command) && Object.keys(options).length)) throw new Error('Invalid options');
    const result = command === 'registration' ? commercialRegistration() : command === 'catalog'
      ? { schema: 'notation.commercial-catalog.v1', firm: 'Notation Systems Inc.', customerReady: false, offers: FIRM_COMMERCIAL_CATALOG }
      : command === 'example' ? commercialExample()
      : evaluateCommercialRequest(readBoundedSourceRequest(options['--request'], 32 * 1024));
    const json = JSON.stringify(result, null, 2);
    if (options['--output']) writeFileSync(options['--output'], `${json}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    io.stdout(options['--output'] ? JSON.stringify({ output: options['--output'], status: 'CREATED' }) : json);
    return 0;
  } catch {
    io.stderr('Commercial evaluation failed. Check the strict input schema, 32 KiB limit, readable request and unused output path. No external action was taken.');
    return 1;
  }
}
