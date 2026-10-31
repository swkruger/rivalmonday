import type { KbKind, KbLevel } from '@cs/core';

// Plain module (not 'use client'): server pages read these maps, and a value exported from a client module is a reference there.
export const LEVEL_OPTION: Record<KbLevel, string> = { platform: 'Help (platform)', agency: 'Agency', client: 'Client' };
export const KIND_OPTION: Record<KbKind, string> = { help: 'Help article', playbook: 'Playbook', qa: 'Q&A', blog: 'Blog post', fact: 'Fact' };
