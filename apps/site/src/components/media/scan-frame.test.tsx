import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScanFrame } from './scan-frame';

afterEach(cleanup);

describe('ScanFrame', () => {
  it('renders the picture, rings and tag and nothing that moves', () => {
    const { container } = render(<ScanFrame src="/x.jpg" alt="A street scan" width={600} height={400} tag="Reviews" />);
    expect(screen.getByAltText('A street scan').getAttribute('src')).toBe('/x.jpg');
    expect(screen.getByText('Reviews')).toBeTruthy();
    expect(container.querySelector('.scan-rings')).not.toBeNull();
    const classes = [...container.querySelectorAll('[class]')].map((e) => e.getAttribute('class')).join(' ');
    for (const moving of ['scan-blip', 'scan-sweep', 'scan-ping']) expect(classes).not.toContain(moving);
  });
});
