(() => {
  'use strict';
  const store=window.MarketHubStorefront,$=id=>document.getElementById(id),params=new URLSearchParams(location.search);
  const state={query:params.get('q')||'',category:params.get('category')||'',sort:params.get('sort')||'latest'};
  function syncUrl(){const next=new URLSearchParams();if(state.query)next.set('q',state.query);if(state.category)next.set('category',state.category);if(state.sort!=='latest')next.set('sort',state.sort);history.replaceState({},'',`shop.html${next.size?`?${next}`:''}`);}
  const feed=store.createInfiniteGrid({
    grid:$('shopGrid'),status:$('scrollStatus'),sentinel:$('scrollSentinel'),
    loadPage:async(page,limit)=>{const data=await store.fetchProducts({page,limit,q:state.query,category:state.category,sort:state.sort});$('productCount').textContent=`${data.total||0} product${data.total===1?'':'s'}`;$('loadMore').hidden=data.hasMore===false;return data;}
  });
  async function reset(){syncUrl();await feed.reset();}
  async function categories(){try{const items=await fetch('assets/catalogue/products.json',{cache:'force-cache'}).then(r=>r.json());const values=[...new Set(items.map(item=>item.category).filter(Boolean))].sort();$('categoryFilter').innerHTML='<option value="">All categories</option>'+values.map(value=>`<option>${store.escapeHtml(value)}</option>`).join('');$('categoryFilter').value=state.category;}catch{$('categoryFilter').innerHTML='<option value="">All categories</option>';}}
  $('shopSearch').value=state.query;$('sortFilter').value=state.sort;
  $('shopSearch').addEventListener('input',event=>{state.query=event.target.value.trim();reset();});
  $('categoryFilter').addEventListener('change',event=>{state.category=event.target.value;reset();});
  $('sortFilter').addEventListener('change',event=>{state.sort=event.target.value;reset();});
  $('loadMore').addEventListener('click',()=>feed.load());
  categories();reset();
})();
