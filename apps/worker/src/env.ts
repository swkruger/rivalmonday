export const REQUIRED_PROD_ENV: readonly string[] = [
  'DATABASE_URL', 'SERVICE_DATABASE_URL', 'APP_URL', 'LINK_SIGNING_SECRET', 'EMAIL_FROM', 'POSTMARK_SERVER_TOKEN',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'OPENROUTER_API_KEY', 'TYPESAFE_API_KEY', 'SENTRY_DSN',
];

/** Names of required env vars that are unset or blank; always [] outside production. */
export function missingProdEnv(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  return REQUIRED_PROD_ENV.filter((k) => !env[k]?.trim());
}
