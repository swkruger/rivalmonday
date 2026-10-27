'use client';
import { citationPillClass, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@cs/ui';
import { BookOpen } from 'lucide-react';
import { useState } from 'react';
import { loadKbArticle } from '@/app/(app)/kb/actions';
import { KB_MISSING, KbArticleView, type KbArticle } from './article-view';

type State = { status: 'idle' | 'loading' } | { status: 'ready'; article: KbArticle } | { status: 'missing' };

/** A kb citation chip that opens a read-only article sheet. Messages store ids only, so the chip reads "Article". */
export function ArticleSheet({ kbId, load = loadKbArticle }: { kbId: string; load?: (kbId: string) => Promise<KbArticle | null> }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const onOpenChange = (open: boolean) => {
    if (!open || state.status === 'ready' || state.status === 'loading') return;
    setState({ status: 'loading' });
    load(kbId).then(
      (article) => setState(article ? { status: 'ready', article } : { status: 'missing' }),
      () => setState({ status: 'missing' }),
    );
  };
  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={`mx-0.5 ${citationPillClass}`}
        >
          <BookOpen aria-hidden className="h-3 w-3" />
          Article
        </button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetTitle>{state.status === 'ready' ? state.article.title : 'Article'}</SheetTitle>
        {state.status === 'ready' && <KbArticleView article={state.article} />}
        {state.status === 'missing' && <p className="text-muted-foreground">{KB_MISSING}</p>}
        {state.status === 'loading' && <p className="text-muted-foreground">Loading…</p>}
      </SheetContent>
    </Sheet>
  );
}
