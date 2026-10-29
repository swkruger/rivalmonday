/**
 * The one switch for website-monitoring copy. `false` until the app runs with
 * `WEB_MONITORING_ENABLED=true` (after `https://rivalmonday.app/bot` loads); the owner then flips it
 * to `true` once (docs/DEPLOY.md, sign-off § 0). It drives the Rival Monday compare `websites` cell,
 * the compare hub "What gets watched" row and the website `weDiffer` lines.
 */
export const WEBSITE_MONITORING_LIVE: boolean = false;
