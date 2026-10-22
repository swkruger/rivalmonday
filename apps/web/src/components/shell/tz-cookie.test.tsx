// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { TzCookie } from './tz-cookie';

function clearCookie() {
  document.cookie = 'rm_tz=; Path=/; Max-Age=0';
}

describe('TzCookie', () => {
  beforeEach(() => {
    clearCookie();
    refresh.mockClear();
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'America/Chicago' } as Intl.ResolvedDateTimeFormatOptions);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearCookie();
  });

  it('writes the cookie and refreshes once when missing', () => {
    render(<TzCookie />);
    expect(document.cookie).toContain('rm_tz=America%2FChicago');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the cookie already matches', () => {
    document.cookie = 'rm_tz=America%2FChicago; Path=/';
    render(<TzCookie />);
    expect(refresh).not.toHaveBeenCalled();
  });
});
