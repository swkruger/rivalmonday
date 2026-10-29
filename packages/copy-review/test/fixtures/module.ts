// @ts-nocheck -- scanner fixture, never compiled
import type { PageCopy } from 'some-place';
import { x } from './not-copy-path';

export const PAGE_COPY = {
  client: {
    home: {
      className: 'flex items-center gap-2',
      href: '/c/home',
      tone: 'success',
      tips: {
        score: {
          title: 'Your score',
          body: 'How {client} compares with its rivals this week.',
          guideAnchor: 'common-questions',
          id: 'Some Visible Id',
        },
      },
    },
  },
  list: ['First tip here.', 'Second tip here.'],
  url: 'https://example.com/page',
  env: 'DATABASE_URL',
  snake: 'some_snake_case',
  kebab: 'some-kebab-case',
} as const;

export const LABEL = { waiting_owner: e('Waiting for owner', 'neutral') };

export function fail(count: number, who: Person) {
  console.log({ msg: 'Debug message here.' });
  logger.info({ msg: 'Logged message here.' });
  if (count < 0) throw new Error('Negative count is not allowed.');
  return { message: `Hello ${who.name}, you have ${count} items.` };
}

type Shape = { kind: 'A kind of type.' };
