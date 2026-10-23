# 01 · Screenshot inventory

*Rival Monday design-system research · 2026-10-23 · evidence base for every later document.*

## Source and method

- **Source:** Mobbin, read through the Mobbin MCP server. Primary evidence is the owner's own saved collections. Secondary evidence comes from targeted searches across popular B2B products, run in six parallel research batches with the same evaluation template.
- **Owner collections:** *Pages* ("Pages I like", 9 screens), *Dashboards* ("Dashboards and overview pages I like", 6), *Agency and Client Onboarding* (13), *Dashboard* (2). The *RivalMonday* collection is empty, and *All saved* is the union of these (29 screens). Saved *apps* (3) are not reachable through the MCP server and were not analysed. No item carried team comments.
- **Size:** **136 unique screens from 74 apps** (one ClickUp screen sits in two batches as C09/E16). Batches also noted about 40 more screens as secondary evidence; they are cited inside the batch notes but not counted here.
- **How screens were read:** each screen was viewed as a ~768 px-wide preview of a ~1440 px desktop capture (iOS ≈ 390 × 844). **Every colour and pixel size in the research is an estimate** (marked "est.") because the previews cannot be sampled. No token value in this design system is copied from a screenshot (see [05](05-design-system-specification.md)).
- **Full per-screen notes:** [research/](research/). Each entry records viewport, theme, categories, navigation structure, major components, visual specifics, distinctive traits and limitations. The table below is the index; IDs are used for traceability in every later document.
- **Links:** `mobbin.com/screens/<id>` links are canonical. The `image_url` values in the batch notes are short links that **expire about 30 days after 2026-10-23**. Screenshots were deliberately not copied into the repo, because they are third-party proprietary UIs.

| Batch | Focus | Screens | File |
|---|---|---|---|
| O | Owner's own collections (primary evidence) | 28 rows / 29 screens | [batch-O.md](research/batch-O.md) |
| P | Searches for the owner's favourite brands (Plain, Mercury), plus inbox lists | 8 | in batch-O.md |
| A | Application shell, navigation, page headers | 16 | [batch-A.md](research/batch-A.md) |
| B | Dashboards, analytics, KPIs, charts | 16 | [batch-B.md](research/batch-B.md) |
| C | Tables, lists, filters, bulk actions, empty states | 16 | [batch-C.md](research/batch-C.md) |
| D | Settings, forms, detail pages, wizards | 16 | [batch-D.md](research/batch-D.md) |
| E | Component level: buttons, chips, tabs, menus, dialogs, toasts | 18 | [batch-E.md](research/batch-E.md) |
| F | AI assistant, reading views, feeds, mobile | 18 (3 iOS) | [batch-F.md](research/batch-F.md) |

**Themes:** 133 light, 0 dark (dark twins were seen and skipped), 3 mobile. Dark mode is out of scope for this system (see [04](04-design-decisions.md) § Unresolved).

## Categories (a screen can be in several)

| Category | Screens |
|---|---|
| SaaS dashboards / overview | O10–O16, A01, A06, A10, B01, B04, B09, B10, B11, C06, P05–P08 |
| Data-heavy enterprise | A03, A08, A09, A11, B06, B13, C01–C03, C05, C10–C12, C16, D09, D10, E01–E05, E08, E15 |
| Productivity | A04, A13, A14, C14, E06, E07, E13, E14, F03, F10, P02, P03 |
| Project management | A05, A12, C04, C08, C09/E16, F01, F11 |
| Admin & settings | O01–O09, A07, A15, D01–D08, D13–D16, E10, E11 |
| Search & discovery | A16, B08, C13, E09, F07 |
| Content management | E07, E09 |
| Forms & data entry | O01, O05–O07, O17–O29, D02, D03, D11–D14, E02 |
| Analytics & reporting | O10, O12–O16, A11, B01–B16, C05 |
| AI chat / assistant | O08, O09, O11, A04, D10, F01–F09, F17, F18 |
| Mobile / responsive | F16, F17, F18 (thin evidence; see [04](04-design-decisions.md) D-23) |
| *Added:* onboarding & auth | O17–O29, D11, D12 |
| *Added:* feeds & notifications | B09, B10, F11–F14, P01–P04 |
| *Added:* competitor / market intelligence (our domain) | B03, B05, B06, B07, B08 |

