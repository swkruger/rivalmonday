import { Button } from '@cs/ui';

type Props = { kind: 'not_found' | 'error'; digest?: string; onRetry?: () => void };

const COPY = {
  not_found: { title: 'Page not found', body: "This page doesn't exist or you don't have access to it." },
  error: { title: 'Something went wrong', body: 'Please try again in a moment.' },
} as const;

/**
 * Neutral error / 404 block (15c-1 §3.5): no wordmark, no agency logo, no product name, and never the error's message or
 * stack. The reference is the opaque Next digest, so support can find the server log line.
 */
export function ErrorPanel({ kind, digest, onRetry }: Props) {
  const { title, body } = COPY[kind];
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-[22px] font-bold leading-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {kind === 'error' && onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
        <Button asChild variant={kind === 'error' ? 'outline' : 'default'}>
          <a href="/">Go to your home page</a>
        </Button>
      </div>
      {kind === 'error' && digest ? <p className="text-xs text-muted-foreground">Reference: {digest}</p> : null}
    </div>
  );
}
