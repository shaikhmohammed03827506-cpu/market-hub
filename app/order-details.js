(() => {
  'use strict';
  const box=document.getElementById('orderDetail');
  const number=new URLSearchParams(location.search).get('order');
  const esc=value=>String(value??'').replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  const money=value=>`₹${Number(value||0).toLocaleString('en-IN')}`;
  const date=value=>value?new Date(value).toLocaleString('en-IN'):'—';
  const address=value=>value?`${esc(value.fullName||'')}<br>${esc(value.line1||'')} ${esc(value.line2||'')}<br>${esc(value.city||'')}, ${esc(value.state||'')} ${esc(value.pincode||'')}<br>${esc(value.phone||'')}`:'Not available';
  const options=value=>Object.entries(value||{}).map(([name,selected])=>`${name}: ${selected}`).join(' / ');

  async function load(){
    try{
      const response=await fetch(`/api/customer/orders/${encodeURIComponent(number)}`,{cache:'no-store'});
      if(response.status===401){location.href='/login.html?redirect='+encodeURIComponent(`/order-details.html?order=${number||''}`);return;}
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      const order=data.order,shipment=order.shipment||{};
      const timeline=order.timeline.length?order.timeline:[{status:'order placed',createdAt:order.createdAt},{status:order.status,createdAt:shipment.updated_at||order.createdAt}];
      box.innerHTML=`<div class="view-heading"><div><h1>Order MH${order.orderNumber}</h1><p class="muted">Placed ${date(order.createdAt)}</p></div><a class="invoice-button" href="/api/customer/orders/${order.orderNumber}/invoice">Download invoice</a></div>
        <section class="detail-grid"><article class="panel"><h2>Products</h2>${order.items.map(item=>`<div class="detail-item"><img loading="lazy" src="${esc(item.image||'assets/favicon.svg')}" alt=""><div><b>${esc(item.name)}</b><span>${esc(item.sku)} · Qty ${item.quantity}</span>${options(item.options)?`<small>${esc(options(item.options))}</small>`:''}</div><strong>${money(Number(item.price)*item.quantity)}</strong></div>`).join('')}</article>
        <article class="panel"><h2>Order summary</h2><p>Subtotal <b>${money(order.subtotalInr)}</b></p><p>Discount <b>−${money(order.discountInr)}</b></p><p>Shipping <b>${money(order.shippingInr)}</b></p><p>GST <b>${money(order.gstInr)}</b></p><p>Wallet used <b>−${money(order.walletUsedInr)}</b></p><p class="total">Total <b>${money(order.totalInr)}</b></p><p>Payment <b>${esc(order.paymentMethod)} · ${esc(order.paymentStatus)}</b></p></article>
        <article class="panel"><h2>Shipping address</h2><p>${address(order.shippingAddress)}</p><h2>Billing address</h2><p>${address(order.billingAddress)}</p></article>
        <article class="panel"><h2>Tracking</h2><p>Courier <b>${esc(shipment.courier_name||'Not assigned')}</b></p><p>AWB <b>${esc(shipment.awb||'Not assigned')}</b></p><p>Estimated delivery <b>${date(shipment.estimated_delivery_date)}</b></p>${shipment.tracking_url?`<a href="${esc(shipment.tracking_url)}" target="_blank" rel="noopener">Open courier tracking</a>`:''}</article></section>
        <section class="panel"><h2>Order timeline</h2>${timeline.map(item=>`<div class="timeline-step"><i>✓</i><div><b>${esc(item.status).replaceAll('_',' ')}</b><small>${date(item.createdAt)}</small><p>${esc(item.message||'')}</p></div></div>`).join('')}</section>`;
    }catch(error){box.innerHTML=`<div class="empty">${esc(error.message||'Order could not be loaded.')}</div>`;}
  }
  load();
})();
