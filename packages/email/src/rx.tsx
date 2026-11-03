/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ComponentProps } from 'react';
import { Text as BaseText } from 'react-email';

/**
 * react-email, with our own `Text`: 16 px on a 24 px line by default (owner, 2026-11-02: emails read too small at
 * react-email's 14 px). Templates import from here, never from `react-email` directly; a `style` still overrides.
 */
export * from 'react-email';

export function Text({ style, ...rest }: ComponentProps<typeof BaseText>) {
  return <BaseText {...rest} style={{ fontSize: 16, lineHeight: '24px', ...style }} />;
}
