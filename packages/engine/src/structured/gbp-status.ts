/** Google Business Profile `business_status` values in reader words; any other (transient open/close/closing_soon...) value reads `open`. */
export const GBP_STATUS_PHRASE: Record<string, string> = { closed_forever: 'permanently closed', temporarily_closed: 'temporarily closed', open: 'open' };
