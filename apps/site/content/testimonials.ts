/**
 * Pilot agency quotes (owner supplies and signs; never invented). The home section renders nothing while this is
 * empty. Each entry needs the agency's written permission to quote it by name.
 */
export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  agency: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [];
