/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Img } from '../rx';
import { brandInk, type Branding } from '../branding';
import { longDate } from './report/format';

/**
 * Page 1 of the weekly report (spec §4.8.1): agency logo (the one allow-listed URL) and name, then the ink band with
 * the decided title, the client and the week. The band is the app's `--brand-ink` (agency colour darkened to >= 7:1 under white, else ink). Agency-branded only: nothing here names the platform.
 */
export function ReportCover(p: { branding: Branding; clientName: string; deliveryDate: string; periodLabel: string }) {
  const b = p.branding;
  return (
    <div data-section="cover" style={{ paddingTop: 48 }}>
      <div style={{ paddingBottom: 24 }}>
        {b.logoUrl ? <Img src={b.logoUrl} alt={b.displayName} height="40" style={{ marginBottom: 12 }} /> : null}
        <div style={{ fontSize: 20, lineHeight: '28px', fontWeight: 700, color: b.ink }}>{b.displayName}</div>
      </div>
      <div style={{ backgroundColor: brandInk(b.primary, b.secondary), color: '#FFFFFF', borderRadius: 12, padding: '40px 32px' }}>
        <div style={{ fontSize: 32, lineHeight: '40px', fontWeight: 800 }}>Weekly competitor report</div>
        <div style={{ fontSize: 22, lineHeight: '30px', fontWeight: 600, marginTop: 16 }}>{p.clientName}</div>
        <div style={{ fontSize: 16, lineHeight: '24px', marginTop: 8 }}>{`Week of ${longDate(p.deliveryDate)}`}</div>
        {p.periodLabel ? <div style={{ fontSize: 14, lineHeight: '20px', marginTop: 4, opacity: 0.8 }}>{p.periodLabel}</div> : null}
      </div>
    </div>
  );
}
