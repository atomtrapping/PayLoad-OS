import { runReasoningCli } from '../src/reasoning/cli';

process.exitCode = await runReasoningCli(process.argv.slice(2), {
  stdout: (text) => console.log(text), stderr: (text) => console.error(text),
});
