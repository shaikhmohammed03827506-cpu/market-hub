# Shiprocket Checkout settings for MARKET HUB

Production store URL: `https://market-hub-india.vercel.app`

1. In Shiprocket Checkout, create or open a **Custom Platform** store for `https://market-hub-india.vercel.app`.
2. Configure the public catalogue endpoints if Shiprocket asks for them:
   - Products: `https://market-hub-india.vercel.app/api/shiprocket/catalog/products`
   - Collections: `https://market-hub-india.vercel.app/api/shiprocket/catalog/collections`
3. Keep the checkout access-token endpoint private to MARKET HUB. The checkout button calls `POST /api/checkout/shiprocket/access-token`; do not enter that route as a public catalogue URL.
4. Add the Shiprocket Checkout API key and secret to Vercel as private environment variables named `SHIPROCKET_CHECKOUT_API_KEY` and `SHIPROCKET_CHECKOUT_SECRET_KEY`. Keep `SHIPROCKET_CHECKOUT_BASE_URL=https://checkout-api.shiprocket.com`.
5. Configure payment methods in Shiprocket Checkout **Payment settings**. MARKET HUB does not force COD, UPI, cards, or net banking in browser code. Do not activate a paid plan or submit a payment without the owner's confirmation.
6. For delivery estimates, add `SHIPROCKET_PICKUP_PINCODE` as a private Vercel environment variable. It is never a browser value.
7. Configure the order webhook as `https://market-hub-india.vercel.app/api/webhooks/shiprocket-checkout/order` when the Custom Platform setup asks for it. Add the private custom header from step 9 to this endpoint as well; unsigned order webhooks are rejected.
8. To receive trusted lifecycle events, create a Real Time webhook with `https://market-hub-india.vercel.app/api/webhooks/shiprocket-checkout`.
9. Add a custom webhook header named `X-Market-Hub-Webhook-Secret` with the same value as the private Vercel variable `SHIPROCKET_CHECKOUT_WEBHOOK_SECRET` on both order and lifecycle webhooks.
10. Add an Abandon Cart webhook to the lifecycle endpoint only after customer recovery consent/Engage is configured.

After Vercel redeploys, `GET /api/config/shiprocket-checkout` must return `{ "ready": true }`. Test only until the checkout window opens; do not place a live order or payment during connection testing.

Shiprocket currently provides a ₹50 trial wallet balance and charges 2% of the order value for each successful custom-platform Checkout API order. When the wallet is exhausted, the APIs stop until the wallet is recharged. Confirm current pricing in the dashboard before going live.

The storefront passes `https://market-hub-india.vercel.app/shop.html` as the SDK `fallbackUrl`, so customers return to the saved cart if Shiprocket is unavailable or rejects a payload.

The webhook handler accepts retries safely: each Shiprocket event id (or payload hash when no id is supplied) is stored once. Do not put any secret into the storefront, GitHub, or this document.

## Buyer mobile OTP

The embedded HeadlessCheckout script currently used by MARKET HUB documents cart handoff. v27 detects an SDK authentication surface without calling guessed methods. The existing MARKET HUB account login remains the secure fallback until Shiprocket enables and documents buyer OTP for this custom channel.

## Coins and custom discounts

Coins are calculated on the server and remain pending until a trusted Delivered event. Shiprocket Checkout must expose a supported store-discount/cart-discount field before MARKET HUB can submit a coin redemption into its hosted payment amount. Do not subtract coins only in the browser.
