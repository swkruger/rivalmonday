const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/**
 * The about-step form as `save_agency_basics` input. Field validation (phone, ZIP, …) lives in the tool; this only reads
 * the form. An address with every field blank is `null` (nothing to keep); the tool wants all of street, city, state and
 * ZIP otherwise and says what is missing.
 */
export function parseBasicsForm(fd: FormData) {
  const address = { line1: str(fd, 'line1'), line2: str(fd, 'line2'), city: str(fd, 'city'), region: str(fd, 'region'), postalCode: str(fd, 'postalCode') };
  const tz = str(fd, 'browserTimezone');
  return {
    name: str(fd, 'name'),
    contactName: str(fd, 'contactName'),
    contactEmail: str(fd, 'contactEmail'),
    phone: str(fd, 'phone'),
    address: Object.values(address).every((v) => !v) ? null : address,
    billingSameAsPostal: fd.get('billingSameAsPostal') === 'on',
    ...(tz ? { browserTimezone: tz } : {}),
  };
}
