import 'server-only';
import { headers } from 'next/headers';
import { Check, Plus } from 'lucide-react';
import {
  Button, Card, CitationPill, NumberMarker, StatusChip, Tabs, TabsContent, TabsLink, TabsLinkList, TabsList, TabsTrigger, Tag, themeVars,
  type ChipTone,
} from '@cs/ui';
import { PageHeader } from '@/components/page-header';
import { answerBubbleClass, starterChipClass, userBubbleClass } from '@/components/ask/bubble-classes';
import { requestGuardOn } from '@/server/dev-guard';

/** The route's second gate (after the production check): the same request guard as the banner and panel routes. */
export async function galleryAllowed(): Promise<boolean> {
  return requestGuardOn((await headers()).get('host'));
}

const THEMES: { name: string; style: Record<string, string> | undefined }[] = [
  { name: 'Default', style: undefined },
  { name: 'Purple', style: themeVars({ primary: '#7A1FA2', secondary: '#0F766E' }) },
  { name: 'Near-ink', style: themeVars({ primary: '#102A43', secondary: '#2A6BAC' }) },
];
const TONES: ChipTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];
const VARIANTS = ['default', 'destructive', 'destructive-outline', 'outline', 'ghost', 'ink', 'done', 'link'] as const;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-13 font-semibold text-muted-ink">{title}</h3>
      {children}
    </section>
  );
}

function ThemeSheet({ name, style }: { name: string; style: Record<string, string> | undefined }) {
  return (
    <div data-gallery-theme={name} style={style} className="flex flex-col gap-8 rounded-lg border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">{name}</h2>

      <Block title="Buttons">
        <div className="flex flex-col gap-3">
          {(['default', 'sm'] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-2">
              {VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant === 'done' ? <Check /> : null}
                  {variant === 'done' ? 'Mark done' : variant}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </Block>

      <Block title="Chips">
        <div className="flex flex-col gap-2">
          {(['default', 'strong'] as const).map((emphasis) => (
            <div key={emphasis} className="flex flex-wrap items-center gap-2">
              {TONES.map((tone) => (
                <StatusChip key={`s-${tone}`} tone={tone} emphasis={emphasis}>{`Status ${tone}`}</StatusChip>
              ))}
              {TONES.map((tone) => (
                <Tag key={`t-${tone}`} tone={tone} emphasis={emphasis}>{`Impact: ${tone}`}</Tag>
              ))}
            </div>
          ))}
        </div>
      </Block>

      <Block title="Citation pills">
        <div className="flex flex-wrap items-center gap-2">
          <CitationPill source="acme-hvac.example" date="Oct 30" />
          <CitationPill tone="info" source="acme-hvac.example" date="Oct 30" />
          <CitationPill tone="info" n={2} />
        </div>
      </Block>

      <Block title="Number markers">
        <div className="flex items-center gap-3">
          <NumberMarker n={1} size="sm" />
          <NumberMarker n={2} size="md" />
        </div>
      </Block>

      <Block title="Tabs">
        <div className="flex flex-col gap-4">
          {(['underline', 'segmented'] as const).map((variant) => (
            <div key={variant} className="flex flex-col gap-3">
              <Tabs defaultValue="a">
                <TabsList variant={variant}>
                  <TabsTrigger value="a">Open</TabsTrigger>
                  <TabsTrigger value="b">Done</TabsTrigger>
                </TabsList>
                <TabsContent value="a" className="pt-2 text-13 text-muted-ink">{variant} (Radix)</TabsContent>
                <TabsContent value="b" className="pt-2 text-13 text-muted-ink">{variant} (Radix), second</TabsContent>
              </Tabs>
              <TabsLinkList variant={variant} aria-label={`${variant} links`}>
                <TabsLink variant={variant} href="#a" active>Open</TabsLink>
                <TabsLink variant={variant} href="#b">Done</TabsLink>
              </TabsLinkList>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Lanes with raised cards">
        <div className="grid gap-3 md:grid-cols-3">
          {['To do', 'In progress', 'Done'].map((lane) => (
            <div key={lane} className="flex flex-col gap-2 rounded-lg bg-muted-surface p-3">
              <p className="text-13 font-semibold text-ink">{lane}</p>
              <Card variant="raised" className="gap-1 p-3">
                <p className="text-13 font-medium text-ink">Match the rival&apos;s weekend hours</p>
                <Tag tone="info" emphasis="strong">Impact: High</Tag>
              </Card>
              <Card variant="raised" className="gap-1 p-3">
                <p className="text-13 font-medium text-ink">Refresh the pricing page</p>
              </Card>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Page headers">
        <div className="flex flex-col gap-6">
          {(['default', 'ink'] as const).map((tone) => (
            <PageHeader
              key={tone}
              tone={tone}
              title={`Briefs (${tone})`}
              description="Weekly evidence-backed briefs."
              breadcrumb={[{ label: 'Acme HVAC', href: '#' }, { label: 'Briefs' }]}
              actions={
                <>
                  <Button variant="outline">Export</Button>
                  <Button><Plus />New brief</Button>
                  <Button variant="ghost">Share</Button>
                </>
              }
            />
          ))}
        </div>
      </Block>

      <Block title="Friday bubbles">
        <div className="flex max-w-xl flex-col gap-3">
          <p className={userBubbleClass}>What changed at my top rival this week?</p>
          <div className={answerBubbleClass}>
            <p className="text-sm text-ink">Your top rival cut its tune-up price to $79.</p>
            <div><CitationPill tone="info" source="acme-hvac.example" date="Oct 30" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={starterChipClass}>Who raised prices?</span>
            <span className={starterChipClass}>What should I do first?</span>
          </div>
        </div>
      </Block>
    </div>
  );
}

/** App-style § 3.8: every stage-A primitive under three theme wrappers. Static markup; no form actions. */
export function DevGallery() {
  return (
    <div data-rm-dev-panel="gallery" className="mx-auto flex max-w-[1560px] flex-col gap-8 bg-canvas p-6">
      <h1 className="text-xl font-semibold text-ink">Primitives gallery (dev only)</h1>
      {THEMES.map((t) => (
        <ThemeSheet key={t.name} name={t.name} style={t.style} />
      ))}
    </div>
  );
}
