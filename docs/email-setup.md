# Email Setup (Resend Only)

The mailer has been simplified to use only the Resend API. SMTP support and fallbacks were removed to reduce complexity.

## 1. Minimal Environment Variables
Add to `backend/.env`:
```
APP_BASE_URL=https://app.yourdomain.com
RESEND_API_KEY=re_********************************
RESEND_FROM=OpenSky Time Clock <no-reply@yourdomain.com>
```
Restart the backend after changes.

For early testing before domain verification you can use a `@resend.dev` address:
```
RESEND_FROM=OpenSky Time Clock <onboarding@resend.dev>
```
Swap back to your domain after DNS verification.

## 2. Domain Verification
1. Add your domain in the Resend dashboard (Domains section).
2. Create the DKIM & SPF DNS records they provide (CNAME + TXT). Avoid duplicate SPF records; merge includes into one.
3. (Optional) Add DMARC TXT `_dmarc` with `v=DMARC1; p=none; rua=mailto:postmaster@yourdomain.com` to start.
4. Wait for propagation (5–30 minutes) then click Verify.

Until verified, messages from that domain may be blocked or land in spam; prefer the `@resend.dev` sender for initial plumbing tests.

## 3. Verifying Your Setup
Call the super user test endpoint:
```bash
curl -X POST \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"to":"you@yourdomain.com"}' \
  http://localhost:5001/api/admin/email/test
```
Successful response: `queued: true`, `provider: resend`, and an `id`.

Status only:
```bash
curl -H "Authorization: Bearer <JWT>" http://localhost:5001/api/admin/email/status
```

## 4. Troubleshooting
| Symptom | Cause | Action |
|---------|-------|--------|
| provider: none | Key missing / not read | Ensure RESEND_API_KEY present, restart backend |
| API key is invalid | Revoked / mistyped / whitespace | Regenerate key, trim, update .env, restart |
| Domain not verified | DNS not propagated | Use @resend.dev temporarily, finish DNS setup |
| Spam folder | Missing SPF/DKIM/DMARC | Complete domain records, warm up sending |
| From rejected | Unverified custom domain | Switch to verified domain or @resend.dev |

## 5. Security
- Keep API key out of version control.
- Rotate keys periodically and after suspected leaks.
- Restrict who can hit test endpoints (already super user protected).

## 6. Future Enhancements
- Token hashing for provisioning (see onboarding docs).
- Queued / retry logic (e.g. add a small queue + exponential backoff if Resend rate limits appear).
- Metrics export (count successes/failures per template).

---
Last updated: 2025-10-14
