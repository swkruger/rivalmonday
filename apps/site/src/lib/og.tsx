import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { radarMarkSvg, radarTileSvg } from '@cs/ui';
import { ImageResponse } from 'next/og';
import { OG } from './og-theme';
export const OG_SIZE = { width: 1200, height: 630 } as const;
const MARK_SRC = `data:image/svg+xml;base64,${Buffer.from(radarMarkSvg()).toString('base64')}`;
const font = readFile(join(process.cwd(), 'node_modules/@fontsource/inter/files/inter-latin-600-normal.woff')); // once per build
export async function renderOg({ eyebrow, title }: { eyebrow: string; title: string }): Promise<ImageResponse> {
  return new ImageResponse(
    (<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: OG.canvas, color: OG.ink, fontFamily: 'Inter' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 40 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK_SRC} width={44} height={44} alt="" />
        <div style={{ display: 'flex' }}><span style={{ color: OG.rival }}>rival</span><span style={{ color: OG.monday }}>monday</span></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 28, color: OG.rival }}>{eyebrow}</div>
        <div style={{ fontSize: title.length > 40 ? 60 : 72, lineHeight: 1.1, letterSpacing: -1.5 }}>{title}</div>
      </div>
      <div style={{ display: 'flex', height: 8, width: 160, background: OG.primary, borderRadius: 4 }} />
    </div>),
    { ...OG_SIZE, fonts: [{ name: 'Inter', data: await font, weight: 600, style: 'normal' }] },
  );
}

/**
 * The site icon (favicon, Apple touch icon, manifest): the radar tile from `@cs/ui` (`brand-mark.ts`), the same one the app
 * uses. The Apple touch icon (180 px) is square, so iOS can round it itself; the smaller icons keep their own corners.
 */
export function renderIcon(px: number): ImageResponse {
  const svg = radarTileSvg({ rounded: px < 180 });
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    (<img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`} width={px} height={px} alt="" />),
    { width: px, height: px },
  );
}
