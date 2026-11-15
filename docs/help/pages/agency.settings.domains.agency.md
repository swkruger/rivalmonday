---
help_key: page:agency.settings.domains
audience: agency
title: Domains
---
## What this page tells you

Where your clients find you and who their emails come from. Until you add your own domains, clients use the web address shown at the top of the page, and client emails come from the address shown under **Email sending**. Only agency admins can open this page.

- **Web address** is the address your clients open: links in their emails, the sign-in page and their dashboards. Its status reads *Waiting for DNS*, *Checking certificate*, *Live* or *Failed*.
- **Email sending** is the domain client emails come from. Its status reads *Waiting for DNS*, *Verified* or *Failed*. The line at the top of the section always shows the address client emails use right now.

## How to use it

1. **Add your web address.** Enter a subdomain of your own site, such as intel.youragency.com, and save. A bare domain such as youragency.com is refused: it usually already runs your website.
2. **Add the CNAME record.** Copy the record shown into your DNS provider. We check every 10 minutes for up to 72 hours. Once the record is found we check the certificate, and the status reads *Live*. We email your agency admins when it goes live, or if it fails.
3. **Add your email domain.** Enter your domain, such as youragency.com, and an address name (the part before the @; *briefs* unless you change it), then save.
4. **Add the TXT and CNAME records** shown under Email sending at your DNS provider. When both are found the status reads *Verified* and client emails come from your address. We email your agency admins when it is ready, or if it fails.
5. **Add a DMARC record** if the page asks for one. Sending does not wait for it, but inboxes trust your emails more with it.

## Common questions

### What happens if I remove my web address?

Client links go back to the address shown at the top of the page. Links in emails already sent to clients that use your own address stop working, so remove it only when you mean to.

### Why did my domain fail?

The records were not found, or the certificate could not be checked, within 72 hours. The reason is shown under the domain. Check the records at your DNS provider, then choose **Remove and try again** and add the domain again.

### Can I use the same domain for the web address and for email?

Yes. The web address is a subdomain (such as intel.youragency.com) and email uses the main domain (such as youragency.com). They don't get in each other's way.

### What is the DMARC warning?

A DMARC record tells inboxes how to treat email that fails its checks. We look for one once your email domain is verified. If none is found we show the warning, but client emails still go out from your address. Your email or IT provider can tell you the right value.

### Can I change the address name later?

Remove the email domain and add it again with the new address name. Until it is verified again, client emails come from the address shown on the page.
