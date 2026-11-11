import 'server-only';

/**
 * 18c-2 D4: one plain how-to line under a listing whose name or phone differs, keyed by directory host. Generic steps only
 * (sign in or claim, edit the business details); never a menu name we can't verify. Owner signs the wording in `pnpm copy:review`.
 */
export const LISTING_FIX: Record<string, string> = {
  'facebook.com': 'Open your Facebook Page, choose to edit the Page info, and update the business name and phone so they match your Google profile.',
  'bbb.org': 'Sign in to your Better Business Bureau business account (or claim the listing) and update your business name and phone.',
  'yellowpages.com': 'Claim your Yellow Pages listing, sign in, and update your business name and phone in the listing details.',
  'manta.com': 'Claim your Manta listing, sign in, and update your business name and phone in your company profile.',
  'foursquare.com': 'Claim your business on Foursquare, sign in, and update your business name and phone in the place details.',
  'mapquest.com': 'Claim your MapQuest listing, sign in, and update your business name and phone in your business details.',
  'angi.com': 'Sign in to your Angi Pro account and update your business name and phone in your profile.',
  'homeadvisor.com': 'Sign in to your HomeAdvisor Pro account and update your business name and phone in your profile.',
  'thumbtack.com': 'Sign in to your Thumbtack Pro account and update your business name and phone in your profile.',
  'houzz.com': 'Sign in to your Houzz Pro account and update your business name and phone in your profile.',
  'porch.com': 'Claim your Porch profile, sign in, and update your business name and phone in your profile.',
  'findadentist.ada.org': 'Sign in on the ADA website and update your practice name and phone in your Find-a-Dentist listing.',
};

export const LISTING_FIX_FALLBACK = 'Sign in to your account on this directory, or claim the listing, and update your business name and phone so they match your Google profile.';
