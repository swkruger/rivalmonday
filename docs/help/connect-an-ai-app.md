---
seed_key: connect-an-ai-app
title: Connect an AI app to {{product}}
kind: help
---
# Connect an AI app to {{product}}

You can connect an AI app such as Claude, ChatGPT or Claude Code to {{product}}. The app can then answer questions about your clients' competitors using the same monitored evidence you see in the dashboard.

Connections are for agency staff. Open **Agency settings › AI connections** (`/agency/settings/ai`). Each client also has its own **AI connection** tab under **Client settings**.

## The connector URL

The top card shows your connector URL. It is your app address followed by `/mcp`. Use the Copy button to copy it.

- **Claude** (claude.ai or the desktop app): go to Settings, then Connectors, then Add custom connector. Paste the URL, sign in and choose this workspace.
- **ChatGPT**: go to Settings, then Connectors, and create a connector in developer mode. Paste the URL and sign in.
- **Claude Code**: create an access token first (see below), then add the URL with the command shown on the page, using your token in the Authorization header.

Once connected, the app can reach every client you have access to. When it matters, it asks which client you mean.

## Access tokens

Some tools need a personal access token instead of a sign-in. Create one in the Access tokens card and choose how much it may do:

- **Read only**
- **Read and feedback**
- **Read, feedback and manage** (available only if your role allows it)

A new token is shown once. Copy it straight away, because you cannot see it again. Admins see every member's tokens and connected apps in the agency.

## Taking access away

- To stop a token working, choose **Revoke** next to it. Anything using it stops straight away.
- Apps connected by sign-in appear in the Connected apps card, where you can revoke them in the same way.
