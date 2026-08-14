(() => {
  'use strict';
  const store=window.MarketHubStorefront;
  const categories=[['📱','Mobiles'],['🎧','Electronics'],['👕','Fashion'],['💄','Beauty'],['🪑','Home & Living'],['🍳','Kitchen'],['🏋️','Sports & Fitness'],['🎮','Gaming'],['🧸','Toys & Baby'],['🛒','Groceries'],['⌚','Watches'],['🎁','Gift items']];
  const section=(id,eyebrow,title)=>`<section class="section shell mh-home-products" id="${id}"><div class="section-heading"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div></div><div class="product-grid" id="${id}Grid"></div></section>`;
  const skeletons=count=>Array.from({length:count},()=>'<article class="shop-card mh-skeleton"><div></div><p></p><p></p><button disabled></button></article>').join('');
  async function init(){
    const categoryGrid=document.getElementById('categoryGrid');
    categoryGrid.innerHTML=categories.map(([icon,label])=>`<a class="category" href="shop.html?category=${encodeURIComponent(label)}"><span class="cat-img">${icon}</span><b>${label}</b></a>`).join('');
    const searchInput=document.getElementById('searchInput'),searchButton=document.getElementById('searchButton');
    const openSearch=()=>{const query=searchInput?.value.trim();location.href=query?`shop.html?q=${encodeURIComponent(query)}`:'shop.html';};
    searchButton?.addEventListener('click',openSearch);
    searchInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();openSearch();}});
    document.querySelectorAll('#deals,#trending,#new,.mh-reco-holder,[data-rec-section]').forEach(node=>node.remove());
    const anchor=document.getElementById('categories');
    anchor.insertAdjacentHTML('afterend',section('suggested','PICKED FOR YOU','Suggested For You')+section('newArrivals','JUST LANDED','New Arrivals')+section('bestSellers','CUSTOMER FAVOURITES','Best Sellers')+section('allProducts','EXPLORE THE CATALOGUE','All Products'));
    document.getElementById('allProducts').insertAdjacentHTML('beforeend','<div id="allProductsStatus" class="mh-load-status" aria-live="polite"></div><div id="allProductsSentinel" aria-hidden="true"></div>');
    ['suggestedGrid','newArrivalsGrid','bestSellersGrid'].forEach(id=>{document.getElementById(id).innerHTML=skeletons(4);});
    const feed=store.createInfiniteGrid({
      grid:document.getElementById('allProductsGrid'),status:document.getElementById('allProductsStatus'),sentinel:document.getElementById('allProductsSentinel'),
      loadPage:(page,limit)=>store.fetchProducts({page,limit})
    });
    try{
      const [recommendations,firstPage]=await Promise.all([
        fetch('/api/recommendations/home?limit=8',{cache:'no-store'}).then(response=>response.ok?response.json():{}),
        store.fetchProducts({page:1,limit:store.PAGE_SIZE})
      ]);
      const fallback=firstPage.products||[];
      store.renderGrid('#suggestedGrid',recommendations.recommended?.length?recommendations.recommended:fallback.slice(0,8));
      store.renderGrid('#newArrivalsGrid',recommendations.newArrivals?.length?recommendations.newArrivals:fallback.slice(8,16));
      store.renderGrid('#bestSellersGrid',recommendations.bestSellers?.length?recommendations.bestSellers:fallback.slice(16,24));
      await feed.load({reset:true});
    }catch{await feed.load({reset:true});}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
