// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

afterEach(cleanup);

describe('DialogContent', () => {
  it('is a scrollable, height-capped dialog-content', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
          <DialogDescription>D</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const el = screen.getByRole('dialog');
    expect(el.getAttribute('data-slot')).toBe('dialog-content');
    expect(el.className).toContain('overflow-y-auto');
    expect(el.className).toContain('max-h-[calc(100dvh-2rem)]');
  });
});
