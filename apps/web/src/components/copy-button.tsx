'use client';
import { Button } from '@cs/ui';
import { useState } from 'react';

/**
 * Copies `text` to the clipboard; the label reads "Copied" or "Copy failed" afterwards. `ariaLabel` names the button when the
 * visible label is shared by several (the DNS tables' "Copy"); it must contain the visible label (WCAG 2.5.3) and gives way to "Copied" / "Copy failed" once clicked.
 */
export function CopyButton({ text, label, ariaLabel }: { text: string; label: string; ariaLabel?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <Button
      type="button"
      variant="outline"
      {...(ariaLabel && state === 'idle' ? { 'aria-label': ariaLabel } : {})}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('copied');
        } catch {
          setState('failed');
        }
      }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </Button>
  );
}
