import { computeMining, type MiningWork } from '../src/terminal/mining';
import { limits, miningRequest } from '../src/terminal/contracts';
async function main() {
  const bytes = Buffer.alloc(limits.inputBytes);
  let size = 0;
  for await (const chunk of process.stdin) {
    const part = Buffer.from(chunk);
    if (size + part.length > limits.inputBytes) process.exit(2);
    bytes.set(part, size); size += part.length;
  }
  const work = JSON.parse(bytes.subarray(0, size).toString('utf8')) as MiningWork;
  work.request = miningRequest.parse(work.request);
  if (!Array.isArray(work.snapshot.records) || work.snapshot.records.length > work.request.budget.maxRows) process.exit(2);
  const output = JSON.stringify(computeMining(work));
  if (Buffer.byteLength(output) > work.request.budget.maxOutputBytes) process.exit(2);
  process.stdout.write(output);
}
void main().catch(() => { process.exitCode = 2; });
