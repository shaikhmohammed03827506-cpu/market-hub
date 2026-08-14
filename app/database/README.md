# MARKET HUB database

This folder contains the PostgreSQL foundation for the live MARKET HUB store.

It includes customers, addresses, products, orders, wallet refunds, coins, referrals, reviews, return requests and Delhivery shipments.

## Business rules already built into the schema

- Spend ₹100: earn 10 coins after delivery.
- Successful referral: 10 coins for both people (recorded in `referrals`).
- 1 coin: ₹1 discount at checkout.
- Wallet refunds: expire 12 months after the credit date.
- Returns: requested within 3 days from delivery.

## Next deployment step

Create a hosted PostgreSQL database (for example, Supabase, Neon, or a managed PostgreSQL service), then run `schema.sql` once. Store its private connection string as `DATABASE_URL` in the server environment—not in frontend files or chat.
