# Shiprocket Checkout settings for v27

1. In Shiprocket Checkout, keep the existing Custom Channel enabled for the MARKET HUB domain.
2. Keep the existing product and access-token endpoints unchanged. The checkout button still calls `POST /api/checkout/shiprocket/access-token`.
3. Configure payment methods in Shiprocket Checkout **Payment settings**. MARKET HUB does not force COD, UPI, cards or net banking in browser code.
4. For delivery estimates, add `SHIPROCKET_PICKUP_PINCODE` as a private Render environment variable. It is never a browser value.
5. To receive trusted lifecycle events, create a Real Time webhook with the API endpoint `https://market-hub-vavf.onrender.com/api/webhooks/shiprocket-checkout`.
6. Add a custom webhook header named `X-Market-Hub-Webhook-Secret` with the same value as the private Render variable `SHIPROCKET_CHECKOUT_WEBHOOK_SECRET`.
7. Add an Abandon Cart webhook to the same endpoint. Enable customer recovery only after consent/Engage is configured.

The webhook handler accepts retries safely: each Shiprocket event id (or payload hash when no id is supplied) is stored once. Do not put any secret into the storefront, GitHub, or this document.

## Buyer mobile OTP

The embedded HeadlessCheckout script currently used by MARKET HUB documents cart handoff. v27 detects an SDK authentication surface without calling guessed methods. The existing MARKET HUB account login remains the secure fallback until Shiprocket enables and documents buyer OTP for this custom channel.

## Coins and custom discounts

Coins are calculated on the server and remain pending until a trusted Delivered event. Shiprocket Checkout must expose a supported store-discount/cart-discount field before MARKET HUB can submit a coin redemption into its hosted payment amount. Do not subtract coins only in the browser.
