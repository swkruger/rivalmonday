---
help_key: page:agency.settings.ai
audience: agency
title: AI connections
---
## What this page tells you

The ways your team can use an AI assistant such as Claude or ChatGPT with the competitor data of every client you can access. When a question could be about more than one client, the assistant asks which client you mean.

- **Connector URL** is the address you paste into the assistant. The page lists the steps for Claude, ChatGPT and Claude Code. The Claude Code command uses a server name made from your agency name.
- **Access tokens** are for tools that cannot sign in, such as Claude Code or a script. Each shows its access level, when it was created and when it was last used.
- **Connected apps** are assistants that were connected by signing in. Each shows its access level and the workspace it can reach.

As an admin you see everyone's tokens and apps in the agency. An account manager sees their own.

## How to use it

1. **Connect an assistant that can sign in.** In Claude or ChatGPT, add a custom connector, paste the connector URL, sign in and choose this workspace. The app then appears under Connected apps.
2. **Connect a tool that cannot sign in.** Create a token: give it a name, choose an access level and copy it straight away, because it is shown only once. Then run the command shown for Claude Code, with your token in place of `YOUR_TOKEN`.
3. **Choose the lowest level that does the job.**
   - *Read only* lets an assistant look things up.
   - *Read and feedback* also lets it record feedback, such as changing a recommendation's status.
   - *Read, feedback and manage* also lets it make changes that need manage permission, such as setting a client's alert levels.
4. **Revoke or disconnect** anything you no longer use or do not recognise. It stops working straight away. The buttons are hidden in a read-only support session.

## Common questions

### Can an assistant do more than I can?

No. A token or connected app never gets more than your own role allows, whatever level it was created with.

### I lost a token. Can I see it again?

No. A token is shown once. Revoke it and create a new one.

### Where do my clients connect an assistant?

Client owners create their own tokens on their client's AI connection page, with Read only or Read and feedback. You see those under the client's settings, but you do not create tokens there.

### Is there a limit on assistant calls?

Yes. Requests are rate limited per minute and per day. A limit that is hit shows as an error in the assistant, not on this page.