## Initial observations

1. **The owner's taste is consistent and specific.** 14 of the 29 saved screens are from **Plain**: a grey app frame, one inset white sheet, a dual navigation with grouped labels, centred form columns, near-black primary buttons, charts placed directly on the page, and tiny status pills with a dot. The newer collections (Oct 2026) use far fewer cards than the older *Dashboard* collection (Feb 2026: Causal, Amplitude).
2. **Cards in the owner's picks are selective.** They appear for catalogues of independent items (O03), editable records (O09), panels saved together (O08), and Mercury's dashboard widgets (P06–P08). Elsewhere, tables and charts sit flush (O10, O13, P07).
3. **The best-in-class sample agrees.** Shadows on static surfaces are rare (13/16 in B, 0 settings pages in D). Shadows are concentrated on floating layers (every menu, popover and dialog in A, C and E).
4. **Our own domain's direct competitors are the noisiest** (Semrush B06, Peec AI B07: boxes everywhere, many similar line colours). Following the general SaaS best practice rather than the category norm is a differentiation opportunity.
5. **Limits:** no screen shows dark mode, few show responsive layouts, and some apps appear only once. Recommendations that rest on one app are marked low/medium confidence in [03](03-cross-application-comparison.md).

## Inventory

| ID | App | Page / workflow | Theme | Mobbin |
|---|---|---|---|---|
| O01 | Plain | Settings › Tiers & SLAs › Create tier (form) | light | [link](https://mobbin.com/screens/627b0d61-eaa5-4cd6-8c7c-73bdd68fab1b) |
| O02 | Jasper | Settings › Billing | light | [link](https://mobbin.com/screens/4150ed24-e0cd-4312-9940-dec1499658aa) |
| O03 | Plain | Settings › Channels | light | [link](https://mobbin.com/screens/60965423-79e1-4631-942a-3bb962ebb15b) |
| O04 | Plain | Settings › Billing | light | [link](https://mobbin.com/screens/e68f0cc3-36da-444b-a296-37e0aca0eb86) |
| O05 | Plain | Account › Profile | light | [link](https://mobbin.com/screens/88c63447-0078-4e58-b308-02b68b744358) |
| O06 | Plain | Account › Profile (edited state) | light | [link](https://mobbin.com/screens/72c9cfb4-253a-4499-87ec-8919a2755818) |
| O07 | Plain | Create a help center (form) | light | [link](https://mobbin.com/screens/b4633e5b-ac44-4550-a5be-5582515e086b) |
| O08 | Plain | Plain AI › Ari preferences | light | [link](https://mobbin.com/screens/8b490b82-91cd-40ad-895f-99f885c52290) |
| O09 | Plain | Plain AI › Tone of voice | light | [link](https://mobbin.com/screens/3b996573-cf38-4bb9-b90a-b8c649a1ed3e) |
| O10 | Plain | Insights › Reporting | light | [link](https://mobbin.com/screens/fccb6ef9-8460-412a-a38f-c2dc93a0cbc0) |
| O11 | Plain | Plain AI › Overview | light | [link](https://mobbin.com/screens/b3bf851d-3721-45f1-a775-925b385be28a) |
| O12 | Braintrust | Project overview | light | [link](https://mobbin.com/screens/c7ff49f6-cc45-408e-afbc-dca2cb798351) |
| O13 | Browserbase | Project overview | light | [link](https://mobbin.com/screens/654392d0-9063-4db4-8987-6b7fc6742537) |
| O14 | Amplitude | Home (templates/charts) | light | [link](https://mobbin.com/screens/b584804b-9aa7-446d-8986-5cf57c80d589) |
| O15 | Causal | Home | light | [link](https://mobbin.com/screens/0bbcce0b-e114-4b81-92d5-4b6adab90661) |
| O16 | Amplitude | Home dashboard | light | [link](https://mobbin.com/screens/21116a93-645c-4d13-922e-13f1748b995b) |
| O17 | Plain | Onboarding "Name your workspace" | light | [link](https://mobbin.com/screens/e6de9c67-948d-49f3-a11f-8f6dfe2990f4) |
| O18/O19 | Plain | Sign-up split screen (filled / empty) | light | [link 1](https://mobbin.com/screens/230e7af1-f2e5-48e9-88d8-22b6720d5bb1) [link 2](https://mobbin.com/screens/1d91424e-78c3-483f-b693-abdb8c7c8561) |
| O20 | Jasper | Add billing details (checkout split) | light | [link](https://mobbin.com/screens/b143d151-875c-41cf-9fbe-d70c32e39cb2) |
| O21 | Jasper | Check your email (error) | light | [link](https://mobbin.com/screens/03c19558-9c73-4954-aa96-311b6d34d5df) |
| O22 | Jasper | Create account | light | [link](https://mobbin.com/screens/4dbab423-dd90-41cf-b610-fc7b3a9af609) |
| O23 | Causal | Confirm your email (loading) | light | [link](https://mobbin.com/screens/43d47694-1556-4654-8423-969cf5136dc4) |
| O24 | Mercury | Setup checklist (step 5 expanded) | light | [link](https://mobbin.com/screens/9da72742-0f75-4725-b8bd-202367f9cb37) |
| O26 | Mercury | Setup checklist (step 2 expanded) | light | [link](https://mobbin.com/screens/a51f1c20-4745-4621-967c-50385a2ac1db) |
| O25 | Mercury | Add team member modal | light | [link](https://mobbin.com/screens/8c2fb561-93ec-4702-ab5e-d84de3856f7c) |
| O27 | Mercury | Company info form (top progress) | light | [link](https://mobbin.com/screens/07aee197-76a3-4d69-baf7-2827b9946e22) |
| O28 | Mercury | Create your account (card on grey) | light | [link](https://mobbin.com/screens/53798472-99cb-43fc-9ea7-df90be947a61) |
| O29 | Mercury | Get started (card on grey) | light | [link](https://mobbin.com/screens/fb8acdd7-8bc7-458c-a1d4-e9a5ccc951fd) |
| P01 | Plain | Labels thread list | light | [link](https://mobbin.com/screens/1764602c-b875-482f-a13f-059bf78c15b7) |
| P02 | Notion Mail | Inbox | light | [link](https://mobbin.com/screens/fcbc3ac5-67b3-4732-bb12-999172202799) |
| P03 | Superhuman | Starred | light | [link](https://mobbin.com/screens/8df679bd-12c9-4357-ae31-9782d80ac83f) |
| P04 | Dribbble | Messages | light | [link](https://mobbin.com/screens/c411980f-834f-4a96-adbb-21a31462f269) |
| P05 | Mercury | Home (employee, empty/loading) | light | [link](https://mobbin.com/screens/bb15ae0e-0445-4c13-ba4f-3ccb1a930fb5) |
| P06 | Mercury | Home (owner) | light | [link](https://mobbin.com/screens/dbf9eb63-dcfe-4876-965a-e8a6d8702092) |
| P07 | Mercury | Home money movement + transactions | light | [link](https://mobbin.com/screens/77963885-5965-4f86-81f8-32dbffe67dc9) |
| P08 | Mercury | Home with completed migration banner | light | [link](https://mobbin.com/screens/7fec2a74-4e68-4f3a-ae6e-91ed9d4279d2) |
| A01 | Stripe | Home / "Today" + overview | light | [link](https://mobbin.com/screens/a31f7d76-ade4-4cae-a816-a4c9b33814c3) |
| A02 | Stripe | Overview in edit/customise mode | light | [link](https://mobbin.com/screens/673e89af-fe9e-4ab9-ac27-435dedf21888) |
| A03 | Attio | Companies record list | light | [link](https://mobbin.com/screens/df2bcdc2-5f03-430f-ae92-013056040463) |
| A04 | Linear | Workspace home (Ask Linear) | light | [link](https://mobbin.com/screens/91bb1f70-f2a9-4c6b-b153-522c8b6a8d62) |
| A05 | GitLab | Group overview | light | [link](https://mobbin.com/screens/1d6c395b-abf0-4559-9703-2fb4dda09fc7) |
| A06 | Klaviyo | Service › Customer Hub overview | light | [link](https://mobbin.com/screens/991ede6b-2ade-4d51-ab4b-d3e22db908c9) |
| A07 | Klaviyo | Settings › Other › Consent pages | light | [link](https://mobbin.com/screens/db86a7a2-52ce-49b0-9727-ed7c6cc6ee6a) |
| A08 | Neon | Branch › Tables (data editor) | light | [link](https://mobbin.com/screens/0584d09c-5eea-4830-93e4-94958abc318d) |
| A09 | Vercel | Storage › Neon integration data editor | light | [link](https://mobbin.com/screens/e4808e29-6df0-41a1-ae5a-7ada58ffaab7) |
| A10 | Supabase | Project home (collapsed icon rail) | light | [link](https://mobbin.com/screens/10cd243a-b924-48d5-b74b-dedf9c70c286) |
| A11 | LangSmith (LangChain) | Tracing project › Runs | light | [link](https://mobbin.com/screens/3fe9126c-5520-4950-a3f9-bbe5d35809e3) |
| A12 | Jira | Space › List view | light | [link](https://mobbin.com/screens/8835a262-f48c-49cf-b664-ed5aaa0c6e15) |
| A13 | Airtable | Home | light | [link](https://mobbin.com/screens/48f967f7-f759-4e7d-bf9c-48b55833263f) |
| A14 | Fibery | Workspace menu / switcher | light | [link](https://mobbin.com/screens/e470f040-82a2-44ec-8954-c70e56ce695b) |
| A15 | Customer.io | Workspace settings › Subscription center | light | [link](https://mobbin.com/screens/c302f565-2254-4fca-828a-447bb035faad) |
| A16 | Mistral AI (La Plateforme) | Command palette | light | [link](https://mobbin.com/screens/8450c1c7-7c10-40a3-9af3-c9c234ac4b53) |
| B01 | Stripe | Home "Your overview" | light | [link](https://mobbin.com/screens/02176a39-e453-4570-af73-6af00fbe681b) |
| B02 | Stripe | Billing overview (Revenue tab) | light | [link](https://mobbin.com/screens/a45686d8-0bea-4626-b70b-d432517dce71) |
| B03 | Stripe | Billing overview (Benchmarking) | light | [link](https://mobbin.com/screens/21e1c3f3-1b45-4140-a208-4fd250a52533) |
| B04 | Vercel | Project Web Analytics | light | [link](https://mobbin.com/screens/172f9834-0e6a-4fa8-abd4-6e91b02b5ef4) |
| B05 | Vercel | AI Gateway Leaderboards | light | [link](https://mobbin.com/screens/684fc9a5-8990-4f93-8fc3-28e1e0750078) |
| B06 | Semrush | Position Tracking (AI Visibility landscape) | light | [link](https://mobbin.com/screens/14c7aae9-9529-43c1-805c-f0098bfdb244) |
| B07 | Peec AI | Overview (brand visibility vs competitors) | light | [link](https://mobbin.com/screens/ea726eca-9ea2-423c-be52-181b642a04f1) |
| B08 | Profound | Keyword detail / similar keywords | light | [link](https://mobbin.com/screens/e3b23214-75c6-4803-b235-062f3e397e15) |
| B09 | Jobber | Home (field-service SMB) | light | [link](https://mobbin.com/screens/56a6ce1c-8d71-4c1a-89cb-1d07f075424a) |
| B10 | Bonsai | Dashboard | light | [link](https://mobbin.com/screens/34d0f00d-1ca1-4c73-b388-14b96f0b88a9) |
| B11 | Klaviyo | Overview dashboard (Analytics) | light | [link](https://mobbin.com/screens/bdf31fa5-988c-4693-b04e-be5c412d0efd) |
| B12 | Gorgias | Statistics / Live overview | light | [link](https://mobbin.com/screens/e4248d94-917f-44e4-a0c3-4f76eea2e385) |
| B13 | Cloudflare | Workers metrics | light | [link](https://mobbin.com/screens/4806b442-2102-4174-9cbd-44939fb9434c) |
| B14 | Shopify admin | Attribution report | light | [link](https://mobbin.com/screens/4a11d92c-0225-4b80-a80d-4ce328e030f2) |
| B15 | Etsy | Shop Manager Stats | light | [link](https://mobbin.com/screens/4dd27d13-28fd-41e9-aa68-2031480d97c2) |
| B16 | Luma | Event Insights | light | [link](https://mobbin.com/screens/4ea48e2c-8764-41ff-a5d9-2c16d057ba44) |
| C01 | Stripe | Transactions list (default) | light | [link](https://mobbin.com/screens/1bbafee3-44a6-4a27-81d2-dfdab7388258) |
| C02 | Stripe | Transactions with applied filters | light | [link](https://mobbin.com/screens/373146e1-8686-43b0-8a10-5da707dc8873) |
| C03 | Attio | Companies table | light | [link](https://mobbin.com/screens/4087fbe2-d9dc-4097-ad39-f8501c937e70) |
| C04 | Linear | Issues list grouped by status, bulk selection | light | [link](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022) |
| C05 | Hotjar | Recordings table with row selection | light | [link](https://mobbin.com/screens/ff3024b1-5264-483e-afa7-460a0224ff89) |
| C06 | Navattic | Visitors table, filter chips + pagination | light | [link](https://mobbin.com/screens/ec4931ac-c3ca-46cd-8d07-39ffd02e22a9) |
| C07 | Navattic | Forms empty state (inside table) | light | [link](https://mobbin.com/screens/46005a99-2d4c-494e-a592-ecd0d6b6101a) |
| C08 | Plane | Work items spreadsheet view | light | [link](https://mobbin.com/screens/f98823b4-aaef-453d-8b72-77425ba485d5) |
| C09 | ClickUp | List with bulk-action bar + status picker | light | [link](https://mobbin.com/screens/e9639493-e0a6-46c9-93d1-d3189cbdc3c7) |
| C10 | Calendly | Contacts table with filter builder popover | light | [link](https://mobbin.com/screens/a633760b-536f-4387-af06-8056089fa6cc) |
| C11 | Xero | Invoices with sort + numbered pagination | light | [link](https://mobbin.com/screens/1e0934f9-de0a-42c5-bb31-7f6d6b28fabd) |
| C12 | Twenty | Companies table with record side panel | light | [link](https://mobbin.com/screens/045edb7a-6c61-48ba-82bc-acc794b801c1) |
| C13 | Delphi | Filtered list, no-results empty state | light | [link](https://mobbin.com/screens/14f1556c-eba4-427e-aa8d-8bb7c20008c8) |
| C14 | Notion Mail | Inbox list + reading pane | light | [link](https://mobbin.com/screens/5ba89c38-f816-455e-bfa0-ad98517c7d0d) |
| C15 | Intercom | Inbox three-pane + details sidebar | light | [link](https://mobbin.com/screens/b1a806f1-b212-45a8-b525-fea3fa01b961) |
| C16 | Retool | Database table with sort popover | light | [link](https://mobbin.com/screens/df6ae31b-a72b-465b-ab78-ac84b279c228) |
| D01 | Devin | Personal preferences (settings) | light | [link](https://mobbin.com/screens/06dcfefe-1911-46b0-b273-c01b478eac06) |
| D02 | Gorgias | Your profile (settings) | light | [link](https://mobbin.com/screens/1cd57ee0-4192-4afd-a7e5-012191a13d89) |
| D03 | 7shifts | My account (tabs + card forms) | light | [link](https://mobbin.com/screens/a4ee8811-ee9e-46a8-bbf7-f8172cac66a9) |
| D04 | Rise (Stripe customer portal) | Billing / current plan | light | [link](https://mobbin.com/screens/fb67c0c8-2064-4c33-a828-dd0bc4347e64) |
| D05 | Mural | Billing (workspace) | light | [link](https://mobbin.com/screens/01cb0390-d5d3-4cf3-86a6-03f91f2c51c3) |
| D06 | Maze | Team settings (members + invite) | light | [link](https://mobbin.com/screens/48a8e1d5-3fbe-43fa-a6f8-ff2367e41dec) |
| D07 | Okta | Brand theme (white-label branding) | light | [link](https://mobbin.com/screens/8737c147-e992-4323-9a11-bfd5cf02bd41) |
| D08 | Shopify admin | Brand (colours, cover, slogan) | light | [link](https://mobbin.com/screens/679f840d-adfc-4996-bb96-1d4102d6acee) |
| D09 | Attio | Company record (activity + details sidebar) | light | [link](https://mobbin.com/screens/4596651f-1527-4ddb-9cde-b19067b5753f) |
| D10 | Lightfield | Account record with AI summary + Ask box | light | [link](https://mobbin.com/screens/f1244a10-3103-4ca1-87d6-df5eeef71f46) |
| D11 | Arcade | Onboarding wizard step 1 | light | [link](https://mobbin.com/screens/a7045f94-a2a0-4186-82ca-4bef1bbd0d72) |
| D12 | Apollo | Form setup wizard (header stepper + Next) | light | [link](https://mobbin.com/screens/8d90e05d-3532-4a04-b46d-562ff20b9338) |
| D13 | Mintlify | Authentication settings (two-column, inline error) | light | [link](https://mobbin.com/screens/31a78b73-f62f-4129-8d80-df093e8b7021) |
| D14 | Magnific | Profile settings (inline field error) | light | [link](https://mobbin.com/screens/d0085be4-600b-4deb-a641-03f01bed22bd) |
| D15 | Vercel | Project settings: Delete Project (danger) | light | [link](https://mobbin.com/screens/a5ac35a4-139a-4c45-a7fa-e2698143c045) |
| D16 | Mintlify | Danger zone page | light | [link](https://mobbin.com/screens/705b6bdb-355d-4a90-bc1f-b9b9dac04708) |
| E01 | Stripe | Transactions list (status badges, filter chips, count tiles, column popover) | light | [link](https://mobbin.com/screens/13552fc2-7c1b-4e50-80e6-6166a7403a13) |
| E02 | Stripe | Filter popover + recommendation banner | light | [link](https://mobbin.com/screens/5aba8f78-028a-4ad6-81f1-6ca698a41451) |
| E03 | Vercel | Deployments list with status multiselect popover | light | [link](https://mobbin.com/screens/b9d9cc23-34a1-434c-a4ed-52a2a4f49bb7) |
| E04 | Attio | Record page with tag picker popover | light | [link](https://mobbin.com/screens/3f58982f-fb3f-46de-a123-70350ebfa604) |
| E05 | Attio | Record activity + list entry (priority chip, stage dot, tag overflow) | light | [link](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a) |
| E06 | Linear | Views list with segmented tab control | light | [link](https://mobbin.com/screens/0eb0ef0f-7e0f-4507-a314-86e7924b2b21) |
| E07 | Notion | Database view tabs + "New view" menu | light | [link](https://mobbin.com/screens/0b94c9f8-5d71-4d6b-9058-74bf3e9f0b18) |
| E08 | Canny | Ideas table with view tabs, filter buttons, field-toggle side panel | light | [link](https://mobbin.com/screens/3557c802-40db-49d2-a908-2db56db7014f) |
| E09 | Qatalog | Filter tokens + searchable multiselect popover | light | [link](https://mobbin.com/screens/a260adc7-8b64-4500-ad1f-d3a2cc1ba673) |
| E10 | Qatalog | Delete confirmation with typed acknowledgement | light | [link](https://mobbin.com/screens/87535ac9-5efd-4412-a6a3-262ba9009e9c) |
| E11 | Gumloop | Delete confirmation (classic) | light | [link](https://mobbin.com/screens/a2a43ab6-f3b4-4d6c-bd45-28c707ec0e3f) |
| E12 | Grok | Delete project dialog (outline destructive) | light | [link](https://mobbin.com/screens/c9dfb101-5ee4-47f5-bb8c-cdc282142b43) |
| E13 | Amie | Row context menu with shortcuts and danger item | light | [link](https://mobbin.com/screens/a54a24d3-c92b-404b-8145-c2649ba0b79c) |
| E14 | Todoist | Task context menu with icon-grid groups + cascading submenu | light | [link](https://mobbin.com/screens/4c1351ef-54cc-47ff-aee1-e85019bdad39) |
| E15 | folk | CRM table with coloured status badges + tooltip | light | [link](https://mobbin.com/screens/926b7a2c-bb35-4b5b-9613-52d580ccea48) |
| E16 | ClickUp | List with tags, status picker and bulk-action bar | light | [link](https://mobbin.com/screens/e9639493-e0a6-46c9-93d1-d3189cbdc3c7) |
| E17 | Square | Inline warning alert above a form | light | [link](https://mobbin.com/screens/0c18f6a3-c97a-484f-b403-99fdfaf41676) |
| E18 | Air | Dark toast, bottom centre | light | [link](https://mobbin.com/screens/079f6e54-e75b-4ec0-9a50-1631834ebf66) |
| F01 | Asana | AI assistant floating side panel (empty state) | light | [link](https://mobbin.com/screens/f2b651ef-bce1-464c-9c47-52f2fb187238) |
| F02 | HoneyBook | AI assistant floating panel with an answer | light | [link](https://mobbin.com/screens/fa243020-70b3-41a7-94c1-50e5d51c7355) |
| F03 | Fireflies | AskFred docked right panel next to meeting | light | [link](https://mobbin.com/screens/2047129f-d283-45ef-81bb-09aa79a32ffe) |
| F04 | Customer.io | Agent as a full page with chat history column | light | [link](https://mobbin.com/screens/42560374-3ad7-4a94-b68d-e332d59b4867) |
| F05 | Customer.io | Agent answer with "N references" popover | light | [link](https://mobbin.com/screens/fafcbfb9-fa85-4b4d-b17f-54df962305b5) |
| F06 | ChatGPT | Deep-research report with Activity/Sources side panel | light | [link](https://mobbin.com/screens/73833b79-1dd5-4354-8fc4-a2e99c33a75e) |
| F07 | Dropbox Dash | Chat answer showing sources being analysed | light | [link](https://mobbin.com/screens/f4ca9d48-c17a-40e5-98a2-f3a293483967) |
| F08 | Plane | AI page empty state with suggestions | light | [link](https://mobbin.com/screens/8d800a40-7843-4810-95a1-9206c3289efc) |
| F09 | Lightfield | CRM chat empty state ("Some ideas…") | light | [link](https://mobbin.com/screens/a77b052b-5612-4588-895a-6cc553d5b18d) |
| F10 | Linear | Document reading view | light | [link](https://mobbin.com/screens/8db6eca2-904a-4ad1-8621-8c055860dc9c) |
| F11 | Asana | Inbox (grouped notifications + AI summary) | light | [link](https://mobbin.com/screens/8551be3e-e992-4933-bde7-64f6a2c6c3c8) |
| F12 | Workable | Notifications inbox with inline actions | light | [link](https://mobbin.com/screens/2146514d-1011-4f03-8b62-cef4040e0c42) |
| F13 | Basecamp | Latest Activity timeline | light | [link](https://mobbin.com/screens/3119c9f0-832e-448d-b750-03e5a806e9f6) |
| F14 | 7shifts | Audit/activity log with status chips | light | [link](https://mobbin.com/screens/39d6a081-1cd1-474a-91bc-81e63426ace9) |
| F15 | Klaviyo | Reviews management (list + filters + reply) | light | [link](https://mobbin.com/screens/e9b438b3-fed6-475f-ae19-19feac782405) |
| F16 | Squarespace (iOS) | Analytics overview | light · mobile | [link](https://mobbin.com/screens/c0a1c009-9db8-45ef-85ea-51c8ccdb5a4c) |
| F17 | ChatGPT (iOS) | Sources bottom sheet | light · mobile | [link](https://mobbin.com/screens/3eaf4e44-fdce-48bc-965b-b194ed9c43ac) |
| F18 | Perplexity (iOS) | Answer with inline source pills and follow-ups | light · mobile | [link](https://mobbin.com/screens/fe1aa2bb-e46b-45b2-ac6f-e2cb4916cbf1) |
