// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHIP_COLOURS, StatusChip, type ChipTone } from './status-chip';
import { Skeleton } from './skeleton';
import { ConfirmDialog } from './confirm-dialog';
import { SaveBar } from './save-bar';

afterEach(cleanup);

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('StatusChip / Skeleton', () => {
  it('status chip tones meet 4.5:1 contrast', () => {
    for (const tone of Object.keys(CHIP_COLOURS) as ChipTone[]) {
      const { bg, text } = CHIP_COLOURS[tone];
      expect(ratio(bg, text), tone).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('status chip renders children and title', () => {
    render(<StatusChip tone="info" title="Why">Tracking</StatusChip>);
    const chip = screen.getByText('Tracking');
    expect(chip.getAttribute('title')).toBe('Why');
    expect(chip.className).toContain('rounded-full');
  });

  it('skeleton is aria-hidden', () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe('true');
  });
});

function openDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const action = props.action ?? vi.fn();
  render(
    <ConfirmDialog
      trigger={<button>Open</button>}
      title="Remove it?"
      body="This cannot be undone."
      confirmLabel="Remove"
      {...props}
      action={action}
    />,
  );
  fireEvent.click(screen.getByText('Open'));
  return action as ReturnType<typeof vi.fn>;
}

describe('ConfirmDialog', () => {
  it('confirm dialog focuses Cancel on open', async () => {
    openDialog();
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });

  it('confirm dialog Esc closes without calling action', async () => {
    const action = openDialog();
    await screen.findByRole('dialog');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(action).not.toHaveBeenCalled();
  });

  it('confirm stays disabled until requireText matches exactly', async () => {
    openDialog({ requireText: 'Acme' });
    const confirm = (await screen.findByRole('button', { name: 'Remove' })) as HTMLButtonElement;
    const box = screen.getByLabelText('Type Acme to confirm');
    expect(confirm.disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'acme' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(box, { target: { value: ' Acme ' } });
    expect(confirm.disabled).toBe(false);
  });

  it('Enter in the confirm text box does not submit before a match', async () => {
    const action = openDialog({ requireText: 'Acme' });
    const box = await screen.findByLabelText('Type Acme to confirm');
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    box.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('confirm submits fields as hidden inputs once', async () => {
    const action = openDialog({ fields: { id: '42' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = action.mock.calls[0]![0] as FormData;
    expect(fd.get('id')).toBe('42');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('confirm button disabled while pending (no double submit)', async () => {
    const action = vi.fn(() => new Promise<void>(() => {}));
    openDialog({ action });
    const confirm = (await screen.findByRole('button', { name: 'Remove' })) as HTMLButtonElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm.disabled).toBe(true));
    fireEvent.click(confirm);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('SaveBar', () => {
  it('save bar hidden when clean', () => {
    const { container } = render(<SaveBar dirty={false} pending={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('save bar shows Saving… and disables while pending', () => {
    render(<SaveBar dirty pending onReset={() => {}} />);
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.type).toBe('submit');
  });

  it('save bar offers Discard and the default label when dirty', () => {
    const onReset = vi.fn();
    render(<SaveBar dirty pending={false} onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onReset).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });
});

