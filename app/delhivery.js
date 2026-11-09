'use strict';

const DEFAULT_BASE_URL = 'https://track.delhivery.com';

const clean = (value, limit = 250) => String(value ?? '')
  .replace(/[&%#;\\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const pincode = value => String(value || '').replace(/\D/g, '').slice(0, 6);

function assertConfig(config) {
  if (!config.token) throw new Error('Delhivery API token is not configured.');
  if (!config.pickupLocation) throw new Error('Choose an active Delhivery pickup location first.');
  if (!config.clientName) throw new Error('Delhivery client name is not configured.');
}

async function request(config, endpoint, options = {}, fetchImpl = globalThis.fetch) {
  if (!config.token) throw new Error('Delhivery API token is not configured.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchImpl(`${(config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Token ${config.token}`,
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = {message:text}; }
    if (!response.ok) {
      const detail = clean(data?.error || data?.message || data?.detail || data?.rmk, 220);
      throw new Error(detail || `Delhivery returned service response ${response.status}.`);
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Delhivery took too long to respond. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function serviceabilityResult(data, paymentMode = 'Pre-paid') {
  const postal = data?.delivery_codes?.[0]?.postal_code || data?.delivery_codes?.[0] || null;
  if (!postal) return {serviceable:false,cod:false,message:'Delhivery does not currently service this pincode.'};
  const prepaid = String(postal.pre_paid ?? postal.prepaid ?? postal.delivery ?? 'Y').toUpperCase() !== 'N';
  const cod = String(postal.cod ?? postal.cash ?? 'N').toUpperCase() === 'Y';
  const needsCod = String(paymentMode).toUpperCase() === 'COD';
  const serviceable = needsCod ? cod : prepaid;
  return {
    serviceable,
    cod,
    district: clean(postal.district, 80) || null,
    state: clean(postal.state_code || postal.state, 80) || null,
    message: serviceable ? 'Delivery is available with Delhivery.' : needsCod ? 'Cash on Delivery is not available for this pincode.' : 'Prepaid delivery is not available for this pincode.'
  };
}

async function checkServiceability(config, destinationPincode, paymentMode = 'Pre-paid', fetchImpl) {
  const pin = pincode(destinationPincode);
  if (!/^\d{6}$/.test(pin)) return {serviceable:false,cod:false,message:'Enter a valid 6-digit pincode.'};
  const data = await request(config, `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pin)}`, {}, fetchImpl);
  return serviceabilityResult(data, paymentMode);
}

function shipmentPayload(order, config) {
  assertConfig(config);
  const pin = pincode(order.pincode);
  const phone = String(order.phone || '').replace(/\D/g, '').slice(-10);
  const address = clean([order.line1, order.line2].filter(Boolean).join(' '), 250);
  if (!/^\d{6}$/.test(pin) || !/^\d{10}$/.test(phone) || !address || !clean(order.city) || !clean(order.state)) {
    throw new Error('This order needs a complete delivery address and 10-digit phone number.');
  }
  if (!Array.isArray(order.items) || !order.items.length) throw new Error('This order has no products to ship.');
  const isCod = String(order.paymentMethod).toLowerCase() === 'cod';
  if (isCod && !config.codEnabled) throw new Error('Cash on Delivery is disabled in the Delhivery connection.');
  const weight = Math.max(100, Math.round(Number(order.weightGrams) || 500));
  const quantity = order.items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
  const shipment = {
    name: clean(order.customer, 100),
    add: address,
    pin,
    city: clean(order.city, 80),
    state: clean(order.state, 80),
    country: 'India',
    phone,
    order: `MH${String(order.orderNumber)}`,
    payment_mode: isCod ? 'COD' : 'Pre-paid',
    return_pin: pincode(config.pickupPincode) || undefined,
    return_city: clean(config.pickupCity, 80) || undefined,
    return_state: clean(config.pickupState, 80) || undefined,
    return_country: 'India',
    products_desc: clean(order.items.map(item => `${item.name} x${Math.max(1, Number(item.quantity) || 1)}`).join(', '), 200),
    hsn_code: clean(config.hsnCode, 20) || undefined,
    cod_amount: isCod ? Number(order.totalInr || 0).toFixed(2) : '0.00',
    order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace('T', ' '),
    total_amount: Number(order.totalInr || 0).toFixed(2),
    seller_name: clean(config.sellerName || 'MARKET HUB', 100),
    seller_gst_tin: clean(config.sellerGstin, 20) || undefined,
    quantity,
    weight,
    shipment_length: Math.max(1, Number(order.lengthCm) || 15),
    shipment_width: Math.max(1, Number(order.breadthCm) || 15),
    shipment_height: Math.max(1, Number(order.heightCm) || 10),
    shipping_mode: 'Surface',
    address_type: clean(order.addressLabel, 30) || 'home',
    client: clean(config.clientName, 100)
  };
  for (const key of Object.keys(shipment)) if (shipment[key] === undefined || shipment[key] === '') delete shipment[key];
  return {shipments:[shipment],pickup_location:{name:clean(config.pickupLocation, 180)}};
}

function manifestResult(data) {
  const item = data?.packages?.[0] || data?.package || {};
  const success = data?.success !== false && item?.status !== 'Fail' && !item?.remarks && Boolean(item?.waybill || data?.waybill);
  if (!success) throw new Error(clean(item?.remarks || item?.remark || data?.rmk || data?.error || data?.message, 240) || 'Delhivery could not create this shipment.');
  return {
    awb: String(item.waybill || data.waybill),
    status: clean(item.status || data.status || 'created', 80),
    providerOrderId: String(item.refnum || item.order || data.order || ''),
    raw: data
  };
}

async function createShipment(config, order, fetchImpl) {
  const payload = shipmentPayload(order, config);
  const body = new URLSearchParams({format:'json',data:JSON.stringify(payload)}).toString();
  const data = await request(config, '/api/cmu/create.json', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body
  }, fetchImpl);
  return manifestResult(data);
}

function trackingResult(data, awb) {
  const item = data?.ShipmentData?.[0]?.Shipment || data?.shipment || data?.packages?.[0] || {};
  const scan = item?.Scans?.[0]?.ScanDetail || item?.Status || {};
  const status = clean(scan?.Scan || scan?.Status || item?.Status?.Status || item?.status || 'In transit', 100);
  return {awb:String(item?.AWB || item?.waybill || awb),status,raw:data};
}

async function trackShipment(config, awb, fetchImpl) {
  const value = String(awb || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  if (!value) throw new Error('A valid Delhivery waybill is required.');
  const data = await request(config, `/api/v1/packages/json/?waybill=${encodeURIComponent(value)}`, {}, fetchImpl);
  return trackingResult(data, value);
}

module.exports = {clean,pincode,serviceabilityResult,checkServiceability,shipmentPayload,manifestResult,createShipment,trackingResult,trackShipment};
