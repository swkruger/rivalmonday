'use client';
import type { VoiceSettings } from '@cs/core';
import { Button, StatusChip } from '@cs/ui';
import { useState, useTransition } from 'react';
import { WriteGuard } from '@/components/read-only';
import { checkVoice, TONE_COPY, VoiceFields } from './voice-fields';
import type { RunbookAction, RunbookLevel, RunbookVoiceData, VoicePreview } from './types';

const VOICE_KEY = 'knob:voice';

type Message = { kind: 'error' | 'saved'; text: string };

function VoiceSummary({ voice }: { voice: VoiceSettings }) {
  return (
    <div className="flex flex-col gap-1 text-sm text-muted-ink">
      <p>Tone: {TONE_COPY[voice.tone].label}. {TONE_COPY[voice.tone].hint}</p>
      {voice.preferredTerms.length > 0 && <p>Say {voice.preferredTerms.map((p) => `“${p.say}” instead of “${p.insteadOf}”`).join(', ')}.</p>}
      {voice.bannedTerms.length > 0 && <p>Banned: {voice.bannedTerms.join(', ')}.</p>}
    </div>
  );
}

/**
 * The Voice section of the agency and client runbooks (13a2 R3). Saves the whole `VoiceSettings` on item `knob:voice`;
 * a client can leave it to the agency or set its own. Messages (refusals, saved, preview) live in one always-mounted region.
 */
export function VoiceSection({ voice, level, canEdit, action, clientName }: {
  voice: RunbookVoiceData;
  level: Exclude<RunbookLevel, 'platform'>;
  /** The viewer may write here: role, a client runbook of its own, no support session, no tailoring in progress. */
  canEdit: boolean;
  /** The page's server action (not the editor's `run`: voice messages stay in this section). */
  action: RunbookAction;
  clientName?: string;
}) {
  const [value, setValue] = useState<VoiceSettings>(voice.own ?? voice.effective);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const [pending, start] = useTransition();
  const isClient = level === 'client';
  const showFields = !isClient || voice.own !== null || editing;

  const setProblem = (text: string | null) => setMessage(text ? { kind: 'error', text } : null);
  const save = () => {
    const c = checkVoice(value);
    if (!c.ok) return setProblem(c.error);
    start(async () => {
      const r = await action({ op: 'save', key: VOICE_KEY, content: c.voice });
      setMessage(r.ok ? { kind: 'saved', text: 'Saved. New briefs and alerts use this voice.' } : { kind: 'error', text: r.error });
    });
  };
  const runPreview = () => {
    const c = checkVoice(value);
    if (!c.ok) return setProblem(c.error);
    setMessage(null);
    setPreview(null);
    start(async () => {
      const r = await action({ op: 'preview', voice: c.voice });
      if (r.ok && r.preview) setPreview(r.preview);
      else if (!r.ok) {
        setPreview(null);
        setMessage({ kind: 'error', text: r.error });
      }
    });
  };
  const useAgency = () => {
    setMessage(null);
    start(async () => {
      const r = await action({ op: 'remove', key: VOICE_KEY });
      if (r.ok) {
        setEditing(false);
        setPreview(null);
        setValue(voice.agency ?? voice.effective);
      } else setMessage({ kind: 'error', text: r.error });
    });
  };

  const description = isClient
    ? `How briefs, alerts and recommendations are worded for ${clientName ?? 'this client'}.`
    : 'How briefs, alerts and recommendations are worded for every client. Facts and numbers never change.';

  return (
    <div className="flex flex-col gap-4 p-6" data-item={VOICE_KEY}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-ink">{description}</p>
        {isClient && voice.own !== null && <StatusChip tone="info">Own voice</StatusChip>}
      </div>

      {isClient && !showFields && (
        <>
          <p className="font-semibold">Uses the agency voice.</p>
          <VoiceSummary voice={voice.effective} />
          {canEdit && (
            <WriteGuard>
              <div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setValue(voice.effective);
                    setEditing(true);
                  }}
                >
                  Set a voice for this client
                </Button>
              </div>
            </WriteGuard>
          )}
        </>
      )}

      {showFields && (
        <>
          <VoiceFields value={value} onChange={(v) => {
              setValue(v);
              setPreview(null);
            }}
            onProblem={setProblem} disabled={!canEdit} />
          {canEdit && (
            <WriteGuard>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={pending} onClick={save}>Save voice</Button>
                <Button variant="outline" disabled={pending} onClick={runPreview}>Preview</Button>
                {isClient && voice.own !== null && <Button variant="ghost" disabled={pending} onClick={useAgency}>Use the agency voice</Button>}
              </div>
            </WriteGuard>
          )}
        </>
      )}

      <div data-testid="voice-result" role="status" aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {message?.kind === 'error' && <p className="text-sm text-danger-text">{message.text}</p>}
        {message?.kind === 'saved' && <p className="text-sm">{message.text}</p>}
        {preview && (
          <div className="flex flex-col gap-1 rounded-sm bg-canvas p-4 text-sm">
            <h4 className="font-semibold">Sample alert</h4>
            <p>{preview.text}</p>
            {preview.bannedTerms.length > 0 && <p className="text-muted-ink">This sample still uses: {preview.bannedTerms.join(', ')}.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
