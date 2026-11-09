'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const delhivery = require('../delhivery');

const config = {
  token:'private-test-token',baseUrl:'https://staging-express.delhivery.com',clientName:'MARKET HUB TEST',
  pickupLocation:'Test Warehouse',pickupPincode:'395003',pickupCity:'Surat',pickupState:'Gujarat',
  sellerName:'MARKET HUB',hsnCode:'851830',codEnabled:true
};

const order = {
  orderNumber:42,customer:'Test Customer',phone:'9876543210',line1:'Test Road',line2:'Near Park',
  city:'Ahmedabad',state:'Gujarat',pincode:'380015',paymentMethod:'cod',totalInr:1299,createdAt:'2026-08-15T10:00:00Z',
  weightGrams:700,lengthCm:15,breadthCm:12,heightCm:8,addressLabel:'Home',items:[{name:'Headphones',sku:'MH-1',quantity:1,price:1299}]
};

test('builds the mandatory Delhivery B2C shipment fields', () => {
  const payload=delhivery.shipmentPayload(order,config),shipment=payload.shipments[0];
  assert.equal(payload.pickup_location.name,'Test Warehouse');
  assert.equal(shipment.order,'MH42');
  assert.equal(shipment.payment_mode,'COD');
  assert.equal(shipment.cod_amount,'1299.00');
  assert.equal(shipment.pin,'380015');
  assert.equal(shipment.client,'MARKET HUB TEST');
});

test('blocks COD shipment creation when COD is disabled', () => {
  assert.throws(()=>delhivery.shipmentPayload(order,{...config,codEnabled:false}),/Cash on Delivery is disabled/);
});

test('reads prepaid and COD serviceability separately', () => {
  const data={delivery_codes:[{postal_code:{pre_paid:'Y',cod:'N',district:'Ahmedabad',state_code:'GJ'}}]};
  assert.equal(delhivery.serviceabilityResult(data,'Pre-paid').serviceable,true);
  assert.equal(delhivery.serviceabilityResult(data,'COD').serviceable,false);
});

test('sends private token in the server-side Authorization header', async () => {
  let captured;
  const fetchImpl=async (url,options)=>{captured={url,options};return{ok:true,status:200,text:async()=>JSON.stringify({delivery_codes:[{postal_code:{pre_paid:'Y',cod:'Y'}}]})}};
  const result=await delhivery.checkServiceability(config,'380015','COD',fetchImpl);
  assert.equal(result.serviceable,true);
  assert.equal(captured.options.headers.Authorization,'Token private-test-token');
  assert.match(captured.url,/filter_codes=380015/);
});

test('creates a form-encoded shipment and returns the waybill', async () => {
  let captured;
  const fetchImpl=async (url,options)=>{captured={url,options};return{ok:true,status:200,text:async()=>JSON.stringify({success:true,packages:[{waybill:'1234567890123',status:'Success',refnum:'MH42'}]})}};
  const result=await delhivery.createShipment(config,order,fetchImpl);
  assert.equal(result.awb,'1234567890123');
  assert.equal(captured.options.method,'POST');
  assert.match(captured.options.headers['Content-Type'],/x-www-form-urlencoded/);
  const form=new URLSearchParams(captured.options.body);
  assert.equal(form.get('format'),'json');
  assert.equal(JSON.parse(form.get('data')).shipments[0].order,'MH42');
});

test('does not accept a failed manifest as a shipment', () => {
  assert.throws(()=>delhivery.manifestResult({success:false,packages:[{status:'Fail',remarks:'Client warehouse is inactive'}]}),/inactive/);
});
