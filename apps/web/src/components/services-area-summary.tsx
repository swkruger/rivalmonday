import type { ClientProfile } from '@cs/tools';
import { kmToMiles } from '@/lib/format';

export function ServicesAreaSummary({ profile, serviceNames }: { profile: Pick<ClientProfile, 'services' | 'keywords' | 'serviceArea' | 'placeId'>; serviceNames: Record<string, string> }) {
  const a = profile.serviceArea;
  const rows: [string, string][] = [
    ['Services', profile.services.length ? profile.services.map((s) => serviceNames[s] ?? s).join(', ') : 'None yet'],
    ['Keywords', profile.keywords.length ? profile.keywords.join(', ') : 'None yet'],
    ['Area', a ? [`${Math.round(kmToMiles(a.radiusKm))} miles around the business`, ...(a.zips.length ? [`${a.zips.length} ZIP codes`] : []), ...(a.towns?.length ? [a.towns.join(', ')] : [])].join(' · ') : 'No service area set yet.'],
    ['Google Business Profile', profile.placeId ? 'Linked' : 'Not linked'],
  ];
  return (
    <dl className="grid gap-4 rounded-md border border-line bg-surface p-6 sm:grid-cols-[200px_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
