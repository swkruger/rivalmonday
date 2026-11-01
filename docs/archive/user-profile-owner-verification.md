# user-profile: owner verification (merged 2026-10-31)

Decisions were the agent's calls (owner said "Just go"); the list is in the [spec](../superpowers/specs/2026-10-31-user-profile-design.md). Overrule any of them.

## Check
1. Agency user: sign in, click the round avatar top right, choose Profile. Change Name, press Save, reload: the name stays. Click Upload photo, pick a JPEG or PNG: the top-bar circle shows the photo. Click Remove, then Remove photo: initials return.
2. Same page: scroll to Notifications, flip an In-app switch, reload, confirm it stuck. Open `/settings/notifications` by hand: it lands on the Notifications section.
3. Client owner: sign in, avatar menu, Profile. A "Your business" section shows Business profile, Usage (credits only, no dollars) and Billing (only while billing is on). Click View usage: the Usage page opens. Nothing says Rival Monday.
4. Client viewer: same page shows only Business profile (no Usage, no Billing).
5. Phone photo: on a phone, open Profile, tap Upload photo, take or choose a portrait photo straight from the camera (several MB, HEIC is refused with a message): it shows upright and square.

Not tested live: a real phone photo, and Vercel's 4.5 MB body limit.

## Deploy
Run `pnpm kb:seed` on each environment after deploy (done on `cs_dev` at merge). Until it runs, Profile has no Guide button and the old `page:account.settings.notifications` row stays.

## Copy to sign (`pnpm copy:review`)
- Profile page description and tips (`help/copy/account.ts`), avatar error lines (`AVATAR_ERROR_COPY`), the Remove-photo dialog, "Your business" summary labels, the "Your photo" group label and the "Notifications" heading.
- Guides `account.settings.profile.agency.md` and `.client.md`.
- Tip copy: 18 sign-offs under `...account.settings.notifications...` are orphaned by the key rename; the text is unchanged, so re-sign it.
- The fallback `That photo couldn't be uploaded...` lines and the refused-name lines (`Enter your name.`, `Enter a name without line breaks.`, `Use 80 characters or fewer.`).
- Merged just before this branch: the rank chart note `Scale zoomed to ranks 4 to 8 to show small moves.` (`charts/rank-trend.tsx`).
