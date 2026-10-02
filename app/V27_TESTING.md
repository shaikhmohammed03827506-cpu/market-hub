# v27 verification checklist

- Guest cart: add/remove/change quantity and confirm a single MARKET HUB cart is retained.
- Sign in fallback: confirm email/password login returns to the cart or storefront.
- Returning customer: confirm saved addresses and order history load in My Account.
- Infinite catalogue: search, select category/sort, scroll, use Load more, then return from a product page.
- Delivery: test a valid and an invalid pincode after setting the private pickup pincode.
- Checkout: test COD and then enable a prepaid method in Shiprocket Checkout Payment settings to verify it appears in hosted checkout.
- Coins: create an order, verify pending coins, send one trusted Delivered webhook, then repeat it to confirm no second award. Test cancellation/refund reversal.
- Webhooks: test real-time and abandoned-cart payloads with the configured secret header; confirm duplicate payloads are idempotent.

Live payment, Shiprocket OTP and provider webhook tests require the merchant dashboard credentials and cannot be simulated from the public frontend.
