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
  const productKey = item => String(item.sku || item.id);
  const normalizeProduct = item => {
    const price = Number(item.price_inr ?? item.price ?? 0);
    const originalPrice = Math.max(price, Number(item.original_price_inr ?? item.mrp_inr ?? item.compare_at_price_inr ?? price));
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
    image: String(item.image_url || item.img || 'assets/market-hub-logo.png'),
    stock: Math.max(0, Number(item.stock_quantity ?? item.stock ?? 99)),
    delivery: String(item.delivery_label || 'Fast delivery')
  });};

  function readCart() {
    try {
      const rows = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  let cart = readCart();
  let wishes = new Set(readWishlist());
  let productIndex = new Map();
  let initialized = false;

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
            <div><span>Subtotal</span><b id="cartSubtotal">₹0</b></div>
            <small>Shipping, discounts and payment options are confirmed in secure checkout.</small>
            <button id="checkoutButton" class="button button-primary full" type="button">Checkout securely →</button>
          </div>
        </aside><div class="drawer-backdrop" id="marketHubMiniCartBackdrop"></div>
      `);
    }
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
    document.querySelectorAll('#cartCount,.cart-count,[data-cart-count]').forEach(node => { node.textContent = count; });
    const subtotalNode = document.getElementById('cartSubtotal');
    if (subtotalNode) subtotalNode.textContent = money(subtotal);
    const list = document.getElementById('cartItems');
    if (!list) return;
    list.innerHTML = cart.length ? cart.map(item => {
      const key = escapeHtml(productKey(item));
      const qty = Math.max(1, Number(item.qty || 1));
      return `<article class="cart-row mh-cart-item">
        <img loading="lazy" src="${escapeHtml(item.img || 'assets/market-hub-logo.png')}" alt="${escapeHtml(item.name)}">
        <div><h4>${escapeHtml(item.name)}</h4><p>${money(item.price)} × ${qty}</p>
          <div class="mh-cart-quantity">
            <button type="button" data-cart-qty="-1" data-cart-key="${key}" aria-label="Decrease quantity">−</button>
            <b>${qty}</b>
            <button type="button" data-cart-qty="1" data-cart-key="${key}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button type="button" data-cart-remove="${key}">Remove</button>
      </article>`;
    }).join('') : '<p class="empty-state">Your cart is waiting for something good.</p>';
  }

  function openCart() {
    ensureCartUi();
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
    const key = productKey(product);
    const found = cart.find(row => productKey(row) === key);
    const amount = Math.max(1, Math.min(99, Number(options.quantity) || 1));
    if (found) found.qty = Math.min(99, Number(found.qty || 1) + amount);
    else cart.push({ id: product.id, sku: product.sku, name: product.name, price: product.price, img: product.image, qty: amount });
    saveCart();
    openCart();
    const drawer = document.getElementById('marketHubMiniCart');
    drawer.classList.remove('mh-cart-success');
    requestAnimationFrame(() => drawer.classList.add('mh-cart-success'));
    setTimeout(() => drawer.classList.remove('mh-cart-success'), 700);
  }

  function changeQuantity(key, delta) {
    const item = cart.find(row => productKey(row) === String(key));
    if (!item) return;
    item.qty = Math.max(1, Math.min(99, Number(item.qty || 1) + Number(delta || 0)));
    saveCart();
  }

  function remove(key) {
    cart = cart.filter(row => productKey(row) !== String(key));
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
        body: JSON.stringify({ cart: cart.map(item => ({ sku: item.sku, qty: item.qty })) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Checkout could not start.');
      window.HeadlessCheckout.addToCart(new Event('click'), data.token);
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
    return `<article class="shop-card mh-product-card" data-product-key="${key}">
      <span class="mh-discount-badge">${item.discount ? `${item.discount}% OFF` : 'BEST VALUE'}</span>
      <button class="mh-wishlist-heart${wished ? ' is-wished' : ''}" type="button" data-mh-wishlist-toggle="${key}" aria-label="Save ${escapeHtml(item.name)} to wishlist" aria-pressed="${wished}">${wished ? '♥' : '♡'}</button>
      <a class="shop-image" href="${url}"><img loading="lazy" decoding="async" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}"></a>
      <div class="shop-card-copy">
        <span>${escapeHtml(item.category)}</span>
        <h3><a href="${url}">${escapeHtml(item.name)}</a></h3>
        <div class="mh-rating" aria-label="${item.rating.toFixed(1)} out of 5">★ ${item.rating.toFixed(1)}</div>
        <div class="mh-card-price"><b>${money(item.price)}</b><del>${money(item.originalPrice)}</del></div>
        <div class="mh-card-meta"><small>✦ ${item.coins} Coins</small><small>${item.stock} in stock</small><small>⚡ ${escapeHtml(item.delivery)}</small></div>
        <button type="button" data-mh-add-to-cart="${key}">${options.buttonText || 'Quick add'}</button>
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
      if (item) addToCart(item, {quantity:Number(quantitySource?.value || 1)});
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
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCart(); });
    window.addEventListener('storage', event => { if (event.key === CART_KEY) { cart = readCart(); renderCart(); } });
    window.addEventListener('storage', event => { if (event.key === WISHLIST_KEY) { wishes = new Set(readWishlist()); refreshWishlistUi(); } });
    renderCart();
    refreshWishlistUi();
    syncWishlist();
    if (new URLSearchParams(location.search).get('cart') === 'open') openCart();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=41.1-mobile-navigation-auth').catch(() => {});
  }

  window.MarketHubStorefront = {
    PAGE_SIZE, init, card, addToCart, openMiniCart:openCart, remove, changeQuantity, openCart, closeCart,
    registerProducts, fetchProducts, renderGrid, createInfiniteGrid, toggleWishlist,
    getWishlist: () => [...wishes], isWished:key=>wishes.has(String(key)),
    getCart: () => [...cart], money, escapeHtml
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
