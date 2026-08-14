(() => {
  'use strict';
  const store = window.MarketHubStorefront;
  const sku = new URLSearchParams(location.search).get('sku');
  const $ = id => document.getElementById(id);
  let currentProduct;

  async function loadReviews() {
    const holder = $('approvedReviews');
    try {
      const response = await fetch(`/api/reviews?sku=${encodeURIComponent(sku)}`, { cache: 'no-store' });
      const data = await response.json();
      holder.innerHTML = data.reviews?.length ? data.reviews.map(review => `<article class="review"><b>${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</b><small>${store.escapeHtml(review.customer)}</small><p>${store.escapeHtml(review.body)}</p></article>`).join('') : '<p>No customer reviews yet.</p>';
    } catch {
      holder.innerHTML = '<p>Reviews will appear here soon.</p>';
    }
  }
  async function checkDelivery() {
    const input = $('deliveryPincode');
    const result = $('deliveryResult');
    const pincode = input.value.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(pincode)) { result.textContent = 'Enter a valid 6-digit pincode.'; return; }
    result.textContent = 'Checking delivery availability…';
    try {
      const response = await fetch(`/api/shipping/estimate?pincode=${encodeURIComponent(pincode)}`);
      const data = await response.json();
      result.textContent = data.serviceable ? (data.message || 'Delivery is available. Checkout will confirm the date.') : (data.message || 'This pincode is not serviceable.');
      localStorage.setItem('mh-delivery-pincode', pincode);
    } catch {
      result.textContent = 'Delivery estimate is temporarily unavailable.';
    }
  }
  async function init() {
    try {
      const data = await store.fetchProducts({ page: 1, limit: store.PAGE_SIZE, q: sku });
      currentProduct = data.products.find(item => String(item.sku) === String(sku));
      if (!currentProduct) throw new Error('Product not found.');
      store.registerProducts([currentProduct]);
      $('crumbName').textContent = currentProduct.name;
      document.title = `${currentProduct.name} | MARKET HUB`;
      $('productDetail').innerHTML = `<section>
        <div class="gallery-main"><img id="mainImage" loading="eager" src="${store.escapeHtml(currentProduct.image_url)}" alt="${store.escapeHtml(currentProduct.name)}"></div>
      </section><section class="details">
        <span class="tag">${store.escapeHtml(currentProduct.category)}</span><button class="mh-product-wish mh-wishlist-heart${store.isWished(currentProduct.sku)?' is-wished':''}" type="button" data-mh-wishlist-toggle="${store.escapeHtml(currentProduct.sku)}" aria-label="Save product" aria-pressed="${store.isWished(currentProduct.sku)}">${store.isWished(currentProduct.sku)?'♥':'♡'}</button><h1>${store.escapeHtml(currentProduct.name)}</h1>
        <p class="sku">Product code: ${store.escapeHtml(currentProduct.sku)}</p>
        <div class="detail-price">${store.money(currentProduct.price_inr)}</div>
        <span class="stock">In stock · ${Number(currentProduct.stock_quantity || 0)} units ready</span>
        <p class="detail-note">${store.escapeHtml(currentProduct.description || 'Quality-checked MARKET HUB product.')}</p>
        <div class="qty-row"><label>Qty <input id="quantity" type="number" min="1" max="${Number(currentProduct.stock_quantity || 99)}" value="1"></label>
          <button class="primary" id="addCart" type="button" data-mh-add-to-cart="${store.escapeHtml(currentProduct.sku)}" data-mh-quantity-source="quantity">Add to cart</button><button class="secondary" id="shareProduct" type="button">Share</button>
        </div>
        <div class="detail-box" id="deliveryChecker"><h2>Check delivery</h2><p id="deliveryResult">Enter pincode to check delivery.</p>
          <div class="qty-row"><label>Pincode <input id="deliveryPincode" inputmode="numeric" maxlength="6" placeholder="6-digit PIN"></label><button class="secondary" id="checkDelivery" type="button">Check</button></div>
        </div>
        <div class="detail-box product-reviews"><h2>Customer reviews</h2><div id="approvedReviews"><p>Loading reviews…</p></div></div>
      </section>`;
      $('checkDelivery').addEventListener('click', checkDelivery);
      $('shareProduct').addEventListener('click', () => navigator.share ? navigator.share({ title: currentProduct.name, url: location.href }) : navigator.clipboard.writeText(location.href));
      loadReviews();
      const related = await store.fetchProducts({ page: 1, limit: 8, category: currentProduct.category });
      store.renderGrid($('relatedGrid'),related.products.filter(item => item.sku !== currentProduct.sku).slice(0,4));
    } catch (error) {
      $('productDetail').innerHTML = `<p>${store.escapeHtml(error.message)} <a href="shop.html">Browse all products</a>.</p>`;
    }
  }
  init();
})();
