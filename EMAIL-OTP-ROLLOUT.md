# Customer email OTP rollout

Only customer authentication is changed. Admin authentication, checkout and SMS authentication are not part of this rollout.

## Production configuration

- Existing server-only `BREVO_API_KEY`, stable `SESSION_SECRET` (32+ characters), `DATABASE_URL` and correct public origin are required. Never expose these via frontend variables.
- `EMAIL_OTP_ENABLED=true` enables requests from all existing eligible customer emails. Without this exact value the owner pilot remains active.
- `/api/auth/email/status` exposes only the enabled boolean, never credentials. Login/reset labels follow this switch.
- Codes expire in 10 minutes, with 5 guesses per challenge. Request quotas: 60-second email cooldown, 5/email/hour, 15/IP/hour, 200 globally per rolling 24 hours. Provider quota/credits also apply.
- Email must match exactly one active account with a password hash. Missing/ambiguous accounts and provider failures return the same generic response. Sign-up email verification is not implemented by this feature.

## Evidence and limits

- Owner reported email OTP login and reset followed by new-password login working.
- Isolated flow tests cover actual auth functions with a fake SQL adapter: replay, expiry, attempt accounting, resend invalidation, quotas, absent/duplicate accounts, provider failure, inactive users, password change invalidation, reset hashing and session revocation.
- These are NOT real PostgreSQL concurrency tests or proof of delivery to every mailbox. Monitor real delivery errors without recording codes or keys.
- Session issuance timestamps are captured before authentication, so an authentication started before a concurrent reset cannot mint a post-reset session timestamp. Revocation remains enforced even when the email-provider key is removed.

## Enable / rollback

1. Deploy code and verify health, password login and admin access.
2. Confirm public activation, set `EMAIL_OTP_ENABLED=true` for Vercel Production and redeploy. Do not change provider credentials.
3. Verify status is enabled, login offers email OTP, Forgot password points to reset, and owner-pilot wording is absent.
4. Verify an authorized customer email delivery/login and reset; user enters and submits any new password themselves. Check old-session rejection separately.
5. To stop new public OTP requests, unset the flag or set it to `false` and redeploy. Existing issued codes may remain usable for their remaining lifetime (up to 10 minutes). Do not delete revocation records, rotate the session secret or remove the database as a rollback step.

No production orders, products or customer profiles are altered by rollout configuration.
