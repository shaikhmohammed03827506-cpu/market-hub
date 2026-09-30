(() => {
  'use strict';
  if (window.__marketHubStorefrontV40Initialized) return;
  window.__marketHubStorefrontV40Initialized = true;

  const CART_KEY = 'mh-cart';
  const WISHLIST_KEY = 'mh-wishes';
  const PAGE_SIZE = 24;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const productKey = item => String(item.parentSku || item.sku || item.id);
  const cartLineKey = item => String(item.lineKey || (item.variantId || item.variantSku
    ? `variant:${item.variantId || item.variantSku}`
    : `product:${item.parentSku || item.sku || item.id}`));
  const optionEntries = value => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).filter(([, selected]) => String(selected || '').trim()) : [];
  const optionLabel = value => optionEntries(value).map(([name, selected]) => `${name}: ${selected}`).join(' / ');
  const normalizeProduct = item => {
    const price = Number(item.price_inr ?? item.price ?? 0);
    const originalPrice = Math.max(price, Number(item.original_price_inr ?? item.mrp_inr ?? item.compare_at_price_inr ?? price));
    const gallery = [...new Set([...(Array.isArray(item.gallery) ? item.gallery : []), item.image_url, item.img, item.image].map(String).filter(Boolean))];
    const options = (Array.isArray(item.options) ? item.options : []).map((option, position) => ({
      id: option.id || '', name: String(option.name || '').trim(), position: Number(option.position ?? position),
      values: (Array.isArray(option.values) ? option.values : []).map((value, valuePosition) => ({
        id: value && typeof value === 'object' ? value.id || '' : '',
        value: String(value && typeof value === 'object' ? value.value : value).trim(),
        position: Number(value && typeof value === 'object' ? value.position ?? valuePosition : valuePosition)
      })).filter(value => value.value)
    })).filter(option => option.name && option.values.length);
    const variants = (Array.isArray(item.variants) ? item.variants : []).map((variant, position) => {
      const variantPrice = Number(variant.price_inr ?? variant.price ?? price);
      const variantMrpValue = Number(variant.compare_at_price_inr ?? variant.mrp ?? originalPrice);
      const variantMrp = Math.max(variantPrice, Number.isFinite(variantMrpValue) ? variantMrpValue : variantPrice);
      const images = [...new Set([...(Array.isArray(variant.gallery) ? variant.gallery : []), ...(Array.isArray(variant.images) ? variant.images : []), variant.image_url, variant.image].map(String).filter(Boolean))];
      return {
        id: String(variant.id || ''), sku: String(variant.sku || ''), price: variantPrice, originalPrice: variantMrp,
        discount: variantMrp > variantPrice ? Math.round((variantMrp - variantPrice) / variantMrp * 100) : 0,
        stock: Math.max(0, Number(variant.stock_quantity ?? variant.stock ?? 0)),
        weightGrams: Math.max(1, Number(variant.weight_grams ?? variant.weightGrams ?? 500)),
        barcode: String(variant.barcode || ''), enabled: variant.is_enabled !== false && variant.enabled !== false,
        isDefault: Boolean(variant.is_default ?? variant.isDefault), options: variant.options && typeof variant.options === 'object' ? {...variant.options} : {},
        image: images[0] || gallery[0] || 'assets/market-hub-logo.png', gallery: images, position
      };
    });
    return ({
    id: item.id,
    sku: String(item.sku || item.id || ''),
    name: String(item.name || 'Product'),
    category: String(item.category || item.cat || 'General'),
    price,
    originalPrice,
    discount: originalPrice > price ? Math.round((originalPrice - price) / originalPrice * 100) : 0,
    rating: Number(item.average_rating ?? item.rating_value ?? item.rating ?? 4.5),
    coins: Math.max(0, Number(item.coins ?? Math.floor(price / 10))),
    image: String(item.image_url || item.img || item.image || gallery[0] || 'assets/market-hub-logo.png'), gallery,
    stock: Math.max(0, Number(item.stock_quantity ?? item.stock ?? 99)),
    delivery: String(item.delivery_label || 'Fast delivery'), options, variants, hasVariants: variants.length > 0
  });};

  function resolveVariant(product, selection) {
    const item = normalizeProduct(product);
    if (!item.variants.length) return null;
    if (typeof selection === 'string') return item.variants.find(variant => variant.id === selection || variant.sku === selection) || null;
    const selected = selection && typeof selection === 'object' ? selection : {};
    return item.variants.find(variant => item.options.every(option => String(variant.options[option.name] || '').toLowerCase() === String(selected[option.name] || '').toLowerCase())) || null;
  }

  function defaultVariant(product) {
    const item = normalizeProduct(product);
    return item.variants.find(variant => variant.enabled && variant.isDefault) || item.variants.find(variant => variant.enabled) || null;
  }

  function readCart() {
    try {
      const rows = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(rows) ? rows.map(row => {
        const parentSku = String(row.parentSku || row.productSku || row.sku || row.id || '');
        const variantId = String(row.variantId || row.productVariantId || '');
        const variantSku = String(row.variantSku || (variantId ? row.sku : '') || '');
        return {...row, parentSku, variantId:variantId || null, variantSku:variantSku || null,
          selectedOptions:row.selectedOptions && typeof row.selectedOptions === 'object' ? row.selectedOptions : {},
          lineKey:cartLineKey({...row,parentSku,variantId,variantSku})};
      }).filter(row => row.parentSku) : [];
    } catch {
      return [];
    }
  }

  let cart = readCart();
  let wishes = new Set(readWishlist());
  let productIndex = new Map();
  let initialized = false;
  let giftPreviewKey = '';
  let giftPreview = null;

  function readWishlist() {
    try {
      const rows = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
      return Array.isArray(rows) ? rows.map(String) : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCart();
    window.dispatchEvent(new CustomEvent('mh:cart-changed', { detail: { cart: [...cart] } }));
  }

  function saveWishlist() {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify([...wishes]));
    refreshWishlistUi();
    window.dispatchEvent(new CustomEvent('mh:wishlist-changed', { detail: { skus: [...wishes] } }));
  }

  function refreshWishlistUi() {
    document.querySelectorAll('#wishCount,[data-wishlist-count]').forEach(node => { node.textContent = wishes.size; });
    document.querySelectorAll('[data-mh-wishlist-toggle]').forEach(button => {
      const active = wishes.has(String(button.dataset.mhWishlistToggle));
      button.classList.toggle('is-wished', active);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? '♥' : '♡';
    });
  }

  async function toggleWishlist(key) {
    key = String(key);
    const saved = !wishes.has(key);
    saved ? wishes.add(key) : wishes.delete(key);
    saveWishlist();
    fetch('/api/customer/wishlist', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({sku:key,saved})}).catch(() => {});
  }

  async function syncWishlist() {
    try {
      const response = await fetch('/api/customer/wishlist', {credentials:'same-origin',cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.skus)) {
        wishes = new Set([...wishes, ...data.skus.map(String)]);
        saveWishlist();
      }
    } catch {}
  }

  function ensureCartUi() {
    if (!document.getElementById('marketHubMiniCart')) {
      document.querySelectorAll('#cartDrawer,#drawerBackdrop,.smart-cart-summary').forEach(node => node.remove());
      document.body.insertAdjacentHTML('beforeend', `
        <aside class="cart-drawer mh-universal-cart" id="marketHubMiniCart" aria-label="Shopping cart" aria-hidden="true">
          <div class="drawer-head"><h2>Your cart</h2><button class="close-drawer" type="button" aria-label="Close cart">×</button></div>
          <div id="cartItems" class="cart-items"></div>
          <div class="cart-footer">
            <section id="cartGiftProgress" class="mh-cart-gift-progress" aria-live="polite"></section>
            <div><span>Subtotal</span><b id="cartSubtotal">₹0</b></div>
            <small id="cartPaymentPolicy">Partial COD: 20% advance and the balance on delivery, with a separate ₹13 COD handling fee. Full COD is not available. Shipping is shown separately in secure checkout.</small>
            <button id="checkoutButton" class="button button-primary full" type="button">Checkout securely →</button>
          </div>
        </aside><div class="drawer-backdrop" id="marketHubMiniCartBackdrop"></div>
      `);
    }
  }

  function checkoutPayload() {
    return cart.map(item => ({
      sku:item.variantSku || item.parentSku || item.sku,
      variantSku:item.variantSku || undefined,
      variantId:item.variantId || undefined,
      qty:Math.max(1,Number(item.qty||1))
    }));
  }

  function fallbackGifts(subtotal) {
    const gifts=[];
    if (subtotal>=399) gifts.push({sku:'MH-GIFT-MYSTERY',name:'Free Mystery Gift',quantity:1,image:'assets/mystery-gift.png',kind:'mystery'});
    if (subtotal>=799) gifts[0] && (gifts[0].quantity=2);
    if (subtotal>=999) { if(gifts[0])gifts[0].quantity=3;gifts.push({sku:'MH-GIFT-TUMBLER',name:'Free Premium Tumbler',quantity:1,image:'assets/free-tumbler.png',kind:'tumbler'}); }
    return gifts;
  }

  function refreshGiftPreview() {
    const payload=checkoutPayload();
    const key=JSON.stringify(payload);
    if (key===giftPreviewKey) return;
    giftPreviewKey=key;giftPreview=null;
    if (!payload.length) return;
    fetch('/api/checkout/gift-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cart:payload})})
      .then(response=>response.ok?response.json():Promise.reject(new Error('Gift preview unavailable')))
      .then(data=>{if(giftPreviewKey===key){giftPreview=data;renderCart();}})
      .catch(()=>{if(giftPreviewKey===key){giftPreview={gifts:[],unavailable:true};renderCart();}});
  }

  function ensureStoreActions() {
    if (!document.querySelector('#wishlistButton,[data-wishlist-open]')) {
      const nav=document.querySelector('.topbar nav,.actions');
      nav?.insertAdjacentHTML('beforeend','<a href="wishlist.html" data-wishlist-open>Wishlist <i data-wishlist-count>0</i></a>');
    }
  }

  function renderCart() {
    ensureCartUi();
    const count = cart.reduce((sum, item) => sum + Math.max(1, Number(item.qty || 1)), 0);
    const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Math.max(1, Number(item.qty || 1)), 0);
    refreshGiftPreview();
    const gifts=Array.isArray(giftPreview?.gifts) ? giftPreview.gifts : [];
    document.querySelectorAll('#cartCount,.cart-count,[data-cart-count]').forEach(node => { node.textContent = count; });
    const subtotalNode = document.getElementById('cartSubtotal');
    if (subtotalNode) subtotalNode.textContent = money(subtotal);
    const giftProgress = document.getElementById('cartGiftProgress');
    if (giftProgress) {
      const mysteryQuantity=gifts.filter(gift=>gift.kind==='mystery').reduce((sum,gift)=>sum+Number(gift.quantity||0),0);
      const tumblerUnlocked=gifts.some(gift=>gift.kind==='tumbler');
      const eligibleSubtotal=Number.isFinite(Number(giftPreview?.subtotalInr))?Number(giftPreview.subtotalInr):subtotal;
      const target=eligibleSubtotal<399?399:eligibleSubtotal<799?799:eligibleSubtotal<999?999:null;
      const percent=Math.max(0,Math.min(100,eligibleSubtotal<=399?eligibleSubtotal/399*16.67:eligibleSubtotal<=799?16.67+(eligibleSubtotal-399)/400*33.33:50+(eligibleSubtotal-799)/200*33.33));
      const firstOrder=giftPreview?.authenticated&&giftPreview.hasPreviousOrder===false;
      giftProgress.innerHTML = `<div class="mh-reward-heading"><span>✦ THE GIFT CLUB</span><em>FREE REWARDS</em></div>
        <b>${!cart.length?'A little shopping. A lovely surprise.':target ? `Add ${money(target - eligibleSubtotal)} more for ${target===999?'a gift + FREE tumbler':'your next FREE gift'}` : 'Your gift collection is unlocked! ✨'}</b>
        <div class="mh-reward-path">
          <div class="mh-gift-meter" role="progressbar" aria-label="Product subtotal towards gift milestones" aria-valuemin="0" aria-valuemax="999" aria-valuenow="${Math.min(999,Math.max(0,eligibleSubtotal))}"><i style="width:${eligibleSubtotal>=999?100:percent}%"></i></div>
          <div class="mh-reward-stops">${[[399,'1 mystery gift'],[799,'2 mystery gifts'],[999,'3 gifts + tumbler']].map(([amount,label])=>`<div class="mh-reward-stop ${eligibleSubtotal>=amount?'is-unlocked':target===amount?'is-next':''}"><div class="mh-reward-orb"><img src="assets/${amount===999?'free-tumbler':'mystery-gift'}.png" alt="${amount===999?'Free tumbler reward':'Mystery gift reward'}"><i>${eligibleSubtotal>=amount?'✓':'✦'}</i></div><strong>₹${amount}</strong><span>${label}</span><small>${eligibleSubtotal>=amount?'UNLOCKED':target===amount?'UP NEXT':'LOCKED'}</small></div>`).join('')}</div>
        </div>
        ${firstOrder&&mysteryQuantity?'<small>✓ Your extra first-order mystery gift is included.</small>':!giftPreview?.authenticated?'<small>First order: 1 extra FREE gift, even at ₹1. Sign in to verify.</small>':''}
        ${giftPreview?.unavailable?'<small>Gift verification unavailable. Reopen cart to retry.</small>':!giftPreview&&cart.length?'<small>Checking gifts…</small>':''}`;
    }
    const paymentPolicy = document.getElementById('cartPaymentPolicy');
    if (paymentPolicy) paymentPolicy.textContent = 'Partial COD for all order values: pay 20% in advance and the balance on delivery. A separate ₹13 COD handling fee applies once. Full COD is not available. Shipping and the final advance amount are confirmed in secure checkout.';
    const list = document.getElementById('cartItems');
    if (!list) return;
    const paidLines=cart.map(item => {
      const key = escapeHtml(cartLineKey(item));
      const qty = Math.max(1, Number(item.qty || 1));
      return `<article class="cart-row mh-cart-item">
        <img loading="lazy" src="${escapeHtml(item.img || 'assets/market-hub-logo.png')}" alt="${escapeHtml(item.name)}">
        <div><h4>${escapeHtml(item.name)}</h4>${(optionLabel(item.selectedOptions) || item.variantSku) ? `<small class="mh-cart-options">${escapeHtml(optionLabel(item.selectedOptions))}${item.variantSku ? ` · ${escapeHtml(item.variantSku)}` : ''}</small>` : ''}<p>${money(item.price)} × ${qty}</p>
          <div class="mh-cart-quantity">
            <button type="button" data-cart-qty="-1" data-cart-key="${key}" aria-label="Decrease quantity">−</button>
            <b>${qty}</b>
            <button type="button" data-cart-qty="1" data-cart-key="${key}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button type="button" data-cart-remove="${key}">Remove</button>
      </article>`;
    }).join('');
    const giftLines=gifts.map(gift=>`<article class="cart-row mh-cart-item mh-cart-gift-item">
      <img loading="lazy" src="${escapeHtml(gift.image || (gift.kind==='tumbler'?'assets/free-tumbler.png':'assets/mystery-gift.png'))}" alt="${escapeHtml(gift.name)}">
      <div><span class="mh-cart-gift-badge">FREE GIFT</span><h4>${escapeHtml(gift.name)}</h4><p>₹0 × ${Math.max(1,Number(gift.quantity||1))} · Added automatically</p></div>
      <strong>FREE</strong>
    </article>`).join('');
    list.innerHTML = cart.length ? `${paidLines}${giftLines}` : '<p class="empty-state">Your cart is waiting for something good.</p>';
  }

  function openCart() {
    ensureCartUi();
    giftPreviewKey='';
    renderCart();
    document.getElementById('marketHubMiniCart').classList.add('open');
    document.getElementById('marketHubMiniCartBackdrop').classList.add('show');
    document.getElementById('marketHubMiniCart').setAttribute('aria-hidden', 'false');
    document.body.classList.add('mh-cart-lock');
  }

  function closeCart() {
    document.getElementById('marketHubMiniCart')?.classList.remove('open');
    document.getElementById('marketHubMiniCartBackdrop')?.classList.remove('show');
    document.getElementById('marketHubMiniCart')?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mh-cart-lock');
  }

  function registerProducts(items) {
    for (const raw of items || []) {
      const item = normalizeProduct(raw);
      if (item.sku) productIndex.set(productKey(item), item);
    }
  }

  function addToCart(item, options = {}) {
    const product = normalizeProduct(item);
    registerProducts([product]);
    const variant = product.hasVariants ? resolveVariant(product, options.variantId || options.selectedOptions) : null;
    if (product.hasVariants && !variant) throw new Error('Choose all product options before adding this item.');
    if (variant && (!variant.enabled || variant.stock < 1)) throw new Error('This product variant is currently unavailable.');
    if (!variant && product.stock < 1) throw new Error('This product is currently out of stock.');
    const line = {
      id:product.id, productId:product.id, parentSku:product.sku, sku:variant?.sku || product.sku,
      variantId:variant?.id || null, variantSku:variant?.sku || null, selectedOptions:variant?.options || {},
      name:product.name, price:variant?.price ?? product.price, img:variant?.image || product.image,
      stock:variant?.stock ?? product.stock
    };
    line.lineKey = cartLineKey(line);
    const found = cart.find(row => cartLineKey(row) === line.lineKey);
    const amount = Math.max(1, Math.min(99, Number(options.quantity) || 1));
    const maximum = Math.max(1, Number(line.stock || 0));
    if (found) found.qty = Math.min(maximum, Number(found.qty || 1) + amount);
    else cart.push({...line, qty:Math.min(maximum, amount)});
    saveCart();
    openCart();
    const drawer = document.getElementById('marketHubMiniCart');
    drawer.classList.remove('mh-cart-success');
    requestAnimationFrame(() => drawer.classList.add('mh-cart-success'));
    setTimeout(() => drawer.classList.remove('mh-cart-success'), 700);
  }

  function changeQuantity(key, delta) {
    const item = cart.find(row => cartLineKey(row) === String(key));
    if (!item) return;
    item.qty = Math.max(1, Math.min(Math.max(1, Number(item.stock || 99)), Number(item.qty || 1) + Number(delta || 0)));
    saveCart();
  }

  function remove(key) {
    cart = cart.filter(row => cartLineKey(row) !== String(key));
    saveCart();
  }

  async function checkout(button) {
    if (!cart.length) return openCart();
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Opening secure checkout…';
    try {
      const configResponse = await fetch('/api/config/shiprocket-checkout', { cache: 'no-store' });
      const config = await configResponse.json();
      if (!config.ready) throw new Error('Shiprocket Checkout is not connected yet.');
      if (!window.HeadlessCheckout || typeof window.HeadlessCheckout.addToCart !== 'function') {
        throw new Error('Secure checkout could not load. Please refresh and try again.');
      }
      const response = await fetch('/api/checkout/shiprocket/access-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: checkoutPayload() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Checkout could not start.');
      window.HeadlessCheckout.addToCart(new Event('click'), data.token, {
        fallbackUrl: `${location.origin}/shop.html`
      });
    } catch (error) {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = error.message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
      } else {
        alert(error.message);
      }
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function card(raw, options = {}) {
    const item = normalizeProduct(raw);
    registerProducts([item]);
    const key = escapeHtml(productKey(item));
    const url = `product.html?sku=${encodeURIComponent(item.sku)}`;
    const wished = wishes.has(String(item.sku));
    const initial = defaultVariant(item);
    const displayPrice = initial?.price ?? item.price;
    const displayOriginal = initial?.originalPrice ?? item.originalPrice;
    const displayDiscount = initial?.discount ?? item.discount;
    const displayStock = initial?.stock ?? item.stock;
    const displayImage = initial?.image || item.image;
    const controls = item.hasVariants ? `<div class="mh-card-options" aria-label="Choose product options">${item.options.map(option => `<label>${escapeHtml(option.name)}<select data-mh-card-option="${escapeHtml(option.name)}">${option.values.map(value => `<option value="${escapeHtml(value.value)}"${String(initial?.options?.[option.name] || '').toLowerCase() === value.value.toLowerCase() ? ' selected' : ''}>${escapeHtml(value.value)}</option>`).join('')}</select></label>`).join('')}</div>` : '';
    return `<article class="shop-card mh-product-card" data-product-key="${key}" data-mh-product-key="${key}">
      <span class="mh-discount-badge">${displayDiscount ? `${displayDiscount}% OFF` : 'BEST VALUE'}</span>
      <button class="mh-wishlist-heart${wished ? ' is-wished' : ''}" type="button" data-mh-wishlist-toggle="${key}" aria-label="Save ${escapeHtml(item.name)} to wishlist" aria-pressed="${wished}">${wished ? '♥' : '♡'}</button>
      <a class="shop-image" href="${url}"><img loading="lazy" decoding="async" src="${escapeHtml(displayImage)}" alt="${escapeHtml(item.name)}"></a>
      <div class="shop-card-copy">
        <span>${escapeHtml(item.category)}</span>
        <h3><a href="${url}">${escapeHtml(item.name)}</a></h3>
        <div class="mh-rating" aria-label="${item.rating.toFixed(1)} out of 5">★ ${item.rating.toFixed(1)}</div>
        <div class="mh-card-price"><b>${money(displayPrice)}</b><del>${money(displayOriginal)}</del></div>
        ${controls}
        <div class="mh-card-meta"><small>✦ ${item.coins} Coins</small><small>${item.stock} in stock</small><small>⚡ ${escapeHtml(item.delivery)}</small></div>
        <button type="button" data-mh-add-to-cart="${key}"${initial ? ` data-mh-variant-id="${escapeHtml(initial.id)}"` : ''}${displayStock < 1 ? ' disabled' : ''}>${displayStock < 1 ? 'Out of stock' : (options.buttonText || 'Quick add')}</button>
      </div>
    </article>`;
  }

  function renderGrid(target, items, {append=false, empty='No products found.'}={}) {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) return 0;
    registerProducts(items);
    const html = (items || []).map(item => card(item)).join('');
    if (append) node.insertAdjacentHTML('beforeend', html);
    else node.innerHTML = html || `<p class="empty">${escapeHtml(empty)}</p>`;
    refreshWishlistUi();
    return (items || []).length;
  }

  function createInfiniteGrid({grid, status, sentinel, loadPage, pageSize=PAGE_SIZE, rootMargin='600px'}) {
    const seen = new Set();
    let page=1, loading=false, ended=false;
    async function load({reset=false}={}) {
      if (loading || (ended && !reset)) return;
      if (reset) { page=1; ended=false; seen.clear(); grid.innerHTML=''; }
      loading=true;
      status.innerHTML='<span class="mh-spinner"></span> Loading products…';
      try {
        const data=await loadPage(page,pageSize);
        const unique=(data.products||[]).filter(item=>{const key=productKey(item);if(seen.has(key))return false;seen.add(key);return true;});
        renderGrid(grid,unique,{append:true});
        page+=1;
        ended=data.hasMore===false || data.products.length<pageSize;
        status.textContent=ended?(seen.size?'You’ve reached the end.':'No products found.'):'';
      } catch {
        status.innerHTML='<button type="button" data-grid-retry>Retry loading products</button>';
      } finally { loading=false; }
    }
    const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
      if(scrollY>100&&entries.some(entry=>entry.isIntersecting))load();
    },{rootMargin}):null;
    if(observer&&sentinel)observer.observe(sentinel);
    status.addEventListener('click',event=>{if(event.target.closest('[data-grid-retry]'))load({reset:page===1});});
    return {load,reset:()=>load({reset:true}),destroy:()=>observer?.disconnect(),get size(){return seen.size;}};
  }

  async function fetchProducts({ page = 1, limit = PAGE_SIZE, q = '', category = '', sort = 'latest', signal } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(Math.min(PAGE_SIZE, limit)), sort });
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    const response = await fetch(`/api/products?${params}`, { cache: 'no-store', signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Products could not be loaded.');
    registerProducts(data.products);
    return data;
  }

  function updateCardVariant(select) {
    const cardNode = select.closest('[data-mh-product-key]');
    const product = cardNode && productIndex.get(String(cardNode.dataset.mhProductKey));
    if (!product) return;
    const selected = {};
    cardNode.querySelectorAll('[data-mh-card-option]').forEach(control => { selected[control.dataset.mhCardOption] = control.value; });
    const variant = resolveVariant(product, selected);
    const addButton = cardNode.querySelector('[data-mh-add-to-cart]');
    const price = cardNode.querySelector('.mh-card-price b');
    const original = cardNode.querySelector('.mh-card-price del');
    const discount = cardNode.querySelector('.mh-discount-badge');
    const stock = cardNode.querySelector('.mh-card-meta small:nth-child(2)');
    const image = cardNode.querySelector('.shop-image img');
    if (!variant || !variant.enabled || variant.stock < 1) {
      addButton.disabled = true;
      addButton.removeAttribute('data-mh-variant-id');
      addButton.textContent = variant ? 'Out of stock' : 'Unavailable combination';
      if (stock) stock.textContent = 'Unavailable';
      return;
    }
    addButton.disabled = false;
    addButton.dataset.mhVariantId = variant.id;
    addButton.textContent = 'Quick add';
    if (price) price.textContent = money(variant.price);
    if (original) original.textContent = money(variant.originalPrice);
    if (discount) discount.textContent = variant.discount ? `${variant.discount}% OFF` : 'BEST VALUE';
    if (stock) stock.textContent = `${variant.stock} in stock`;
    if (image) image.src = variant.image;
  }

  function handleClick(event) {
    const cartOpen = event.target.closest('#cartButton,.cart-link,[data-cart-open]');
    const close = event.target.closest('.close-drawer,#marketHubMiniCartBackdrop');
    const addButton = event.target.closest('[data-mh-add-to-cart]');
    const qty = event.target.closest('[data-cart-qty]');
    const removeButton = event.target.closest('[data-cart-remove]');
    const checkoutButton = event.target.closest('#checkoutButton');
    const wishlistButton = event.target.closest('[data-mh-wishlist-toggle]');
    const wishlistOpen = event.target.closest('#wishlistButton,[data-wishlist-open]');
    if (cartOpen) { event.preventDefault(); openCart(); }
    if (close) closeCart();
    if (addButton) {
      event.preventDefault();
      event.stopPropagation();
      const item = productIndex.get(String(addButton.dataset.mhAddToCart));
      const quantitySource = addButton.dataset.mhQuantitySource && document.getElementById(addButton.dataset.mhQuantitySource);
      try {
        if (item) addToCart(item, {quantity:Number(quantitySource?.value || 1),variantId:addButton.dataset.mhVariantId || ''});
      } catch (error) {
        const toast = document.getElementById('toast');
        if (toast) { toast.textContent=error.message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3000); }
        else alert(error.message);
      }
    }
    if (qty) changeQuantity(qty.dataset.cartKey, qty.dataset.cartQty);
    if (removeButton) remove(removeButton.dataset.cartRemove);
    if (checkoutButton) checkout(checkoutButton);
    if (wishlistButton) { event.preventDefault(); event.stopPropagation(); toggleWishlist(wishlistButton.dataset.mhWishlistToggle); }
    if (wishlistOpen) { event.preventDefault(); location.href='wishlist.html'; }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    ensureStoreActions();
    ensureCartUi();
    document.addEventListener('click', handleClick, true);
    document.addEventListener('change', event => { if (event.target.matches('[data-mh-card-option]')) updateCardVariant(event.target); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCart(); });
    window.addEventListener('storage', event => { if (event.key === CART_KEY) { cart = readCart(); renderCart(); } });
    window.addEventListener('storage', event => { if (event.key === WISHLIST_KEY) { wishes = new Set(readWishlist()); refreshWishlistUi(); } });
    renderCart();
    refreshWishlistUi();
    syncWishlist();
    if (new URLSearchParams(location.search).get('cart') === 'open') openCart();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=48-gift-reward-path-1').catch(() => {});
  }

  window.MarketHubStorefront = {
    PAGE_SIZE, init, card, addToCart, openMiniCart:openCart, remove, changeQuantity, openCart, closeCart,
    registerProducts, fetchProducts, renderGrid, createInfiniteGrid, toggleWishlist, normalizeProduct, resolveVariant, defaultVariant, optionLabel,
    getWishlist: () => [...wishes], isWished:key=>wishes.has(String(key)),
    getCart: () => [...cart], money, escapeHtml
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
