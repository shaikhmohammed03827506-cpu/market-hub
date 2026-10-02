# v28 Smart Slide Cart testing

Automated checks performed before deployment:

- JavaScript syntax validation for server, cart, rewards and admin additions.
- Fresh bootstrap extraction order: v26 → v27 → v28.
- Public home page and invalid pincode API response.

Manual merchant checks after deployment:

1. Add a product as guest and as a signed-in customer: the right drawer opens after the success toast.
2. Desktop: close via X, Escape and backdrop. Mobile: drawer occupies full screen.
3. Change quantity, remove an item, check tumbler progress and pincode estimate.
4. Press checkout only after reviewing the cart; confirm Shiprocket hosted checkout opens.
5. Sign in, check the coin quote, then test a successful Shiprocket order. Coins should be pending.
6. Send one trusted Delivered webhook, then repeat it. The first makes coins available; the second must not add more.
7. Test cancellation, return and refund events to confirm a ledger reversal.
8. Test abandoned-cart webhook and confirm it does not create duplicate recovery messages.

Coin redemption is quoted and validated server-side. It is deliberately not subtracted from a hosted Shiprocket payment until Shiprocket provides a documented custom discount field for this checkout channel.
