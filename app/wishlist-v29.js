(() => {
  'use strict';
  const store=window.MarketHubStorefront,grid=document.getElementById('wishlistGrid');
  let loading=false;
  async function load(){
    if(loading)return;
    loading=true;
    const skus=store.getWishlist();
    if(!skus.length){grid.innerHTML='<p class="empty">Your wishlist is empty.</p>';loading=false;return;}
    grid.innerHTML=Array.from({length:Math.min(8,skus.length)},()=>'<article class="shop-card mh-skeleton"><div></div><p></p><button disabled></button></article>').join('');
    const results=await Promise.all(skus.map(sku=>store.fetchProducts({page:1,limit:1,q:sku}).catch(()=>({products:[]}))));
    const items=results.flatMap(result=>result.products).filter(item=>skus.includes(String(item.sku)));
    store.renderGrid(grid,items,{empty:'Your wishlist is empty.'});
    loading=false;
  }
  window.addEventListener('mh:wishlist-changed',load);
  load();
})();
