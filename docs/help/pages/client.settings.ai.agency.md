---
help_key: page:client.settings.ai
audience: agency
title: AI connection
---
## What this page tells you

The AI connections for {{client}}: the connector URL, the client-bound access tokens and the apps connected to this client. Answers come with the same evidence links as the dashboard.

- **Connector URL** is the address people paste into Claude, ChatGPT or another AI assistant. The Claude Code command on the card uses a server name made from your agency's display name.
- **Access tokens** lists the tokens bound to this client, with their permission level, creation date, last use and (for admins) owner.
- **Connected apps** lists apps connected by signing in, with their permission level and workspace.

Agency roles do not create tokens here. Agency-wide tokens live under Agency settings › AI connections, where a third level, *Read, feedback and manage*, is available. Client owners create their own client-bound tokens on this page.

## How to use it

1. **Turn the page on for the client** with the *AI connection* feature on the Business profile tab. Client roles see this page only when it is on; you always see it.
2. **Review the lists.** An admin sees everyone's tokens and apps in the agency, with the owner shown; account managers see their own.
3. **Revoke or disconnect** anything that is no longer needed or not recognised. It stops working straight away. Revoke and Disconnect are hidden in a read-only support session.

## Common questions

### What can a client's token or app do?

Never more than the person's role allows. A client owner can choose *Read only* or *Read and feedback*; a viewer only *Read only*. Feedback covers changes such as a recommendation's status or rating a change.

### Why can I not create a token for a client?

Tokens made here are for client roles. Create your own under Agency settings › AI connections.

### Is there a limit on assistant calls?

Yes. Requests are rate limited per minute and per day; a limit that is hit shows as an error in the assistant, not on this page.

### A client lost their token. Can I show it again?

No. A token is shown once. Ask them to revoke it and create a new one.
