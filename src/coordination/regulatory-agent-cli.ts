export function regulatoryAgentOptions(args: readonly string[], baseUrl = 'http://127.0.0.1:3000') {
  let mode: '--watch' | '--once' | undefined;
  let root: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--once' || option === '--watch') {
      if (mode) throw new Error('Select --once or --watch exactly once.');
      mode = option;
    } else if (option === '--root') {
      const value = args[++index];
      if (root !== undefined || !value?.trim() || value.startsWith('--')) throw new Error('--root requires one local evidence directory.');
      root = value;
    } else throw new Error('Usage: npm run agent:regulatory -- [--once | --watch] [--root <directory>]');
  }
  if (!/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/.test(baseUrl)) {
    throw new Error('The regulatory agent requires an HTTP literal-loopback board URL without credentials, path, query or fragment.');
  }
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The regulatory agent requires an HTTP literal-loopback board URL without credentials, path, query or fragment.');
  }
  return { watch: mode === '--watch', root: root ?? '.payload/source-qualification', url: url.toString() };
}
