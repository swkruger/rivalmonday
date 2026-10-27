/**
 * Spec 16 §7 welcome line. A plain module (not `'use client'`): the server component `OwnerFirstVisit` calls it, and a
 * function exported from a `'use client'` module is only a client reference on the server (calling it throws).
 * No gendered words; without a first name the line simply starts "Welcome."
 */
export const welcomeLine = (firstName: string | null, agency: string) =>
  `Welcome${firstName ? `, ${firstName}` : ''}. ${agency} set this up for you. Your starting point is on its way.`;
