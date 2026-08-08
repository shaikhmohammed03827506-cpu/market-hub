# MARKET HUB: Northflank migration

## Safety rules

- Keep Render live until every verification gate passes.
- Do not point the production domain at Northflank during staging.
- Do not test payments, checkout webhooks, or importer publishing against production data.
- Use a cloned PostgreSQL database and test-mode integration credentials first.

## Service configuration

- Build type: Dockerfile
- Dockerfile: `Dockerfile`
- Port: `8080` (the app also respects a platform-provided `PORT` override)
- Liveness path: `/api/healthz`
- Readiness/database path: `/api/readyz`
- Start command when buildpacks are used instead: `npm start`
- Build command when buildpacks are used instead: `corepack enable && pnpm install --frozen-lockfile --prod`
- Instances during migration: exactly 1

No persistent filesystem volume is required. Product, customer, cart/order, importer, and analytics records are PostgreSQL-backed; product media is stored as remote URLs. The app's admin and customer sessions are currently in memory, so a restart signs users out. Do not scale above one instance until sessions are moved to a shared store or signed durable cookies.

## Environment variables

Create Northflank secrets from `.env.northflank.example`. Copy values from Render privately; never commit actual values. `PORT` is assigned by the platform. Confirm that `DATABASE_URL` requires TLS and that the database permits Northflank connections.

## PostgreSQL migration

1. Identify the current PostgreSQL provider, version, size, extensions, and backup/restore support.
2. Create a Northflank PostgreSQL database with the same or newer major version.
3. Make a provider backup and verify it can be restored. Keep that backup unchanged for rollback.
4. Restore a snapshot into the new database using `pg_dump --format=custom --no-owner --no-acl` and `pg_restore --no-owner --no-acl` (or the providers' managed backup tools).
5. Run `/api/readyz`, then compare row counts for users, products, orders, order_items, shipments, product imports, and recommendation events.
6. Test only against the cloned database.
7. For final cutover, schedule a short write freeze, take a final backup, restore the final snapshot, rerun row-count checks, deploy Northflank with production secrets, and then switch traffic.
8. Keep Render configured and available for rollback. Avoid writes to both databases after cutover because the app has no replication or reconciliation layer.

The schema includes a base `schema.sql`, a v42 importer migration, and idempotent runtime migrations in `db.js`. Do not run the base schema over the existing production database. Restore the database first; let normal application paths apply their guarded runtime migrations.

## Verification gates

Use the Northflank preview URL and staging data.

1. `/api/healthz` returns HTTP 200 and `/api/readyz` returns HTTP 200.
2. Storefront loads on desktop/mobile; catalogue, search, product pages, cart, wishlist, PWA assets, and customer registration/login work.
3. Admin login, product management, orders, tracking, reports, and importer draft/analyse/publish work.
4. Shiprocket catalogue/config endpoints work with test credentials; perform a test checkout and confirm webhook receipt without creating a live shipment.
5. Razorpay test-mode order creation, signature verification, and webhook verification work.
6. Confirm one controlled test order appears correctly in customer and admin views.
7. Review Northflank logs for errors and verify restart behavior. Existing sessions being logged out after restart is expected.

## Cutover and rollback

Cut over only after all gates pass and a fresh database backup exists. Lower DNS TTL in advance if a custom domain is used. If a critical issue appears, point traffic back to Render and restore its original database connection. Before rollback, stop writes on Northflank to avoid split-brain data.

Render must not be deleted until Northflank has run successfully through an agreed observation period and backups have been tested.
