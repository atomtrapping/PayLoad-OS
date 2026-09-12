import { runLocalToolsCli } from '../src/reasoning/local-cli';

process.exitCode = await runLocalToolsCli(process.argv.slice(2), {
  stdout: (text) => console.log(text), stderr: (text) => console.error(text),
});
