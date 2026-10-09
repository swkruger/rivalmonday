import type { DemoUserKey } from './users';

export type DemoClientKey = 'loneStar' | 'brazos' | 'lakeside';
export type ActiveClientKey = 'loneStar' | 'brazos';
export type Route = 'alert' | 'brief' | 'archive';

export interface DemoCompetitor {
  id: string;
  name: string;
  slug: string;
  domain: string;
  placeId: string;
  lat: number;
  lng: number;
}

export interface DemoEvent {
  id: string;
  client: ActiveClientKey;
  competitorId: string;
  changeId: string;
  changeType: string;
  source: string;
  route: Route;
  score: number;
  occurredAt: Date;
  summary: string;
  /** The after screenshot (web) or the vendor JSON (other sources). */
  evidenceIds: string[];
}

export interface DemoMove {
  id: string;
  client: ActiveClientKey;
  competitorId: string;
  moveType: string;
  open: boolean;
  summary: string;
}

/** Everything later seed areas, the coverage test and the CLIs need to find again. */
export interface DemoIds {
  agencyId: string;
  clients: Record<DemoClientKey, string>;
  selfLoneStar: string;
  competitors: Record<DemoClientKey, DemoCompetitor[]>;
  /** Spec §4.1: one competitor with no data in each area, on purpose. */
  noData: { pricing: string; ads: string; reviews: string; rankings: string };
  users: Record<DemoUserKey, { userId: string; contactId: string; email: string }>;
  /** competitor id → its tracked page ids. */
  pages: Record<string, { home: string; pricing: string }>;
  events: DemoEvent[];
  moves: DemoMove[];
  sampleReviewIds: string[];
  briefs: { sentLoneStar: string[]; sentBrazos: string[]; readyLoneStar: string; quietBrazos: string };
  alerts: { delivered: string; pending: string; dismissed: string };
  reportId: string;
}

export function emptyIds(): DemoIds {
  return {
    agencyId: '',
    clients: { loneStar: '', brazos: '', lakeside: '' },
    selfLoneStar: '',
    competitors: { loneStar: [], brazos: [], lakeside: [] },
    noData: { pricing: '', ads: '', reviews: '', rankings: '' },
    users: {} as DemoIds['users'],
    pages: {},
    events: [],
    moves: [],
    sampleReviewIds: [],
    briefs: { sentLoneStar: [], sentBrazos: [], readyLoneStar: '', quietBrazos: '' },
    alerts: { delivered: '', pending: '', dismissed: '' },
    reportId: '',
  };
}
