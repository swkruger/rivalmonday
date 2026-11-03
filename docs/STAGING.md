# Staging runbook

Staging is a private, working copy of Rival Monday that you can click through and test before anything is public. Production doesn't exist yet, so this runbook sets everything up from scratch. Production comes later: § 9 and [DEPLOY.md](DEPLOY.md).

Menu names below were correct when written. If a website has moved something, look for the nearest match.

## What you're building

| Part | What it does | Where it runs |
|---|---|---|
| App | Dashboards, sign-in, API and MCP | Vercel, at **https://staging.rivalmonday.app** |
| Marketing site | The public website, hidden from search engines | Vercel, at **https://staging.rivalmonday.com** |
| Worker | Background jobs: briefs, data collection, queued email | **Your computer** (Railway isn't accepting sign-ups) |
| Database | A copy of `cs_dev` | Neon, branch `staging` of your dev project |
| Evidence files | Screenshots and PDFs | Cloudflare R2, bucket `rivalmonday-staging` |
| Email | Sign-in links and notifications | Postmark, server "Rival Monday staging" |
| Payments | Test payments only, no real money | Stripe **test mode** |
| Error reports | Crashes and errors | Sentry |

**Your local dev setup doesn't change.** You keep using `cs_dev`. Nothing on staging writes to it.

### How staging behaves

- **Website updates are automatic.** After setup, every push to `main` that passes its tests updates the app and the site.
- **The worker updates when you restart it.** It runs on your computer, so GitHub can't update it (§ 4).
- **Data only changes when you ask.** The `staging-refresh` action replaces all staging data with a fresh copy of `cs_dev` (§ 5). Anything you did on staging since the last refresh is lost.
- **Vendors cost nothing.** Calls to DataForSEO, Apify, ScrapeCreators and Stadia get fake sample answers ("fixtures"). The history copied from `cs_dev` is real, but new collected data is sample data.
- **No competitor websites are crawled.** `WEB_MONITORING_ENABLED` stays unset.
- **AI is real and costs money,** limited by the monthly cap you set in step 6.
- **Email is really sent,** so check who could receive it in step 1. Dev's unsent emails, webhooks and queued jobs are switched off on every refresh.

### Words used below

| Word | Meaning |
|---|---|
| **`.env.staging`** | A private file in your main repo folder that holds every staging value. Git ignores it, so it never gets committed. Never share it. |
| **Secret** | A password or key. GitHub and Vercel store these for you. |
| **Role** | A database login. Staging uses five: the owner plus `app_user`, `app_service`, `cs_worker` and `cs_web`. |
| **Direct / pooled host** | Two addresses for the same database. The pooled one has `-pooler` in its name and shares connections. Use whichever a step names. |
| **Refresh** | Replacing all staging data with a new copy of `cs_dev`. |

## Before you start

1. **Accounts you need:** Neon (you have this), Cloudflare, Postmark, OpenRouter, Sentry, Stripe (test mode), Cloudflare Turnstile, Namecheap (you have this), GitHub, and **Vercel on the Pro plan**, because the free plan has no custom environments.
2. **Tests must pass on `main`.** GitHub won't deploy staging while the `ci` action is failing. Check at *GitHub → Actions → ci*: the latest `main` run must be green. Fix any failures first.
3. **Your local commits must be pushed.** The refresh action and the worker both use what's on GitHub, so run `git push origin main`.

**To make a new random secret,** run this in a terminal and copy the output:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 1. One-time setup

Do these in order. Save each new value in `.env.staging` as soon as you have it.

### Step 1: Check who staging could email

The copy includes every contact and user in `cs_dev`, and staging really sends email.

1. Open the [Neon console](https://console.neon.tech), project `frosty-leaf-56905668`, then **SQL Editor**.
2. Choose branch `production` and database `cs_dev`. (This Neon branch is named `production` but it holds your dev data. Nothing here is your real production.)
3. Run:
   ```sql
   SELECT split_part(email, '@', 2) AS domain, count(*) FROM contact GROUP BY 1
   UNION ALL SELECT split_part(email, '@', 2), count(*) FROM auth."user" GROUP BY 1 ORDER BY 1;
   ```
4. Every domain listed should be yours or a test domain such as `example.com`. Change or remove any real person's address in `cs_dev` before continuing.

### Step 2: Create the Neon staging branch

1. In the same project, go to **Branches → New branch**.
2. Name it `staging`, set the parent to `production`, and choose **Current point in time**.
3. Open the new branch and edit its compute: minimum **0.25 CU**, maximum **1 CU**, scale to zero after **5 minutes**. This keeps the cost down.
4. Copy the branch ID (it starts with `br-`) into `NEON_STAGING_BRANCH_ID`.
5. Click **Connect**, with branch `staging` and database `cs_dev`. Note the host name, then turn on **Connection pooling** and note the pooled host. They go in `STAGING_DB_DIRECT_HOST` and `STAGING_DB_POOLED_HOST`.
6. Make four new passwords (the command above) and save them as `STAGING_PW_APP_USER`, `STAGING_PW_APP_SERVICE`, `STAGING_PW_CS_WORKER` and `STAGING_PW_CS_WEB`.
7. Build the database addresses in `.env.staging`. Each has this form:
   ```
   postgresql://ROLE:PASSWORD@HOST/cs_dev?sslmode=require
   ```

   | Key in `.env.staging` | Role | Password | Host |
   |---|---|---|---|
   | `MIGRATION_DATABASE_URL` | `rivalmonday_test_owner` | the owner's existing dev password | direct |
   | `WORKER_DATABASE_URL` | `cs_worker` | `STAGING_PW_CS_WORKER` | direct |
   | `WEB_DATABASE_URL` | `cs_web` | `STAGING_PW_CS_WEB` | direct |
   | `APP_DATABASE_URL` | `app_user` | `STAGING_PW_APP_USER` | direct |
   | `SERVICE_DATABASE_URL` | `app_service` | `STAGING_PW_APP_SERVICE` | direct |
   | `SERVICE_DATABASE_POOLED_URL` | `app_service` | `STAGING_PW_APP_SERVICE` | **pooled** |

**The four new passwords don't work yet.** They take effect at the first refresh (step 15). After that, never change them in the Neon console, because each refresh sets them from GitHub.

### Step 3: Create a Neon API key

GitHub uses this to reset the staging branch.

1. In Neon, go to your **Account or Organization settings → API keys → Create**.
2. Limit it to this project if Neon offers that.
3. Save it as `NEON_API_KEY`.

### Step 4: Set up evidence storage (Cloudflare R2)

1. In the [Cloudflare dashboard](https://dash.cloudflare.com), open **R2**.
2. Copy your **Account ID** into `R2_ACCOUNT_ID`.
3. Click **Create bucket** and name it exactly `rivalmonday-staging`. The tools refuse any bucket whose name doesn't end in `-staging`.
4. Go to **Manage R2 API Tokens → Create API token**. Choose **Object Read & Write**, limited to this one bucket.
5. Copy the two values shown into `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Cloudflare only shows the secret once.

### Step 5: Set up email (Postmark)

**Create the server**

1. In [Postmark](https://account.postmarkapp.com/servers), click **Create Server**, name it `Rival Monday staging`, and choose **Live**. A test server never delivers, so sign-in emails wouldn't arrive.
2. Open the server's **API Tokens** tab and copy the token into `POSTMARK_SERVER_TOKEN`.

**Verify the sending domain**

3. Go to **Sender Signatures → Add Domain** and enter `mail.rivalmonday.app`.
4. Postmark shows a DKIM record and a Return-Path record. Add both in Namecheap under **Domain List → rivalmonday.app → Manage → Advanced DNS → Add New Record**. Namecheap adds `rivalmonday.app` by itself, so remove it from the host:

   | Type | Host in Namecheap | Value |
   |---|---|---|
   | TXT | what Postmark shows, ending in `._domainkey.mail` | the DKIM value from Postmark |
   | CNAME | `pm-bounces.mail` | `pm.mtasv.net` |

5. Go back to Postmark and click **Verify** on each. DNS can take a few minutes, sometimes longer.

**Add the webhook.** This tells the app when an email bounces.

6. Open the server, then **Default Transactional Stream → Webhooks → Add webhook**.
7. Enter this URL, using the value of **`POSTMARK_WEBHOOK_SECRET`**, not the server token:
   ```
   https://postmark:YOUR_POSTMARK_WEBHOOK_SECRET@staging.rivalmonday.app/api/postmark/webhook
   ```
8. Tick only **Bounce** and **Spam Complaint**, then save. **Send test** will fail until staging is live, and that's expected. You'll test it in § 6.

**If your Postmark account isn't approved yet,** it can only deliver to addresses on your verified domains, and it has a monthly limit. Ask Postmark to approve the account, or you may not be able to receive sign-in emails at your normal address.

### Step 6: Create an AI key with a spending cap (OpenRouter)

1. In [OpenRouter](https://openrouter.ai/settings/keys), click **Create Key** and name it `rival-monday-staging`.
2. Set a **credit limit**. $10 a month is a sensible start.
3. Save it as `OPENROUTER_API_KEY`.

### Step 7: Set up error reports (Sentry)

1. In [Sentry](https://sentry.io), create an organization if you don't have one. **Choose US data storage.** With EU storage, the site blocks its own error reports until `apps/site/src/lib/headers.ts` is changed.
2. Create three projects:

   | Project name | Platform | Its DSN goes in |
   |---|---|---|
   | `rivalmonday-web` | Next.js | `WEB_SENTRY_DSN` |
   | `rivalmonday-worker` | Node.js | `SENTRY_DSN` |
   | `rivalmonday-site` | Next.js | `SITE_SENTRY_DSN` |

   To find a DSN, open the project's **Settings → Client Keys (DSN)**.
3. Save the organization's slug as `SENTRY_ORG`, then `SENTRY_PROJECT_WEB=rivalmonday-web` and `SENTRY_PROJECT_SITE=rivalmonday-site`.
4. Save the address of the web project's Issues page as `SENTRY_ISSUES_URL`.
5. Go to **Settings → Auth Tokens → Create New Token** at organization level, with the release and source map permissions (`org:ci`). Save it as `SENTRY_AUTH_TOKEN`.

The worker won't start without `SENTRY_DSN`.

### Step 8: Add the payment webhooks (Stripe)

1. In [Stripe](https://dashboard.stripe.com), turn on **Test mode**. Staging uses the same test key as dev because the copied data contains its test IDs. `STRIPE_SECRET_KEY` must start with `sk_test_`.
2. Go to **Developers → Webhooks → Add destination** and create these two:

   | | First endpoint | Second endpoint |
   |---|---|---|
   | **Listen to** | Your account | Connected accounts |
   | **URL** | `https://staging.rivalmonday.app/api/stripe/webhook` | `https://staging.rivalmonday.app/api/stripe/connect-webhook` |
   | **Events** | `checkout.session.completed`<br>`customer.subscription.updated`<br>`customer.subscription.deleted`<br>`invoice.paid`<br>`invoice.payment_failed` | `account.updated`<br>`account.application.deauthorized`<br>`checkout.session.completed`<br>`invoice.paid`<br>`invoice.payment_failed`<br>`customer.subscription.deleted`<br>`charge.refunded`<br>`charge.dispute.created` |
   | **Signing secret goes in** | `STRIPE_WEBHOOK_SECRET` | `STRIPE_CONNECT_WEBHOOK_SECRET` |

To find a signing secret, open the endpoint and click **Reveal**.

### Step 9: Allow the staging addresses in Turnstile

Turnstile is the spam check on forms.

1. In the Cloudflare dashboard, open **Turnstile** and select the widget whose keys are in `.env.staging`.
2. Under **Hostnames**, add `staging.rivalmonday.app` and `staging.rivalmonday.com`, then save.

### Step 10: Optional: Google sign-in

Skip this unless you want to test it. In [Google Cloud Console](https://console.cloud.google.com) under **APIs & Services → Credentials**, open or create an OAuth client and add this redirect URI:
```
https://staging.rivalmonday.app/api/auth/callback/google
```
Save its values as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Step 11: Create the app project (Vercel)

These settings come first, because the same project will also host production later.

1. In [Vercel](https://vercel.com), click **Add New → Project** and import this GitHub repository.
2. Set **Root Directory** to `apps/web`, then click **Deploy**. This first build may fail because nothing is configured yet. That's fine, so carry on.
3. In the project's **Settings**:
   - **Git:** click **Disconnect**. Only GitHub Actions should deploy.
   - **General:** set the Node.js version to **24.x**.
   - **Functions:** set the region to **Washington, D.C. (`iad1`)** and turn **Fluid compute** on.
   - **Deployment Protection:** turn **Vercel Authentication** off. Otherwise webhooks can't reach staging, and the deploy's final check fails with a 401.
4. Go to **Settings → Environments → Create Environment** and name it exactly `staging`. Don't link it to a branch.
5. Go to **Settings → Domains → Add**, enter `staging.rivalmonday.app`, and assign it to the `staging` environment. Note any DNS values Vercel shows for step 13.
6. Go to **Settings → Environment Variables**. Add these with **only the `staging` environment** selected. Values come from `.env.staging`:

   | Name in Vercel | Value |
   |---|---|
   | `DATABASE_URL` | **`WEB_DATABASE_URL`** |
   | `SENTRY_DSN` | **`WEB_SENTRY_DSN`** |
   | `NEXT_PUBLIC_SENTRY_DSN` | **`WEB_SENTRY_DSN`** |
   | Same name in both | `APP_DATABASE_URL`, `SERVICE_DATABASE_URL`, `APP_URL`, `LINK_SIGNING_SECRET`, `BETTER_AUTH_SECRET`, `EMAIL_FROM`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_WEBHOOK_SECRET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `OPENROUTER_API_KEY`, `REVIEWER_HASH_SALT`, `SENTRY_ENVIRONMENT`, `SENTRY_ISSUES_URL`, `PLATFORM_ADMIN_EMAILS`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_TAX_ENABLED`, `SITE_ORIGIN`, `SUPPORT_REPLY_TO` |
   | Optional | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

   Don't add `WORKER_DATABASE_URL`, `SERVICE_DATABASE_POOLED_URL`, `VENDOR_FAKE_MODE`, or anything in the GitHub section of the file.

   `EMAIL_FROM` is a bare address, for example `support@mail.rivalmonday.app`, with no name in front. The app adds the name itself, and both the app and the worker refuse to start with a name in it.
7. Get the IDs:
   - **Account Settings → Tokens → Create:** give it the whole team as its scope, not specific projects, and save it as `VERCEL_TOKEN`.
   - **Team Settings → General → Team ID:** save as `VERCEL_ORG_ID`.
   - **Project Settings → General → Project ID:** save as `VERCEL_PROJECT_ID`.

**Never set these on staging:** `WEB_MONITORING_ENABLED`, `ASK_FAKE_AI`, `SETUP_FAKE_LOOKUP`, `BILLING_FAKE_GATEWAY`, `PROFILE_TOOLS`. Leave `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` unset too. The setup wizard's business lookup then says it's unavailable, which is expected. Add them only to test that lookup, because each one is a small real charge.

### Step 12: Create the site project (Vercel)

1. Click **Add New → Project** and import the same repository again.
2. Set **Root Directory** to `apps/site`, then click **Deploy**. Again, a failed first build is fine.
3. Apply the same **Git**, **Node.js**, **region** and **Deployment Protection** settings as in step 11. Fluid compute isn't needed here. Also turn the **Vercel Toolbar** off, because the site's security rules block it.
4. Create an environment named exactly `staging`.
5. Add the domain `staging.rivalmonday.com` and assign it to `staging`.
6. Add these variables, for the `staging` environment only:

   | Name in Vercel | Value |
   |---|---|
   | `NEXT_PUBLIC_APP_URL` | `https://staging.rivalmonday.app` |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | same as `TURNSTILE_SITE_KEY` |
   | `NEXT_PUBLIC_SENTRY_DSN` | **`SITE_SENTRY_DSN`** |
   | `NEXT_PUBLIC_CLIENT_PRICE_USD` | the client price to show, if you want it shown |
   | `NEXT_PUBLIC_COMPARE_PAGES` | optional: rival names separated by commas, to review compare pages |

7. Save this project's ID as `VERCEL_SITE_PROJECT_ID`.

Staging builds always tell search engines to stay away, and each deploy checks this.

### Step 13: Point the addresses at Vercel (Namecheap)

In Namecheap, open **Domain List → Manage → Advanced DNS** for each domain and add:

| Domain | Type | Host | Value |
|---|---|---|---|
| `rivalmonday.app` | CNAME | `staging` | the value Vercel showed, usually `cname.vercel-dns.com` |
| `rivalmonday.com` | CNAME | `staging` | the value Vercel showed, usually `cname.vercel-dns.com` |

Add any TXT record Vercel asks for as well. The domains page in Vercel shows **Valid Configuration** when it has worked.

### Step 14: Set up GitHub

1. In the GitHub repository, go to **Settings → Environments → New environment**, name it `staging`, and don't add required reviewers.
2. Under **Environment secrets**, add these with the same names as in `.env.staging`:
   - `MIGRATION_DATABASE_URL`, `NEON_API_KEY`
   - `STAGING_PW_APP_USER`, `STAGING_PW_APP_SERVICE`, `STAGING_PW_CS_WORKER`, `STAGING_PW_CS_WEB`
   - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_SITE_PROJECT_ID`
   - `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_SITE`
3. Under **Environment variables** (the same page), add `NEON_PROJECT_ID` and `NEON_STAGING_BRANCH_ID`.

Don't turn on `STAGING_DEPLOY_ENABLED` yet.

### Step 15: Run the first refresh

This activates the new database passwords, cleans the copied data and brings its structure up to date.

1. Go to **Actions → staging-refresh → Run workflow**, with the branch set to `main`.
2. Type `refresh staging` in the box and tick **first_run**. Only tick this the first time.
3. Run it and wait for the green tick.

If it fails, see § 7.

### Step 16: Copy the evidence files

Old briefs need their screenshots and PDFs, which currently sit only on your computer. In PowerShell, from your main repo folder, using the values from `.env.staging`:
```powershell
$env:R2_ACCOUNT_ID='...'; $env:R2_ACCESS_KEY_ID='...'; $env:R2_SECRET_ACCESS_KEY='...'; $env:R2_BUCKET='rivalmonday-staging'
pnpm staging:evidence
Remove-Item Env:R2_*
```
It reports how many files were uploaded and how many were already there. It never overwrites a file.

### Step 17: Start the worker

From your main repo folder:
```powershell
pnpm staging:up
```
The first run takes a few minutes. Leave the window open. § 4 has the details.

### Step 18: Turn on automatic deploys

1. Go to **Settings → Secrets and variables → Actions → Variables → Repository variables**. This one must be a *repository* variable, not on the `staging` environment.
2. Add `STAGING_DEPLOY_ENABLED` with the value `true`.
3. Leave `DEPLOY_ENABLED` unset. That's the production switch, and production stays off.
4. Go to **Actions → ci**, open the latest `main` run and click **Re-run all jobs**, or push a new commit.
5. Wait for `deploy-staging` and `deploy-staging-site` to go green. The `deploy` and `deploy-site` jobs show as skipped, which is correct.

### Step 19: Check it all works

Go through § 6.

## 2. What goes where

`.env.staging` is in your main repo folder. Most values get pasted somewhere once. The worker reads its own values directly from the file.

| Values | Goes to |
|---|---|
| GitHub section | GitHub environment `staging` (step 14) |
| App values | Vercel app project, `staging` environment (step 11) |
| Site values | Vercel site project, `staging` environment (step 12) |
| Worker values | Nowhere: `pnpm staging:up` reads the file |

**Values shared with dev on purpose:**
- `REVIEWER_HASH_SALT` must match dev's, because the copied reviews were hashed with it. Never change it.
- `STRIPE_SECRET_KEY`, the same test key.
- The Turnstile keys, the same widget.

Everything else is staging's own. If you add a new environment variable to the code later, it also needs adding to `globalPassThroughEnv` in `turbo.json`.

## 3. Evidence

Each refresh brings new database rows that may point to new evidence files. After a refresh, run the commands in step 16 again. Only new files upload.

## 4. Local worker

The worker does background jobs, so staging needs it running whenever you're testing briefs, data collection or queued email.

**To start it, or to pick up new code:**
```powershell
pnpm staging:up
```
This does four things:
1. Fetches the latest `main`.
2. Creates or updates a separate folder, `../CompetitorSpy-wt/staging-worker`.
3. Installs dependencies.
4. Starts the worker.

**To stop it:** press Ctrl+C in that window and wait a moment for it to finish cleanly.

**Why a separate folder:** it has no `.env` file and none of your uncommitted changes, so staging runs exactly what's on `main` with staging's settings. It won't start otherwise.

**Your dev worker can run at the same time.** Dev uses port 8080 and `cs_dev`. Staging uses port 8081 and the staging database. Never run two staging workers.

**When the worker is off, or your computer is asleep:**
- The site, sign-in and webhooks still work, because they run on Vercel.
- Briefs, data collection and queued email wait until the worker runs again.
- `/platform/health` shows the worker as down.

**After each merge to `main`,** stop the worker and run `pnpm staging:up` again. GitHub will already have updated the database structure, so an old worker may fail.

**Stop it when you aren't testing.** The Neon database can't go to sleep while the worker is connected, which costs more.

## 5. Everyday use

### Sign in

Go to `https://staging.rivalmonday.app/sign-in` and request a link with an email address that exists in `cs_dev`. Addresses in `PLATFORM_ADMIN_EMAILS` also get platform admin access.

### Deploy

Push to `main`. GitHub then runs, in order:
1. The tests: `test`, `image` and `site`.
2. `deploy-staging`, which updates the database and the app, then checks the app responds.
3. `deploy-staging-site`, which updates the site and checks it's hidden from search engines.

If a step fails, the later ones don't run. Deploys and refreshes also wait for each other. If several pushes queue up, GitHub replaces the older waiting deploy with the newest.

Then restart the worker (§ 4).

### Refresh

**This erases everything done on staging since the last refresh,** including sign-ups, settings and test agencies. Merge any branch that has changed the structure of `cs_dev` first.

1. Stop the worker (Ctrl+C).
2. Go to **Actions → staging-refresh → Run workflow**, on `main`. Type `refresh staging`, and leave **first_run** unticked.
3. Wait for the green tick.
4. Copy new evidence files (§ 3).
5. Start the worker: `pnpm staging:up`.

The action does the following, stopping at the first failure:
1. Checks it's really working on the `staging` branch.
2. Refuses if the worker is still connected. Nothing has changed at this point.
3. Replaces the data with a fresh copy of `cs_dev`.
4. Sets the staging database passwords again.
5. Cleans the copy so it can't act on dev's behalf: signs everyone out, cancels MCP tokens, turns off webhooks, marks unsent email as skipped and removes queued jobs (`infra/db/staging/after-refresh.sql`).
6. Refuses if `cs_dev` has database changes that `main` doesn't have.
7. Applies any database changes from `main`.
8. Checks the app responds.

### Undo a bad deploy

- **App or site:** in Vercel, open the project's **Deployments**, filter by `staging`, pick the last good one and choose **Instant Rollback**.
- **Worker:** fix the problem on `main`, then run `pnpm staging:up`. It only runs the latest `main`.
- **Database:** changes only go forward. Fix them with a new migration, or run a refresh.

### Rough monthly cost

| Item | Cost |
|---|---|
| Vercel Pro | your plan's price |
| Neon staging | a few dollars, more if the worker runs all day |
| OpenRouter | up to your limit |
| R2, Postmark, Sentry | about $0 at this volume on their entry plans |
| Vendors | $0, because they're faked |

Pages are a little slower than production will be, because this database is in `us-east-2`. Don't use staging speeds to judge performance.

## 6. Check it works

Run through this after the first deploy, and again whenever you change the setup.

**Addresses**
- [ ] `https://staging.rivalmonday.app/health` loads without signing in.
- [ ] `https://staging.rivalmonday.com` loads.
- [ ] `https://staging.rivalmonday.com/robots.txt` shows `Disallow: /`.

**Sign-in and email**
- [ ] Requesting a sign-in link delivers an email from the staging sender, and the link works.
- [ ] Postmark's **Send test** on the webhook now returns 200.

**Evidence**
- [ ] A brief's PDF and an evidence screenshot both open.

**Worker**
- [ ] With the worker running, `curl.exe http://localhost:8081/healthz` shows `queueGrants: ok`.
- [ ] `/platform/health` is green after about an hour.

**Other services**
- [ ] A test webhook from each Stripe endpoint succeeds.
- [ ] Sentry shows staging events from the web and worker projects, under environment `staging`.
- [ ] The site's waitlist form submits successfully.

**Safety.** In the Neon SQL Editor, on branch `staging`, database `cs_dev`:
- [ ] `SELECT count(*) FROM agency_webhook WHERE active;` returns 0, unless you added one on staging yourself.

## 7. Troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| `deploy-staging` skipped, with `test` or `site` red | The tests failed, so nothing deploys | Fix the failing tests on `main` |
| `deploy-staging` skipped, with tests green | Staging is switched off | Set `STAGING_DEPLOY_ENABLED=true` as a repository variable (step 18) |
| Fails at "Check the target" | `MIGRATION_DATABASE_URL` isn't the staging branch's direct owner address, or the `NEON_*` values are wrong | Compare them with step 2 and step 14 |
| `Project not found` at "Vercel pull" | The token can't see that project, even if the ID is right. A token limited to one project does this | Create a token for the whole team (step 7 of step 11), then update `.env.staging` and GitHub |
| Smoke check fails with **500** on `/sign-in` | A page fails on Vercel though `/health` works | Read the error in the project's **Logs** in Vercel |
| Smoke check fails with **401** | Vercel is asking visitors to log in | Turn Vercel Authentication off (step 11) |
| Postmark test: **HTTP 0** or a socket error | The address doesn't exist yet | Finish steps 11 and 13 |
| Postmark test: **401** | The webhook has the wrong secret | Use `POSTMARK_WEBHOOK_SECRET`, not the server token, and make sure it matches Vercel |
| Postmark test: **404** | The secret isn't on the deployed app | Add it in Vercel, then redeploy |
| Sign-in email doesn't arrive | Usually Postmark's pending-account limit or an unverified domain | Look at the server's **Activity** page in Postmark and see step 5 |
| Refresh says the worker is running | The worker is still connected | Stop it. If you already did, wait a minute and run it again |
| `permission denied to alter role` | The owner can't change a role's password | On `cs_dev`, run `GRANT <role> TO rivalmonday_test_owner WITH ADMIN OPTION;` |
| Refresh says `cs_dev` has migrations `main` lacks | A branch changed `cs_dev` but hasn't been merged | Keep the worker stopped, merge that branch, then refresh again |
| Neon refuses the reset | The branch has child branches, or its parent was restored in the last 24 hours | Delete the children, or wait |
| `staging:up` says `origin/main has no staging worker yet` | Your commits aren't on GitHub | Run `git push origin main` |
| Worker says `Fill in ...` | Those values are empty in `.env.staging` | Fill them in. `SENTRY_DSN` is required too |
| Worker says it's `not on the latest main` or has uncommitted changes | The worker folder has drifted | Run `pnpm staging:up`. If it still complains, look in `../CompetitorSpy-wt/staging-worker` for local edits and remove them |
| Evidence gives a 404 on an old brief | The file was never copied | Run step 16. If the file isn't on your computer, it's missing in dev too |

## 8. Removing staging

1. Delete the `STAGING_DEPLOY_ENABLED` repository variable.
2. Stop the worker and run `git worktree remove ../CompetitorSpy-wt/staging-worker`.
3. Delete:
   - the Neon `staging` branch and API key
   - the `staging` environments and domains in Vercel (or the whole projects, if nothing else uses them)
   - the two `staging` CNAMEs in Namecheap
   - the R2 bucket and token
   - the Postmark server
   - the two Stripe test webhooks
   - the OpenRouter key
   - the Turnstile hostnames
   - the GitHub `staging` environment
4. Delete `.env.staging`.

## 9. When you set up production later

Nothing here is needed yet. Staging keeps working on its own, because `DEPLOY_ENABLED` is unset. When you get there, follow [DEPLOY.md](DEPLOY.md), and keep these in mind:

- **Reuse the two Vercel projects and three Sentry projects.** Add the production domains and variables to the same projects.
- **Everything else is separate:** a new Neon project, a new R2 bucket, a new Postmark server, a new OpenRouter key, Stripe live mode, new secrets, and a GitHub `production` environment. Never reuse a staging secret in production.
- **Choose a worker host.** Production's deploy step expects Railway, which isn't accepting sign-ups, so either get an account or change that step to another host.
- **Production waits for staging.** Once `DEPLOY_ENABLED=true`, a push deploys staging first and production only if staging succeeds. Add yourself as a required reviewer on the GitHub `production` environment, so you can look at staging before production goes out.
- **Limit Sentry alerts** to `environment:production`, so staging errors don't page you.
