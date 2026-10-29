import { Button } from '@cs/ui';

const COLS = [{ label: 'Name' }, { label: 'Last seen' }];

export function Welcome({ name, count }: { name: string; count: number }) {
  return (
    <section className="flex items-center gap-2" data-testid="welcome-card">
      <h1>Welcome back</h1>
      <p>
        Hello <b>{name}</b>, you have {count} new alerts waiting.
      </p>
      <p>
        You have {count} items in your queue.
      </p>
      <input aria-label="Search rivals" placeholder="Type a rival name" className="w-full px-2" name="Some Field" />
      <a href="/c/home" title="Open the dashboard">Go</a>
      <Button variant="primary" label="Save changes" />
      {count > 0 ? 'Alerts are on' : 'Alerts are off'}
      {'Literal child text'}
    </section>
  );
}

export function Other() {
  return <div>Nothing to see here</div>;
}
