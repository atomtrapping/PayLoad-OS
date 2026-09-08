import { runBoutiqueCli } from '../src/boutique/cli';

process.exitCode = runBoutiqueCli(process.argv.slice(2), {
  stdout: (text) => console.log(text), stderr: (text) => console.error(text),
});
