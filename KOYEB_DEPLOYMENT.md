# MARKET HUB: Koyeb + Neon staging migration

## Safety rules

- Keep the current Render service live until every verification gate passes.
- Deploy only the `agent/koyeb-neon-migration` branch during staging.
- Never point production traffic at Koyeb during staging.
- Never test payment, checkout webhook, shipment, or importer publishing against
  production data.
- Use a cloned PostgreSQL database and test-mode integration credentials first.

## Why the startup was changed

The Render launcher reconstructed the application from more than 40 ZIP files on
every cold start. This branch commits the fully materialized `app/` directory and
starts `app/server.js` directly. The historical ZIP files remain in the repository
for traceability but are excluded from the Docker build context.

This removes archive extraction from each container startup and makes the runtime
image deterministic.

## Koyeb service configuration

- Deployment method: GitHub
- Branch: `agent/koyeb-neon-migration`
- Builder: Dockerfile
- Dockerfile path: `Dockerfile`
- Service type: Web Service
- Instance: Free during staging
- Region: Frankfurt when available (closer to India than Washington, D.C.)
- Exposed port: `8080`, protocol HTTP
- Route: `/` to port `8080`
- HTTP health check: `/api/healthz`
- Instances during migration: exactly 1

Koyeb automatically supplies `PORT` from the lowest exposed port. The Dockerfile
also defaults it to `8080` so local and hosted behavior match.

The Koyeb Free Instance sleeps after one hour without traffic. It cannot use a
persistent volume and is intended for staging or hobby use. A paid instance is
required if the store must remain continuously warm.

## Storage and database

Use Neon PostgreSQL for application data instead of the Koyeb free database. The
Koyeb free database is limited to five active compute hours per month, which is
not enough for a customer-facing store.

No persistent container filesystem is required. Product, customer, cart/order,
importer, analytics, and operational data are PostgreSQL-backed. The existing
catalogue images are bundled as immutable application assets, while imported
media is represented by remote URLs. Do not store new uploads or a database
inside the Koyeb container because its local disk is ephemeral.

The app's admin and customer sessions are currently in memory. A restart signs
users out. Keep one instance until sessions are moved to a shared store or to
signed durable cookies.

## Environment variables

Create Koyeb Secrets or private environment variables from `.env.koyeb.example`.
Never commit real values. Use test-mode Razorpay and Shiprocket credentials during
staging. `DATABASE_URL` should use Neon's pooled TLS connection string.

## PostgreSQL migration plan

1. Identify the current database provider, PostgreSQL version, size, extensions,
   and backup/restore options.
2. Create a Neon project for staging.
3. Take a provider backup of the current database and keep it unchanged for
   rollback.
4. Restore a copy into Neon using `pg_dump --format=custom --no-owner --no-acl`
   and `pg_restore --no-owner --no-acl`, or use the providers' managed tools.
5. Run `/api/readyz`, then compare row counts for users, products, orders,
   order_items, shipments, product imports, and recommendation events.
6. Test only against the cloned Neon database.
7. At final cutover, temporarily stop new writes, take a final backup, restore the
   final snapshot, rerun row-count checks, update Koyeb production secrets, and
   then direct customers to the Koyeb URL.
8. Keep Render available for rollback and avoid writes to both databases after
   cutover because the app has no replication or reconciliation layer.

The base schema is in `app/schema.sql`; importer migrations are under
`app/database/`; guarded runtime migrations are in `app/db.js`. Do not run the
base schema over an existing production database. Restore first and let the app's
guarded migrations run normally.

## Verification gates

1. `/api/healthz` returns HTTP 200 and `/api/readyz` returns HTTP 200.
2. Storefront, catalogue, search, product pages, cart, wishlist, customer signup,
   login, account, and order history work on desktop and mobile.
3. Admin login, products, orders, tracking, reports, and importer
   analyse/draft/publish work.
4. Razorpay test-mode order creation, signature verification, and webhook
   verification work.
5. Shiprocket configuration/catalogue endpoints work with test credentials; a
   controlled test checkout confirms the webhook without creating a live shipment.
6. One controlled test order appears correctly in customer and admin views.
7. Deployment logs and metrics show no repeated crashes or memory exhaustion.
8. After one hour idle, measure wake-up time and confirm the site recovers without
   data loss.
9. Restart the service and confirm the only expected loss is in-memory sessions.

## Cutover and rollback

Do not switch until all gates pass and a fresh database backup exists. Because
there is no custom domain yet, the public URL will change from Render's URL to
Koyeb's URL. Update every shared business link only after final approval.

If a critical issue appears, stop Koyeb writes and direct customers back to
Render. Render must not be deleted until the Koyeb deployment has completed an
agreed observation period and database restore testing has succeeded.
