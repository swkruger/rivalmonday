import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHIP_COLOURS, type ChipTone } from './status-chip';

describe('StatusChip tokens', () => {
  it('chip CSS tokens equal CHIP_COLOURS', () => {
    const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
    for (const tone of Object.keys(CHIP_COLOURS) as ChipTone[]) {
      for (const part of ['bg', 'text'] as const) {
        const m = new RegExp(`--chip-${tone}-${part}: *(#[0-9a-fA-F]{6})`).exec(css);
        expect(m, `${tone}-${part}`).not.toBeNull();
        expect(m![1]!.toLowerCase(), `${tone}-${part}`).toBe(CHIP_COLOURS[tone][part].toLowerCase());
      }
    }
  });

  it('--shadow-card is retired', () => {
    const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
    expect(css).not.toContain('--shadow-card');
  });
});
