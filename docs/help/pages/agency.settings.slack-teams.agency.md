---
help_key: page:agency.settings.slack-teams
audience: agency
title: Slack & Teams
---
## What this page tells you

Where your agency's own notices are posted to a Slack or Teams channel, so your team sees them without opening the app. Only agency admins can open this page.

The **Webhooks** table lists each channel connection with its kind (Slack or Teams), the host of its address, the notices it receives, and an **Active** switch. The web address itself is never shown again after you save it.

A notice is an agency message such as a brief ready for review. The kinds you can send are: client alerts (agency), brief ready for review, brief failed, brief overdue, competitor suggestions ready, client updated their setup, setup waiting on you, quarterly report and rank scan skipped.

## How to use it

1. **Get a webhook URL.** A webhook URL is a private web address that lets notices be posted to one channel.
   - *Slack:* create an incoming webhook for the channel and copy its URL. It starts with `https://hooks.slack.com/`.
   - *Teams:* create a Workflows webhook, or an incoming webhook, for the channel and copy its URL. The address ends in `webhook.office.com`, `logic.azure.com` or `environment.api.powerplatform.com`.
2. **Add it here.** Choose the **Kind**, paste the URL into **Webhook URL** and choose **Add webhook**. Only https addresses on those hosts are accepted.
3. **Choose the notices.** Tick the ones this channel should get, or tick none to send it all agency notices.
4. **Turn one off** with its **Active** switch. It stops posting without deleting the webhook, and you can switch it back on.

## Common questions

### Why was my URL refused?

It must be an https address on a Slack or Teams host, with no sign-in details or port number in it. The message names the host it did not accept. Check that the Kind matches the URL: a Slack URL under Teams is refused.

### Can I change or remove a webhook?

You can switch it off. To use a different URL, add a new webhook and switch the old one off. The old URL cannot be viewed again.

### Who sees these posts?

Everyone in the Slack or Teams channel. The URL works like a password, so share it only with people you trust.

### Do clients get these messages?

No. These are your agency's notices only; clients get their own alerts and briefs separately.
