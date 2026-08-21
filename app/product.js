(() => {
  'use strict';
  const store = window.MarketHubStorefront;
  const sku = new URLSearchParams(location.search).get('sku');
  const $ = id => document.getElementById(id);
  let currentProduct;
  let selectedOptions = {};

  async function loadReviews() {
    const holder = $('approvedReviews');
    try {
      const response = await fetch(`/api/reviews?sku=${encodeURIComponent(sku)}`, { cache: 'no-store' });
      const data = await response.json();
      holder.innerHTML = data.reviews?.length ? data.reviews.map(review => `<article class="review"><b>${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</b><small>${store.escapeHtml(review.customer)}</small><p>${store.escapeHtml(review.body)}</p></article>`).join('') : '<p>No customer reviews yet.</p>';
    } catch { holder.innerHTML = '<p>Reviews will appear here soon.</p>'; }
  }

  async function checkDelivery() {
    const input = $('deliveryPincode');
    const result = $('deliveryResult');
    const pincode = input.value.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(pincode)) { result.textContent = 'Enter a valid 6-digit pincode.'; return; }
    result.textContent = 'Checking delivery availability...';
    try {
      const response = await fetch(`/api/shipping/estimate?pincode=${encodeURIComponent(pincode)}`);
      const data = await response.json();
      result.textContent = data.serviceable ? (data.message || 'Delivery is available. Checkout will confirm the date.') : (data.message || 'This pincode is not serviceable.');
      localStorage.setItem('mh-delivery-pincode', pincode);
    } catch { result.textContent = 'Delivery estimate is temporarily unavailable.'; }
  }

  function renderGallery(images, active) {
    const unique = [...new Set((images || []).filter(Boolean))];
    const main = $('mainImage');
    if (main && active) main.src = active;
    const holder = $('productGalleryThumbs');
    if (!holder) return;
    holder.innerHTML = unique.map((image, index) => `<button type="button" class="${image === active || (!active && index === 0) ? 'is-active' : ''}" data-gallery-image="${store.escapeHtml(image)}" aria-label="View product image ${index + 1}"><img loading="lazy" src="${store.escapeHtml(image)}" alt=""></button>`).join('');
  }

  function currentSelection() {
    const selection = {};
    document.querySelectorAll('[data-product-option]:checked').forEach(input => { selection[input.dataset.productOption] = input.value; });
    return selection;
  }

  function optionCanMatch(optionName, value, selection) {
    const optionPosition = currentProduct.options.findIndex(option => option.name === optionName);
    return currentProduct.variants.some(variant => variant.enabled && variant.stock > 0 && currentProduct.options.every(option => {
      const position = currentProduct.options.findIndex(candidate => candidate.name === option.name);
      const required = option.name === optionName ? value : (position < optionPosition ? selection[option.name] : '');
      return !required || String(variant.options[option.name] || '').toLowerCase() === String(required).toLowerCase();
    }));
  }

  function updateVariant() {
    selectedOptions = currentSelection();
    document.querySelectorAll('[data-product-option]').forEach(input => {
      input.disabled = !optionCanMatch(input.dataset.productOption, input.value, selectedOptions);
      if (input.disabled && input.checked) input.checked = false;
    });
    selectedOptions = currentSelection();
    const complete = currentProduct.options.every(option => selectedOptions[option.name]);
    const variant = complete ? store.resolveVariant(currentProduct, selectedOptions) : null;
    const add = $('addCart');
    const status = $('variantStatus');
    add.removeAttribute('data-mh-variant-id');
    if (!complete) {
      add.disabled = true;
      status.className = 'mh-variant-status';
      status.textContent = 'Choose ' + currentProduct.options.filter(option => !selectedOptions[option.name]).map(option => option.name).join(' and ') + '.';
      return;
    }
    if (!variant || !variant.enabled || variant.stock < 1) {
      add.disabled = true;
      status.className = 'mh-variant-status is-error';
      status.textContent = 'This combination is unavailable.';
      return;
    }
    add.disabled = false;
    add.dataset.mhVariantId = variant.id;
    $('detailPrice').innerHTML = `${store.money(variant.price)}${variant.originalPrice > variant.price ? `<del>${store.money(variant.originalPrice)}</del><span class="mh-detail-discount">${variant.discount}% OFF</span>` : ''}`;
    $('productSku').textContent = variant.sku;
    $('productStock').textContent = `In stock · ${variant.stock} units ready`;
    $('quantity').max = String(variant.stock);
    $('quantity').value = String(Math.min(Math.max(1,Number($('quantity').value)||1),variant.stock));
    status.className = 'mh-variant-status';
    status.textContent = store.optionLabel(variant.options);
    renderGallery([...(variant.gallery || []), ...(currentProduct.gallery || [])], variant.image);
  }

  function variantControls(product) {
    if (!product.has_variants && !product.hasVariants) return '';
    return `<div class="mh-variant-options">${product.options.map(option => `<fieldset class="mh-variant-group"><legend>${store.escapeHtml(option.name)}</legend><div class="mh-variant-values">${option.values.map(value => `<label class="mh-variant-choice"><input type="radio" name="variant-${store.escapeHtml(option.name)}" value="${store.escapeHtml(value.value)}" data-product-option="${store.escapeHtml(option.name)}"><span>${store.escapeHtml(value.value)}</span></label>`).join('')}</div></fieldset>`).join('')}<small id="variantStatus" class="mh-variant-status">Choose all options to add this product.</small></div>`;
  }

  async function init() {
    try {
      if (!sku) throw new Error('Product not found.');
      const response = await fetch(`/api/products/${encodeURIComponent(sku)}`, {cache:'no-store'});
      const data = await response.json();
      if (!response.ok || !data.product) throw new Error(data.error || 'Product not found.');
      currentProduct = data.product;
      store.registerProducts([currentProduct]);
      const normalized = store.normalizeProduct(currentProduct);
      currentProduct = {...currentProduct, ...normalized, has_variants:normalized.hasVariants};
      const display = store.defaultVariant(currentProduct);
      const displayPrice = display?.price ?? normalized.price;
      const displayMrp = display?.originalPrice ?? normalized.originalPrice;
      const displayStock = display?.stock ?? normalized.stock;
      const displayImage = display?.image || normalized.image;
      $('crumbName').textContent = currentProduct.name;
      document.title = `${currentProduct.name} | MARKET HUB`;
      $('productDetail').innerHTML = `<section>
        <div class="gallery-main"><img id="mainImage" loading="eager" src="${store.escapeHtml(displayImage)}" alt="${store.escapeHtml(currentProduct.name)}"></div>
        <div id="productGalleryThumbs" class="mh-product-gallery-thumbs"></div>
      </section><section class="details">
        <span class="tag">${store.escapeHtml(currentProduct.category)}</span><button class="mh-product-wish mh-wishlist-heart${store.isWished(currentProduct.sku)?' is-wished':''}" type="button" data-mh-wishlist-toggle="${store.escapeHtml(currentProduct.sku)}" aria-label="Save product" aria-pressed="${store.isWished(currentProduct.sku)}">${store.isWished(currentProduct.sku)?'♥':'♡'}</button><h1>${store.escapeHtml(currentProduct.name)}</h1>
        <p class="sku">Product code: <span id="productSku">${store.escapeHtml(display?.sku || currentProduct.sku)}</span></p>
        <div class="detail-price" id="detailPrice">${store.money(displayPrice)}${displayMrp > displayPrice ? `<del>${store.money(displayMrp)}</del>` : ''}</div>
        <span class="stock" id="productStock">In stock · ${displayStock} units ready</span>
        <p class="detail-note">${store.escapeHtml(currentProduct.description || 'Quality-checked MARKET HUB product.')}</p>
        <section class="mh-gift-offer" aria-label="Free gift offers">
          <div><strong>🎁 Mystery gifts with your order</strong><span>₹399+ · 1 gift</span><span>₹799+ · 2 gifts</span><span>₹999+ · 3 gifts + free tumbler</span></div>
          <small>First orders receive one additional mystery gift. Gifts are added automatically in secure checkout while stock lasts.</small>
        </section>
        <p class="mh-payment-offer"><strong>Flexible payment:</strong> COD up to ₹1,499. Above ₹1,499, pay 20% now and the balance on delivery. ₹15 COD handling fee applies.</p>
        ${variantControls(currentProduct)}
        <div class="qty-row"><label>Qty <input id="quantity" type="number" min="1" max="${displayStock || 1}" value="1"></label>
          <button class="primary" id="addCart" type="button" data-mh-add-to-cart="${store.escapeHtml(currentProduct.sku)}" data-mh-quantity-source="quantity"${currentProduct.hasVariants || displayStock < 1 ? ' disabled' : ''}>Add to cart</button><button class="secondary" id="shareProduct" type="button">Share</button>
        </div>
        <div class="detail-box" id="deliveryChecker"><h2>Check delivery</h2><p id="deliveryResult">Enter pincode to check delivery.</p>
          <div class="qty-row"><label>Pincode <input id="deliveryPincode" inputmode="numeric" maxlength="6" placeholder="6-digit PIN"></label><button class="secondary" id="checkDelivery" type="button">Check</button></div>
        </div>
        <div class="detail-box product-reviews"><h2>Customer reviews</h2><div id="approvedReviews"><p>Loading reviews...</p></div></div>
      </section>`;
      renderGallery([...(display?.gallery || []), ...(normalized.gallery || [])], displayImage);
      document.querySelectorAll('[data-product-option]').forEach(input => input.addEventListener('change', updateVariant));
      $('productGalleryThumbs').addEventListener('click', event => { const button=event.target.closest('[data-gallery-image]');if(!button)return;renderGallery([...$('productGalleryThumbs').querySelectorAll('[data-gallery-image]')].map(node=>node.dataset.galleryImage),button.dataset.galleryImage); });
      $('checkDelivery').addEventListener('click', checkDelivery);
      $('shareProduct').addEventListener('click', () => navigator.share ? navigator.share({ title: currentProduct.name, url: location.href }) : navigator.clipboard.writeText(location.href));
      loadReviews();
      const related = await store.fetchProducts({ page: 1, limit: 8, category: currentProduct.category });
      store.renderGrid($('relatedGrid'), related.products.filter(item => item.sku !== currentProduct.sku).slice(0,4));
    } catch (error) {
      $('productDetail').innerHTML = `<p>${store.escapeHtml(error.message)} <a href="shop.html">Browse all products</a>.</p>`;
    }
  }
  init();
})();
