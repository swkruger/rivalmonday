/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from '../rx';
import { button, Layout } from '../layout';
import type { SignInEmailProps } from '../types';

export const signInSubject = (p: SignInEmailProps) =>
  p.signup ? `Confirm your email to create ${p.signup.agencyName}` : `Your sign-in link for ${p.branding.displayName}`;

export function SignInEmail(props: SignInEmailProps) {
  const { branding, url, signup } = props;
  return (
    <Layout branding={branding} title={signInSubject(props)} preview={signup ? `Confirm your email for ${signup.agencyName}` : `Sign in to ${branding.displayName}`}>
      <Text>{signup ? `You're getting this from Rival Monday because you started creating ${signup.agencyName} with this email address.` : `You're getting this from ${branding.displayName} because a sign-in link was requested for this email address.`}</Text>
      {signup ? (
        <Text>Click below to confirm your email and set up {signup.agencyName} on Rival Monday.</Text>
      ) : (
        <Text>Use the button below to sign in to {branding.displayName}. The link works once and expires in {props.expiresMinutes} minutes.</Text>
      )}
      <Button href={url} style={button(branding)}>{signup ? 'Confirm and continue' : 'Sign in'}</Button>
      <Text>If the button does not work, paste this address into your browser: {url}</Text>
      <Text>If you didn't ask to sign in, you can ignore this email.</Text>
    </Layout>
  );
}
