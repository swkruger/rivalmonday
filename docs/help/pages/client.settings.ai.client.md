---
help_key: page:client.settings.ai
audience: client
title: AI connection
---
## What this page tells you

How to connect Claude, ChatGPT or another AI assistant to {{client}}'s competitor data. Answers come with the same evidence links you see in the dashboard.

- **Connector URL** is the address you paste into your AI assistant.
- **Access tokens** are for tools that cannot sign in, such as Claude Code or a script. A token acts as you, with the permission level you choose.
- **Connected apps** lists the apps you connected by signing in, with the permission level each has and the workspace it can reach.

## How to use it

1. **Claude or ChatGPT:** open Connectors in the app's settings, add a custom connector, paste the URL, then sign in and choose this workspace. The app then appears under **Connected apps**.
2. **Claude Code or a script:** create a token. Give it a name that says where it is used, such as “Claude Code on my laptop”, and choose its permission level. Copy the token straight away: it is shown once. Then run the command shown in the Connector URL card.
3. **Choose the permission level:** *Read only* lets an assistant look things up. *Read and feedback* also lets it record feedback, such as changing a recommendation's status or rating a change. Owners can choose either level; viewers can only choose Read only.
4. **Remove access any time** with **Revoke** on a token or **Disconnect** on an app. Anything using it stops working straight away; an app has to ask again next time.

## Common questions

### Why can I not see this page?

It appears only when your agency has switched on the AI connection for {{client}}. Ask your agency to turn it on.

### I lost my token. What now?

A token cannot be shown again. Revoke it and create a new one.

### Can an assistant change things?

Only as far as the permission level allows, and never more than your own role. With *Read only* it can only read. With *Read and feedback* it can also record feedback.

### What does “Last used” tell me?

The date a token was last used, or Never. A token you do not recognize, or no longer need, is worth revoking.
