(() => {
  'use strict';
  if (window.MarketHubVariantEditor) return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
  const unique=values=>[...new Map(values.map(clean).filter(Boolean).map(value=>[value.toLowerCase(),value])).values()];
  const signature=(options,selection)=>options.map(option=>String(selection[option.name]||'').toLowerCase()).join('\u001f');
  const combinations=options=>options.reduce((rows,option)=>rows.flatMap(row=>option.values.map(value=>({...row,[option.name]:value}))),[{}]);

  class VariantEditor {
    constructor(container,initial={},defaults={}) {
      this.container=container;
      this.defaults={sku:'VAR',price:0,mrp:null,stock:99,weightGrams:500,...defaults};
      this.options=(initial.options||[]).map((option,index)=>({name:clean(option.name),values:unique((option.values||[]).map(value=>typeof value==='object'?value.value:value)),position:index})).filter(option=>option.name);
      this.variants=(initial.variants||[]).map((variant,index)=>this.normalizedVariant(variant,index));
      this.onClick=this.onClick.bind(this);this.onChange=this.onChange.bind(this);
      container.addEventListener('click',this.onClick);container.addEventListener('change',this.onChange);container.addEventListener('input',this.onChange);
      this.render();
    }
    normalizedVariant(variant,index){
      const price=Number(variant.price_inr??variant.price??this.defaults.price)||0,mrpValue=Number(variant.compare_at_price_inr??variant.mrp??this.defaults.mrp),stock=Number(variant.stock_quantity??variant.stock??this.defaults.stock),weight=Number(variant.weight_grams??variant.weightGrams??this.defaults.weightGrams);
      return{id:variant.id||null,sku:clean(variant.sku||`${this.defaults.sku}-${index+1}`),price,mrp:Number.isFinite(mrpValue)&&mrpValue>=price?mrpValue:null,stock:Number.isInteger(stock)&&stock>=0?stock:0,weightGrams:Number.isFinite(weight)&&weight>0?weight:500,barcode:clean(variant.barcode),image:clean(variant.image_url||variant.image||(variant.images||[])[0]),images:unique(variant.images||[variant.image_url||variant.image]),enabled:variant.is_enabled!==false&&variant.enabled!==false,isDefault:Boolean(variant.is_default??variant.isDefault),options:{...(variant.options||{})}};
    }
    setDefaults(defaults={}){this.defaults={...this.defaults,...defaults}}
    setValue(initial={}){this.options=(initial.options||[]).map((option,index)=>({name:clean(option.name),values:unique((option.values||[]).map(value=>typeof value==='object'?value.value:value)),position:index})).filter(option=>option.name);this.variants=(initial.variants||[]).map((variant,index)=>this.normalizedVariant(variant,index));this.render()}
    sync(){
      this.options=[...this.container.querySelectorAll('[data-variant-option-row]')].map((row,index)=>({name:clean(row.querySelector('[data-option-name]').value),values:unique(row.querySelector('[data-option-values]').value.split(',')),position:index})).filter(option=>option.name||option.values.length);
      this.variants=[...this.container.querySelectorAll('[data-variant-row]')].map((row,index)=>{const saved=this.variants[Number(row.dataset.variantRow)]||{},price=Number(row.querySelector('[data-variant-price]').value),mrp=Number(row.querySelector('[data-variant-mrp]').value);return{...saved,sku:clean(row.querySelector('[data-variant-sku]').value),price,mrp:Number.isFinite(mrp)&&mrp>=price?mrp:null,stock:Number(row.querySelector('[data-variant-stock]').value),weightGrams:Number(row.querySelector('[data-variant-weight]').value),barcode:clean(row.querySelector('[data-variant-barcode]').value),image:clean(row.querySelector('[data-variant-image]').value),images:clean(row.querySelector('[data-variant-image]').value)?[clean(row.querySelector('[data-variant-image]').value)]:[],enabled:row.querySelector('[data-variant-enabled]').checked,isDefault:row.querySelector('[data-variant-default]').checked,options:{...saved.options},position:index}});
    }
    generate(){
      this.sync();
      const options=this.options.filter(option=>option.name&&option.values.length);
      if(!options.length){this.variants=[];this.render();return;}
      const previous=new Map(this.variants.map(variant=>[signature(options,variant.options),variant]));
      this.variants=combinations(options).map((selection,index)=>{const saved=previous.get(signature(options,selection));return saved?{...saved,options:selection}:this.normalizedVariant({sku:`${clean(this.defaults.sku)||'VAR'}-${index+1}`,options:selection,price:this.defaults.price,mrp:this.defaults.mrp,stock:this.defaults.stock,weightGrams:this.defaults.weightGrams,enabled:true,isDefault:index===0},index)});
      if(!this.variants.some(variant=>variant.enabled&&variant.isDefault)){const first=this.variants.find(variant=>variant.enabled);if(first)first.isDefault=true;}
      this.render();
    }
    onClick(event){
      if(event.target.closest('[data-add-option]')){event.preventDefault();this.sync();this.options.push({name:'',values:[],position:this.options.length});this.render();return;}
      const remove=event.target.closest('[data-remove-option]');if(remove){event.preventDefault();this.sync();this.options.splice(Number(remove.dataset.removeOption),1);this.variants=[];this.render();return;}
      if(event.target.closest('[data-generate-variants]')){event.preventDefault();this.generate();}
    }
    onChange(event){if(event.target.matches('[data-variant-default]')&&event.target.checked)this.container.querySelectorAll('[data-variant-default]').forEach(input=>{if(input!==event.target)input.checked=false});if(event.target.matches('[data-variant-price],[data-variant-mrp]')){const row=event.target.closest('[data-variant-row]'),price=Number(row.querySelector('[data-variant-price]').value),mrp=Number(row.querySelector('[data-variant-mrp]').value),discount=row.querySelector('[data-variant-discount]');discount.value=mrp>price?Math.round((mrp-price)*100/mrp):0}}
    getValue(){
      this.sync();
      const options=this.options.filter(option=>option.name&&option.values.length).map(({name,values,position})=>({name,values,position}));
      if(!options.length)return{options:[],variants:[]};
      if(this.variants.some(variant=>!variant.sku||!Number.isFinite(variant.price)||variant.price<=0||!Number.isInteger(variant.stock)||variant.stock<0||!Number.isFinite(variant.weightGrams)||variant.weightGrams<1))throw new Error('Complete SKU, price, stock and weight for every variant.');
      if(!this.variants.some(variant=>variant.enabled))throw new Error('Enable at least one variant.');
      let chosen=this.variants.find(variant=>variant.enabled&&variant.isDefault)||this.variants.find(variant=>variant.enabled);this.variants.forEach(variant=>{variant.isDefault=variant===chosen});
      return{options,variants:this.variants.map(variant=>({...variant,discount:variant.mrp&&variant.mrp>variant.price?Math.round((variant.mrp-variant.price)*100/variant.mrp):0}))};
    }
    render(){
      const optionsHtml=this.options.map((option,index)=>`<div class="mh-admin-option" data-variant-option-row><input data-option-name placeholder="Option name, e.g. Colour" value="${esc(option.name)}"><input data-option-values placeholder="Values separated by commas" value="${esc(option.values.join(', '))}"><button type="button" data-remove-option="${index}" aria-label="Remove option">Remove</button></div>`).join('');
      const variantsHtml=this.variants.map((variant,index)=>{const label=Object.entries(variant.options).map(([name,value])=>`${name}: ${value}`).join(' / '),discount=variant.mrp&&variant.mrp>variant.price?Math.round((variant.mrp-variant.price)*100/variant.mrp):0;return`<article class="mh-admin-variant" data-variant-row="${index}"><header><b>${esc(label||`Variant ${index+1}`)}</b><label><input type="checkbox" data-variant-enabled ${variant.enabled?'checked':''}> Enabled</label><label><input type="radio" name="${esc(this.container.id||'variant')}-default" data-variant-default ${variant.isDefault?'checked':''}> Default</label></header><div class="mh-admin-variant-grid"><label>SKU<input data-variant-sku value="${esc(variant.sku)}" required></label><label>Selling price<input data-variant-price type="number" min=".01" step=".01" value="${variant.price||''}" required></label><label>MRP<input data-variant-mrp type="number" min="0" step=".01" value="${variant.mrp??''}"></label><label>Discount %<input data-variant-discount value="${discount}" readonly></label><label>Stock<input data-variant-stock type="number" min="0" step="1" value="${variant.stock}" required></label><label>Weight (grams)<input data-variant-weight type="number" min="1" step="1" value="${variant.weightGrams}" required></label><label>Barcode<input data-variant-barcode value="${esc(variant.barcode)}"></label><label>Image URL<input data-variant-image type="url" value="${esc(variant.image)}"></label></div></article>`}).join('');
      this.container.innerHTML=`<section class="mh-admin-variant-editor"><div class="mh-admin-variant-heading"><div><h3>Product Variants</h3><p>Add unlimited options, then generate combinations. Imported drafts keep only combinations supplied by the source.</p></div><button type="button" data-add-option>Add option</button></div><div class="mh-admin-options">${optionsHtml||'<p>No options. This will remain a simple product.</p>'}</div><button type="button" class="mh-generate-variants" data-generate-variants>Generate combinations</button><div class="mh-admin-variants">${variantsHtml||'<p>No variant combinations yet.</p>'}</div></section>`;
    }
    destroy(){this.container.removeEventListener('click',this.onClick);this.container.removeEventListener('change',this.onChange);this.container.removeEventListener('input',this.onChange);this.container.innerHTML='';}
  }
  window.MarketHubVariantEditor={mount(container,initial,defaults){if(container.__mhVariantEditor)container.__mhVariantEditor.destroy();const editor=new VariantEditor(container,initial,defaults);container.__mhVariantEditor=editor;return editor;}};
})();
