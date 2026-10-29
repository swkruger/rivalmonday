import RootImage from '../opengraph-image';
import { OG_SIZE } from '../../lib/og';

// The root image (see ../opengraph-image.tsx for why this segment needs its own file).
export const alt = 'Rival Monday';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return RootImage();
}
