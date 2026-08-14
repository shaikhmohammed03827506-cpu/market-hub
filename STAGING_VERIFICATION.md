# MARKET HUB staging verification

Verified on 2026-08-14 against `https://market-hub-staging.vercel.app`.

## Safety state

- Render remains live and unchanged as the production rollback target.
- No production records were copied, modified, or deleted.
- Neon project `market-hub-staging` contains an empty staging catalogue after test cleanup.
- Vercel tracks `agent/koyeb-neon-migration` as its production branch for this isolated staging project.
- Provider credentials are intentionally absent, so staging cannot create real Razorpay payments or Shiprocket shipments.

## Passed checks

- Vercel deployment completed in Frankfurt and the public project address serves the storefront.
- `/api/healthz`, `/api/readyz`, and `/api/health/database` returned 200.
- Homepage, shop, product, login, registration, admin login, checkout success, JavaScript, CSS, and catalogue image assets loaded.
- Admin API login, signed session persistence, protected admin page access, products, and importer settings worked.
- A disposable customer registered, signed in, opened account/dashboard data, signed out, and was then removed.
- A disposable product rendered in the shop, was added to the cart, increased to quantity two, retained after the disabled checkout attempt, and was then removed.
- A live Amazon.in product was analyzed into a review item with title and images; the item was not published and was deleted after the test.
- Shiprocket catalogue product and collection feeds returned data.
- Razorpay and Shiprocket checkout endpoints failed safely while their credentials were absent; an invalid webhook body was rejected.
- All disposable customer, product, importer, and cart test data was cleaned up.

## Database role note

The current application performs schema changes lazily from request handlers (`CREATE TABLE`, `ALTER TABLE`, functions, and triggers). Because those operations require object ownership, staging currently connects with Neon's generated database-owner role. Before a production cutover, move these schema changes into a one-time migration job and give the running Vercel function a restricted runtime role.

## Still manual before a real cutover

1. Add Razorpay test-mode credentials and run order creation, signature verification, payment failure, and webhook replay tests.
2. Add Shiprocket Checkout/shipping sandbox credentials and verify token creation, serviceability, checkout callbacks, shipment creation, and webhook idempotency.
3. Decide whether Vercel Hobby's personal/non-commercial terms fit the intended launch; upgrade or choose a commercial host if required.
4. Create a fresh production database migration/backup plan. Do not reuse the empty staging database as the production source without an approved data move.
5. Keep Render live until provider tests, production-data migration, monitoring, and the final URL switch are explicitly approved.
