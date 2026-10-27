/** 16 §7: the owner's welcome line is dismissed per client, in a cookie (no DB). */
export const welcomeCookieName = (clientId: string) => `rm_welcome_${clientId}`;
