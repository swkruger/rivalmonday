/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { SignInEmailProps } from '../types';

export const signInSubject = (p: SignInEmailProps) => `Your sign-in link for ${p.branding.displayName}`;

export function SignInEmail({ branding, url, expiresMinutes }: SignInEmailProps) {
  return (
    <Layout branding={branding} title={signInSubject({ branding, url, expiresMinutes })} preview={`Sign in to ${branding.displayName}`}>
      <Text>Use the button below to sign in to {branding.displayName}. The link works once and expires in {expiresMinutes} minutes.</Text>
      <Button href={url} style={button(branding)}>Sign in</Button>
      <Text>If the button does not work, paste this address into your browser: {url}</Text>
      <Text>If you didn't ask to sign in, you can ignore this email.</Text>
    </Layout>
  );
}
