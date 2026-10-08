// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiffText } from './diff-text';

describe('DiffText', () => {
  it('renders deletions and insertions as del/ins with accessible labels', () => {
    const { container } = render(
      <DiffText
        segments={[
          { op: 'equal', text: 'AC tune-up ' },
          { op: 'delete', text: '$99' },
          { op: 'insert', text: '$79' },
        ]}
      />,
    );
    expect(container.querySelector('del')?.textContent).toBe('$99');
    expect(container.querySelector('ins')?.textContent).toBe('$79');
    expect(container.querySelector('del')?.getAttribute('aria-label')).toBe('removed: $99');
  });

  it('says so when there is no text diff', () => {
    const { getByText } = render(<DiffText segments={[]} />);
    expect(getByText('No text changes stored for this evidence.')).toBeTruthy();
  });
});
