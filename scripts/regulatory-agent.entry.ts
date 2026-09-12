import { CoordinationClient } from '../clients/javascript/coordination.mjs';
import { FederalRegisterCaptureStore } from '../src/acquisition/store';
import { regulatoryAgentOptions } from '../src/coordination/regulatory-agent-cli';
import { REGULATORY_AGENT_ID, runRegulatoryAgentOnce } from '../src/coordination/regulatory-agent';
import type { WorkerClient } from '../src/coordination/contract-review';

try {
  const options = regulatoryAgentOptions(process.argv.slice(2), process.env.PAYLOAD_COORDINATION_URL);
  const client = new CoordinationClient(options.url) as WorkerClient;
  const inspector = new FederalRegisterCaptureStore(options.root);
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  do {
    try { console.log(JSON.stringify({ worker: REGULATORY_AGENT_ID, ...await runRegulatoryAgentOnce(client, inspector) })); }
    catch (error) { console.error(error instanceof Error ? error.message : 'Regulatory agent failed.'); if (!options.watch) process.exitCode = 1; }
    if (!options.watch || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  } while (!stopping);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Regulatory agent could not start.');
  process.exitCode = 1;
}
