# MARKET HUB Delhivery setup

The integration is server-side. The Delhivery token is never returned to the storefront or admin browser.

## Private Vercel settings

Add these values to Production, Preview and Development:

```text
DELHIVERY_API_TOKEN=<existing live token from Delhivery One>
DELHIVERY_API_BASE_URL=https://track.delhivery.com
DELHIVERY_CLIENT_NAME=<exact, case-sensitive Delhivery client name>
DELHIVERY_PICKUP_LOCATION=<exact, case-sensitive active pickup-location name>
DELHIVERY_PICKUP_PINCODE=<six digits>
DELHIVERY_PICKUP_CITY=Surat
DELHIVERY_PICKUP_STATE=Gujarat
DELHIVERY_SELLER_NAME=MARKET HUB
DELHIVERY_SELLER_GSTIN=<GSTIN if applicable to the account>
DELHIVERY_HSN_CODE=<the correct HSN for the shipped products>
DELHIVERY_COD_ENABLED=false
```

Keep COD disabled until the Delhivery account confirms COD is enabled and the store's payment flow is ready.

Use **View** beside the existing token in Delhivery One. Do not click **Request Live API Token** during setup: that rotates the token and immediately invalidates the old one. Delhivery only reveals a newly generated token briefly.

## Safety behaviour

- Pincode serviceability is checked before every shipment.
- A live waybill can only be created from the signed-in admin panel after an order-specific confirmation.
- Repeated clicks cannot create a second waybill for the same MARKET HUB order.
- Creating a waybill does not schedule a pickup.
- A pickup request, wallet recharge, shipment cancellation and production-data changes remain manual.
- API errors are stored without the private token and shown to the admin for correction.

## Verification order

1. Confirm `/api/config/shipping` says `ready: true` without exposing the token.
2. Check one destination pincode through `/api/shipping/estimate?pincode=380015`.
3. Sign in to the admin panel and confirm that real orders appear under **Delhivery shipping**.
4. Validate the exact pickup-location name, client name, customer address, product HSN, weight and dimensions.
5. With a disposable internal test order only, confirm **Create waybill**. Do not use a customer order for the first test.
6. Verify the AWB in Delhivery One and refresh tracking in MARKET HUB.
7. Schedule a pickup only after the package is ready and the owner explicitly approves it.

Official references:

- Delhivery One: https://one.delhivery.com/
- B2C API documentation: https://one.delhivery.com/developer-portal/documents/b2c/
- API token guidance: https://help.delhivery.com/docs/api-token-generation
