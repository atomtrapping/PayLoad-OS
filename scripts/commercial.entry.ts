import { runCommercialCli } from '../src/commercial/cli';

process.exitCode = runCommercialCli(process.argv.slice(2), {
  stdout: (text) => console.log(text), stderr: (text) => console.error(text),
});
