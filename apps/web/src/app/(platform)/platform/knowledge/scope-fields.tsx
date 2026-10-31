'use client';
import { KB_KINDS, KB_LEVELS, type KbKind, type KbLevel } from '@cs/core';
import { nativeSelectClass } from '@cs/ui';
import { useState } from 'react';
import { KIND_OPTION, LEVEL_OPTION } from './options';

export type KbTargets = { agencies: { id: string; name: string; clients: { id: string; name: string }[] }[] };

export const selectClass = `${nativeSelectClass} w-full font-normal`;

/** Level, agency and client pickers plus the kind select; the agency/client pickers appear only when the level needs them. */
export function ScopeFields({
  targets,
  idPrefix,
  initial,
  onLevel,
}: {
  targets: KbTargets;
  idPrefix: string;
  initial?: { level?: KbLevel; agencyId?: string | null; clientId?: string | null; kind?: KbKind };
  onLevel?: (l: KbLevel) => void;
}) {
  const [level, setLevel] = useState<KbLevel>(initial?.level ?? 'platform');
  const [agencyId, setAgencyId] = useState(initial?.agencyId ?? '');
  const clients = targets.agencies.find((a) => a.id === agencyId)?.clients ?? [];
  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Level
        <select
          name="level"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value as KbLevel);
            onLevel?.(e.target.value as KbLevel);
          }}
          className={selectClass}
        >
          {KB_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_OPTION[l]}</option>)}
        </select>
      </label>
      {level !== 'platform' && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Agency
          <select name="agencyId" required value={agencyId} onChange={(e) => setAgencyId(e.target.value)} className={selectClass}>
            <option value="" disabled>Choose an agency…</option>
            {targets.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
      {level === 'client' && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Client
          <select name="clientId" required defaultValue={initial?.clientId ?? ''} key={`${idPrefix}-${agencyId}`} className={selectClass}>
            <option value="" disabled>Choose a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Kind
        <select name="kind" defaultValue={initial?.kind ?? 'help'} className={selectClass}>
          {KB_KINDS.map((k) => <option key={k} value={k}>{KIND_OPTION[k]}</option>)}
        </select>
      </label>
    </>
  );
}
