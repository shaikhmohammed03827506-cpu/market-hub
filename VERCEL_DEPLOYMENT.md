# MARKET HUB: Vercel + Neon staging

The current Render service remains live until the Vercel preview passes every verification gate. Do not change DNS, remove Render, or copy production data during staging.

## Architecture

- Vercel runs the existing Node request handler as one Frankfurt function.
- The complete `app/` directory is bundled with that function so customer pages and catalogue images remain available.
- Neon provides PostgreSQL storage in Frankfurt.
- Admin and customer logins use HMAC-signed, HTTP-only cookies so sessions do not depend on one function instance remaining warm.
- The function filesystem is read-only. Durable business data belongs in Neon; catalogue images are versioned deployment assets.

## Vercel project settings

- Git branch: `agent/koyeb-neon-migration` until this draft is renamed or merged
- Framework preset: Other
- Build command: leave empty
- Output directory: leave empty
- Install command: `npm install`
- Function region: Frankfurt (`fra1`)
- Function timeout: 60 seconds on Hobby

## Required staging variables

Set `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters. Keep all provider variables unset during the first safe smoke test. Add only Razorpay test-mode and Shiprocket/Delhivery sandbox credentials before integration testing.

## Verification gates

1. `/api/healthz` returns 200 and `/api/readyz` returns 200.
2. Homepage, catalogue images, product detail, search, cart, and account pages load.
3. Admin login remains valid across separate requests and importer dry-run tests pass.
4. A disposable customer can register, sign in, update a cart/account, and sign out in the empty staging database.
5. Razorpay uses test keys only; Shiprocket and Delhivery use non-production test credentials only.
6. Render remains the production URL until the owner approves final cutover.

## Limits and operational notes

Vercel Hobby functions scale to zero and may cold-start, but they do not have Render's fixed 15-minute idle sleep behavior. Vercel can archive inactive functions and unarchive them on demand, so the first request after a long inactive period may still be slower. The Hobby plan is intended for personal/non-commercial use; review plan terms before a commercial launch.
