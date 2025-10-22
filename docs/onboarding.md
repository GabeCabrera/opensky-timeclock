# User Onboarding & Provisioning Architecture

This document describes the lifecycle for creating and provisioning new user accounts inside OpenSky Time Clock. It is intended for engineers extending the flow and for administrators who need to understand the mechanics.

## Goals
- Secure invite-based onboarding (no open self‑registration)
- Clear admin UX (create, monitor, regenerate token)
- Extensible: easy to add reminder emails, bulk invites, SSO handoff later
- Minimize credential sharing risk (use **one-time token** + setup link)

## Data Model
We embed provisioning state directly on `users` (avoids join complexity):
- `is_provisioned BOOLEAN` – flips true after successful setup
- `provision_token VARCHAR` – random 32‑byte hex; nulled post-setup
- `provision_token_expires TIMESTAMP` – default 7 days from issue

Reasoning: small scale; a separate `user_invites` table becomes useful only if we need audit history, multi-invite variants, or resend tracking. Future: create table `user_invite_events(user_id, action, token_hash, created_at)` for compliance.

## Flow Overview
1. Admin opens Users tab → clicks New User.
2. Admin submits form (first/last/email/role flag).
3. Backend creates user with provision token (7d expiry) & emails invite.
4. Success response returns `provisionLink` and raw token (for fallback/copy).
5. User clicks link `/setup?email=...&token=...`.
6. Frontend pre-fills email + token, validates, prompts for password.
7. `/auth/setup` validates token + expiry, hashes password, marks provisioned, clears token fields.
8. User receives JWT, redirected to app; user now counted as provisioned.

## API Contracts
### POST `/admin/create-user`
Request: `{ firstName, lastName, email, isAdmin? }`
Response: `{ user, provisionToken, provisionTokenExpires, provisionLink }`

### POST `/auth/setup`
Request: `{ email, provisionToken, password }`
Response: `{ token, user }`

### POST `/admin/regenerate-provision-token/:userId`
Only if `is_provisioned = false`.
Response: `{ provisionToken, provisionTokenExpires, provisionLink }`

## Email Template (current)
Subject: `You have been invited to OpenSky Time Clock`
Body includes: greeting, token, expiry date, setup link. Text-only alternative auto derived.

Future improvements:
- Multi-locale templates (inject via simple template resolver)
- Add company branding & disclaimer
- Dark mode aware HTML (prefers-color-scheme)

## Security Considerations
- Tokens are random 32 bytes hex (~256 bits) → high entropy.
- Token cleared immediately after successful setup preventing reuse.
- Expiration enforced server-side; regeneration invalidates previous token.
- Future: store only a SHA256 hash of the token instead of plaintext (requires emailing only once & not re-surfacing raw token in API except on creation/regeneration).

## Extensibility Hooks
| Feature | Approach |
|---------|----------|
| Reminder emails (24h before expiry) | Cron/queue scanning `users WHERE !is_provisioned AND expires BETWEEN now+1d` |
| Bulk import | Accept CSV -> create many users -> batch send invites |
| SSO / IdP | If SSO, skip password; treat token redemption as linking step |
| Invite audit | Add `user_invite_events` table with actions: create, regenerate, reminder, expire |

## Frontend UX Notes
- Modal keeps admin on context; success screen provides: email, setup link, raw token, expiry.
- Copy to clipboard buttons for each credential.
- After close, Users list refreshes.
- Expiring/Expired columns surfaced via filter chips (already integrated in portal through existing metrics logic using `provisionTokenExpires`).

## Testing Strategy
Backend (future test harness):
- Create user → returns token/link → DB row fields set.
- Setup with valid token → marks provisioned, clears token fields.
- Setup with expired token → 400.
- Regenerate token → new token & expiry; old token invalid.

Frontend:
- Modal validation (empty fields, invalid email).
- Success state rendering provisionLink & expiration.
- Close modal triggers onSuccess callback.

## Future Migrations
If we move to hashed tokens:
1. Add column `provision_token_hash`.
2. Populate hash for existing tokens (one-off script), then NULL raw token.
3. Update flows to generate raw token, store hash, email raw, never return raw again except at generation time.

## Operational Tips
- If emails are not sending in dev: check logs for `[mailer] (disabled)` reason. Configure SMTP env vars or rely on console log.
- To forcibly expire a token (security incident), admin can regenerate → previous token invalid.

---
Last updated: ${new Date().toISOString()}
