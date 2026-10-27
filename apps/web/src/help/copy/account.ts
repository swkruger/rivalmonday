import type { PageCopy } from '.';

/**
 * Short in-page help copy for account pages (`account.*`) shown in every context, 15b-2 Task 9b. Same rules as `client.ts`.
 * Who reaches what: Inbox and Notification settings are reached by agency roles and client roles (the inbox also by
 * guests; a support session gets a 404 on both), so each tip or empty state that only fits one of them carries an
 * `audience` (`agency` / `client`); a platform operator reads them through an own agency membership, so as agency staff.
 * The setup wizard is agency-admin only. Each page reads `helpGuides(ctx, 'agency')`, the scope `PageGuide` derives for
 * `/inbox`, `/settings/*` and `/onboarding` (`helpScopeOf`).
 */
export const ACCOUNT_COPY = {
  'account.inbox': {
    // source: apps/web/src/app/(app)/inbox/page.tsx (listInbox limit 100, newest first, Mark all read); inbox/actions.ts:openNotification
    description: 'Your latest 100 notifications, newest first: the alerts, briefs, reports and notices sent to you. Select one to open it.',
    tips: {
      // source: apps/web/src/app/(app)/inbox/page.tsx (unread title font-bold, read font-medium); inbox/actions.ts:openNotification (markRead then redirect to the notice's page, or back to /inbox when it has none), markAllReadAction
      unread: {
        title: 'Unread and read',
        body: 'A bold title is unread. Selecting a notification marks it read and takes you to the page it is about; a notice with nothing to open brings you back here. Mark all read marks every notification you have, not only the ones on this page.',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/server/inbox.ts:NOTIFICATION_KIND_LABELS; packages/db/src/schema/delivery.ts:CLIENT_KINDS, AGENCY_KINDS; packages/engine/src/alerts/route.ts:notifyAm (alert to review or sent), briefs/notify.ts (brief ready or failed), briefs/deliver.ts:notifyOverdue (not sent at 07:00 client time), delivery/rank-notices.ts:notifyRankScanSkipped (monthly credit limit); apps/worker/src/jobs/setup.ts (setup reminders: suggestions ready, client changed their setup, idle)
      labelsAgency: {
        title: 'What the labels mean',
        body: 'The grey label names the kind of notice. Client alerts (agency): an alert to review, or one that was already sent, for a client you cover. Brief ready for review and Brief failed: a client\'s weekly brief is ready for your approval, or could not be produced. Brief overdue: a brief was still waiting for approval at 07:00 client time. Rank scan skipped: a map ranking scan would have gone over the client\'s monthly credit limit. Competitor suggestions ready, Client updated their setup and Setup waiting on you: where a client\'s setup stands. Quarterly report: a client\'s quarterly report is ready.',
        audience: 'agency',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/server/inbox.ts:NOTIFICATION_KIND_LABELS; packages/db/src/schema/delivery.ts:CLIENT_KINDS (alert, alert_digest, brief, trend_report); packages/engine/src/alerts/route.ts, alerts/digest.ts, briefs/deliver.ts, reports/quarterly.ts
      labelsClient: {
        title: 'What the labels mean',
        body: 'The grey label names the kind of notice. Instant alerts: one change that matters, sent when it is ready. Alert digest: alerts held back for an evening roundup. Weekly brief: your brief for the week. Quarterly report: the report written after each quarter.',
        audience: 'client',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/components/shell/avatar-menu.tsx (Notification settings link); packages/engine/src/delivery/contacts.ts:recipientsFor (a switched-off channel is skipped, so a notice is not created)
      choose: {
        title: 'Choosing what arrives',
        body: 'If you have an account menu, Notification settings there has two switches for each kind of notice: In-app and Email. Switch In-app off and new notices of that kind stop appearing here; the ones already here stay.',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      none: {
        title: 'Nothing here yet',
        body: 'Alerts, briefs and reports you receive appear here, newest first. If you have an account menu, you can choose which ones in Notification settings.',
      },
    },
  },
  'account.settings.notifications': {
    // source: apps/web/src/app/(app)/settings/notifications/page.tsx, contact-form.tsx; packages/tools/src/preferences.ts:myNotificationSettings
    description: 'Choose which notices reach you in the app and by email, and set a time zone and quiet hours for email.',
    tips: {
      // source: apps/web/src/app/(app)/settings/notifications/pref-switch.tsx (saves at once, no Save button); packages/tools/src/preferences.ts:myNotificationSettings (default on); packages/engine/src/delivery/contacts.ts:recipientsFor (channels left on)
      channels: {
        title: 'In-app and email',
        body: 'Each row has two switches. In-app puts the notice in your Inbox; Email sends it to the address on this list. Both start on. A switch saves the moment you change it, and only affects new notices. With both on, you get the same notice both ways.',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(app)/settings/notifications/contact-form.tsx (hint text, Save), actions.ts:updateContactAction (both times or none); packages/engine/src/delivery/time.ts:quietUntil (wraps midnight); delivery/outbox.ts:notify (email notBefore = end of the window; in-app not delayed)
      quiet: {
        title: 'Quiet hours',
        body: 'Fill in both a start and an end to turn quiet hours on; clear one of them and save to turn them off. A window can run overnight, such as 21:00 to 07:00. Emails that would arrive inside it are held and sent when it ends. In-app notices still arrive at once.',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/engine/src/delivery/contacts.ts:recipientsFor (an agency contact with no time zone falls back to DEFAULT_TIMEZONE); packages/engine/src/briefs/schedule.ts:DEFAULT_TIMEZONE (America/Chicago)
      timezoneAgency: {
        title: 'Time zone',
        body: 'The clock your quiet hours follow. Left on Business time zone, they follow US Central time (America/Chicago). Pick a zone if you want your own local time.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/engine/src/delivery/contacts.ts:recipientsFor (a client contact with no time zone falls back to the client's time zone)
      timezoneClient: {
        title: 'Time zone',
        body: 'The clock your quiet hours follow. Left on Business time zone, they follow the time zone saved for your business. Pick a zone if you want your own local time.',
        audience: 'client',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/server/inbox.ts:NOTIFICATION_KIND_LABELS; packages/db/src/schema/delivery.ts:AGENCY_KINDS; packages/engine/src/delivery/contacts.ts:recipientsFor (agency contacts: a client scope limits which clients' notices arrive); the briefs, alerts and rank notices cited under account.inbox.labelsAgency
      agencyKinds: {
        title: 'Agency notices',
        body: 'Client alerts (agency): an alert to review or one already sent. Brief ready for review, Brief failed and Brief overdue: where a client\'s weekly brief stands. Rank scan skipped: a map ranking scan went over the client\'s monthly credit limit. Competitor suggestions ready, Client updated their setup and Setup waiting on you: where a client\'s setup stands. An account manager who covers only some clients gets these only for those clients. Slack and Teams messages are set up under Agency settings, not here.',
        audience: 'agency',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/preferences.ts:kindsFor (CLIENT_KINDS minus client_invite and competitor_review, which are not switchable)
      clientKinds: {
        title: 'Notices about your business',
        body: 'Instant alerts: one change that matters, sent when it is ready. Alert digest: alerts held back for an evening roundup. Weekly brief: your brief for the week. Quarterly report: the report written after each quarter. A few messages, such as an invitation to join, are needed for your account and have no switch.',
        audience: 'client',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/preferences.ts:myNotificationSettings (one entry per active contact the person has: the agency list and each client list); page.tsx (card title = client name, else agency name)
      several: {
        title: 'More than one list',
        body: 'There is one card for each place you receive notices from, titled with its name. Switches, time zone and quiet hours are saved separately for each card.',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      none: {
        title: 'No notification settings yet',
        body: 'A list of switches appears here for each agency or business you are set up to receive notices from.',
      },
    },
  },
  'account.onboarding': {
    // source: apps/web/src/app/(onboarding)/onboarding/flow.ts:STEPS (profile, team, branding, done), steps/*.tsx; page.tsx (redirect to /agency once completed or dismissed)
    description: 'Four short steps to get your agency ready: about your agency, your team, your brand, and a final check before you add your first client.',
    tips: {
      // source: apps/web/src/app/(onboarding)/onboarding/steps/team.tsx, brand.tsx (Skip for now); actions.ts:skipStepAction; apps/web/src/components/agency/onboarding-checklist.tsx (a skipped step stays on the Getting started card; Dismiss hides it)
      skip: {
        title: 'Skipping a step',
        body: 'You can skip the team and brand steps with Skip for now. Back returns to the previous step. A step you skip stays on the Getting started card on your Portfolio, where it links to its Settings page, until you finish it or dismiss the card.',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(onboarding)/onboarding/steps/about.tsx (required: agency name, contact name, phone, email; address optional; Use this for billing too)
      about: {
        title: 'About this step',
        body: 'We need your agency name, a contact name, a phone number and an email address. The address is optional. The preview shows how you appear at the bottom of every client brief.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(onboarding)/onboarding/steps/team.tsx (roles Agency admin and Account manager); actions.ts:inviteTeamAction
      team: {
        title: 'About this step',
        body: 'Add an email and a role for each person: Agency admin or Account manager. Each person gets an invitation by email. You can skip this step and invite people later from Team.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(onboarding)/onboarding/steps/brand.tsx (logo, brand colour, display name; live preview)
      brand: {
        title: 'About this step',
        body: 'Set the logo, colour and name your clients see, with a live preview. All three are optional, and you can change them later in Agency settings.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/app/(onboarding)/onboarding/steps/done.tsx (summary rows with Edit; Add your first client, Go to dashboard); actions.ts:finishAction
      done: {
        title: 'About this step',
        body: 'Check your details, and use Edit to change any of them. Add your first client takes you to the client setup. Go to dashboard leaves that for later; the Getting started card on your Portfolio reminds you.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
  },
} as const satisfies Record<`account.${string}`, PageCopy>;
