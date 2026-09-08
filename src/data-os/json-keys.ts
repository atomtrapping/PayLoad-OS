/**
 * Reject duplicate decoded keys after JSON.parse has established valid syntax.
 * Decoding, byte limits and domain-specific errors remain the caller's contract.
 */
export function rejectDuplicateJsonKeys(json: string, duplicate: () => Error): void {
  const stack: Array<{ kind: 'array' } | { kind: 'object'; keys: Set<string>; expectingKey: boolean }> = [];
  for (let index = 0; index < json.length; index++) {
    const character = json[index];
    if (character === '{') stack.push({ kind: 'object', keys: new Set(), expectingKey: true });
    else if (character === '[') stack.push({ kind: 'array' });
    else if (character === '}' || character === ']') stack.pop();
    else if (character === ',') {
      const current = stack.at(-1);
      if (current?.kind === 'object') current.expectingKey = true;
    } else if (character === '"') {
      const start = index;
      for (index++; index < json.length; index++) {
        if (json[index] === '\\') index++;
        else if (json[index] === '"') break;
      }
      const current = stack.at(-1);
      if (current?.kind === 'object' && current.expectingKey) {
        const key = JSON.parse(json.slice(start, index + 1)) as string;
        if (current.keys.has(key)) throw duplicate();
        current.keys.add(key);
        current.expectingKey = false;
      }
    }
  }
}
