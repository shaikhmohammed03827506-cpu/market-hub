# MARKET HUB — Razorpay payment setup

The storefront now follows the secure Razorpay flow:

1. The server calculates the cart total and creates a Razorpay Order.
2. Razorpay Checkout collects the payment.
3. The server verifies Razorpay's returned signature before marking a payment as verified.
4. A webhook endpoint is available for later payment-status updates.

## Before testing

1. Create a Razorpay account and use **Test Mode** first.
2. Generate a Test Key ID and Test Key Secret in Razorpay Dashboard.
3. Copy `.env.example` to a private file named `.env` in this folder.
4. Paste the Test Key ID and Test Key Secret into `.env` only. Never add `.env` to a public upload or Git repository.
5. Start this server with the bundled Node.js runtime, then open `http://localhost:4173` rather than opening `index.html` directly.

## Before accepting real payments

1. Test checkout end-to-end in Razorpay Test Mode.
2. Configure a live webhook URL at `/api/webhooks/razorpay` and place its secret in `RAZORPAY_WEBHOOK_SECRET`.
3. Replace only the Test Mode keys with Live Mode keys after the end-to-end test succeeds.
4. Connect the order and payment endpoints to the production PostgreSQL database; the current server-side catalogue is a safe development placeholder.

The Razorpay Key Secret and webhook secret are private server credentials. Do not place either in browser JavaScript, HTML, or the public static hosting folder.
