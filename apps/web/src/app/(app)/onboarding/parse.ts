const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Field validation (phone, ZIP, time zone, …) lives in the `update_agency_profile` tool; this only reads the form. */
export function parseProfileForm(fd: FormData) {
  return {
    name: str(fd, 'name'),
    legalName: str(fd, 'legalName'),
    website: str(fd, 'website'),
    contactName: str(fd, 'contactName'),
    contactRole: str(fd, 'contactRole'),
    contactEmail: str(fd, 'contactEmail'),
    phone: str(fd, 'phone'),
    line1: str(fd, 'line1'), line2: str(fd, 'line2'), city: str(fd, 'city'), region: str(fd, 'region'), postalCode: str(fd, 'postalCode'),
    country: str(fd, 'country') || 'US',
    timezone: str(fd, 'timezone'),
    verticals: fd.getAll('verticals').map(String),
    billingEmail: str(fd, 'billingEmail'),
    billingSameAsPostal: fd.get('billingSameAsPostal') === 'on',
    billingLine1: str(fd, 'billingLine1'), billingLine2: str(fd, 'billingLine2'), billingCity: str(fd, 'billingCity'),
    billingRegion: str(fd, 'billingRegion'), billingPostalCode: str(fd, 'billingPostalCode'), billingCountry: str(fd, 'billingCountry'),
    taxId: str(fd, 'taxId'),
  };
}
