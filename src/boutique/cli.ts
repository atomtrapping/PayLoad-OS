import { resolve } from 'node:path';
import { readBoundedSourceRequest } from '../acquisition/request-file';
import { CensusPackageError, CensusPackageStore } from './census-package';
import { CENSUS_OBSERVATION_PRODUCT, CENSUS_PRODUCT_DIGEST } from './census-product';

export const BOUTIQUE_USAGE = [
  'Internal Company Census observation packages. No source collection or customer-delivery permission is granted.',
  'npm run boutique -- spec',
  'npm run boutique -- build --request <file.json> [--root <evidence-directory>]',
  'npm run boutique -- inspect --package-id <id> [--root <evidence-directory>]',
  'npm run boutique -- request-delivery --request <file.json> [--root <evidence-directory>]',
  'Customer delivery is refused under the existing qualification-only product and source policy.',
].join('\n');

export function executeBoutiqueCli(args: readonly string[]) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: BOUTIQUE_USAGE };
  if (args[0] === 'spec' && args.length === 1) return { product: CENSUS_OBSERVATION_PRODUCT, digest: CENSUS_PRODUCT_DIGEST };
  const command = args[0];
  if (!['build', 'inspect', 'request-delivery'].includes(command) || args.length > 5 || args.length % 2 !== 1) throw new CensusPackageError('INVALID_PACKAGE_CLI_ARGUMENTS');
  const options: Record<string, string> = {};
  const selector = command === 'inspect' ? '--package-id' : '--request';
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (![selector, '--root'].includes(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new CensusPackageError('INVALID_PACKAGE_CLI_ARGUMENTS');
    options[key] = value;
  }
  if (!options[selector]) throw new CensusPackageError('INVALID_PACKAGE_CLI_ARGUMENTS');
  const root = resolve(options['--root'] ?? process.env.PAYLOAD_SOURCE_QUALIFICATION_DIR ?? '.payload/source-qualification');
  const store = new CensusPackageStore(root);
  if (command === 'inspect') {
    const release = store.inspect(options[selector]);
    if (!release) throw new CensusPackageError('PACKAGE_NOT_FOUND');
    return { status: 'INSPECTED', historical: true, permissionRenewed: false, release };
  }
  const request = readBoundedSourceRequest(options[selector]);
  if (command === 'build') return store.build(request);
  return { delivery: store.requestCustomerDelivery(request) };
}

export function runBoutiqueCli(args: readonly string[], io: { stdout: (text: string) => void; stderr: (text: string) => void }): number {
  try {
    const result = executeBoutiqueCli(args);
    io.stdout(JSON.stringify(result));
    return 'delivery' in result ? 2 : 0;
  } catch (error) {
    io.stderr(JSON.stringify({ mode: 'INTERNAL_SOURCE_QUALIFICATION', error: {
      code: error instanceof CensusPackageError ? error.code : 'PACKAGE_OPERATION_FAILED',
      message: 'The operation could not be confirmed. Check exact references and permissions; retained history was not repaired or replaced.',
    } }));
    return 1;
  }
}
