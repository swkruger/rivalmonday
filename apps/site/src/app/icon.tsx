import { renderIcon } from '../lib/og';

// The browser-tab and search-result icon (Next adds the <link rel="icon">).
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return renderIcon(size.width);
}
