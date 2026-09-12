'use client';

import { useState } from 'react';

/**
 * Copies a value to the clipboard. Given `target`, the id of an element, it
 * copies that element's rendered text at the moment of the click, so a page
 * that already prints a document in a <pre> hands the button an id and not a
 * second copy of the document: the /api examples and the release manifest
 * were serialised twice, once into the markup and once into this button's
 * props, and the second copy rode in the page's payload for nothing. `value`
 * remains for short strings that are not printed anywhere.
 */
export function CopyButton({ value, target, label = 'Copy', className = '' }: { value?: string; target?: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      const text = target ? document.getElementById(target)?.textContent ?? '' : value ?? '';
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure origin, permissions) — control stays inert */
    }
  };
  return (
    <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `${label} to clipboard`} className={`btn btn-sm btn-quiet ${className}`}>
      <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
      <span className="label-sm" style={{ color: 'inherit' }}>{copied ? 'Copied' : label}</span>
    </button>
  );
}
