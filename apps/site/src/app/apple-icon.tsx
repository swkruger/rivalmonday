import { renderIcon } from '../lib/og';

// Home-screen icon for iOS (Next adds the <link rel="apple-touch-icon">).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return renderIcon(size.width);
}
