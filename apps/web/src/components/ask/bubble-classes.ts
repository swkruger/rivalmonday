/** Friday chat classes (app-style § 3.9). Plain module: safe to import from server and client files. */
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export const userBubbleClass = 'max-w-[85%] self-end whitespace-pre-line rounded-lg rounded-br-xs bg-ink px-3.5 py-2.5 text-sm text-white [overflow-wrap:anywhere]';
export const answerBubbleClass = 'flex flex-col gap-3 rounded-lg rounded-bl-xs border border-line bg-surface px-4 py-3.5';
export const starterChipClass = `inline-flex min-h-9 items-center rounded-md border border-line-control bg-surface px-3 py-1.5 text-left text-13 text-ink-secondary hover:bg-canvas hover:text-ink ${focus}`;
