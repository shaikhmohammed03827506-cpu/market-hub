'use strict';

const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
const aliases=new Map([
  ['color','Colour'],['colour','Colour'],['color name','Colour'],['colour name','Colour'],['color_name','Colour'],
  ['size','Size'],['size name','Size'],['size_name','Size'],['storage','Storage'],['storage capacity','Storage'],
  ['ram','RAM'],['memory','RAM'],['weight','Weight'],['material','Material'],['style','Style'],['style name','Style'],
  ['pack','Pack Size'],['pack size','Pack Size'],['pack_size','Pack Size'],['item package quantity','Pack Size']
]);
const optionName=value=>{const text=clean(value);return aliases.get(text.toLowerCase())||text.slice(0,80)};
const finite=value=>{const number=Number(value);return Number.isFinite(number)?number:null};
const outOfStock=value=>/out.?of.?stock|unavailable/i.test(clean(value));

function explicitOptions(variant){
  const result={};
  const add=(name,value)=>{name=optionName(name);value=clean(value);if(name&&value&&value!=='Not Available')result[name]=value};
  if(variant?.options&&typeof variant.options==='object'&&!Array.isArray(variant.options))for(const [name,value] of Object.entries(variant.options))add(name,value);
  if(Array.isArray(variant?.optionValues))for(const item of variant.optionValues)add(item?.option||item?.name,item?.value);
  for(const key of ['color','colour','size','storage','ram','weight','material','pack','packSize','style'])if(variant?.[key]!=null)add(key,variant[key]);
  if(Array.isArray(variant?.additionalProperty))for(const item of variant.additionalProperty)add(item?.name,item?.value);
  return result;
}

function normalizeImportedVariants(product,defaultStock=99){
  const source=Array.isArray(product?.variants)?product.variants:[];
  const prepared=source.map((variant,index)=>({variant,index,options:explicitOptions(variant)})).filter(item=>Object.keys(item.options).length);
  if(!prepared.length)return{options:[],variants:[]};
  const firstNames=Object.keys(prepared[0].options),names=firstNames.filter(name=>prepared.every(item=>Object.keys(item.options).some(value=>value.toLowerCase()===name.toLowerCase())));
  if(!names.length)return{options:[],variants:[]};
  const options=names.map((name,position)=>({name,position,values:[...new Map(prepared.map(item=>{const key=Object.keys(item.options).find(value=>value.toLowerCase()===name.toLowerCase());const value=item.options[key];return[value.toLowerCase(),value]})).values()]}));
  const seen=new Set(),variants=[];
  for(const item of prepared){const selected={};for(const option of options){const key=Object.keys(item.options).find(name=>name.toLowerCase()===option.name.toLowerCase());selected[option.name]=item.options[key]}
    const signature=options.map(option=>selected[option.name].toLowerCase()).join('\u001f');if(seen.has(signature))continue;seen.add(signature);
    const raw=item.variant,price=finite(raw.price),mrp=finite(raw.mrp),availability=clean(raw.availability),stock=outOfStock(availability)?0:Number.isInteger(Number(raw.stock))?Number(raw.stock):Math.max(0,Number(defaultStock)||99),image=clean(raw.image||raw.image_url||(Array.isArray(raw.images)?raw.images[0]:''));
    variants.push({sourceId:clean(raw.sourceId||raw.asin||raw.sourceProductId),sku:clean(raw.sku),title:clean(raw.title),options:selected,
      price,mrp,discount:price&&mrp&&mrp>=price?Math.round((mrp-price)*100/mrp):null,stock,weightGrams:finite(raw.weightGrams||raw.weight),
      barcode:clean(raw.barcode||raw.gtin13||raw.gtin12||raw.gtin8),image,images:image?[image]:[],enabled:!outOfStock(availability)&&raw.enabled!==false,isDefault:false});
  }
  const defaultVariant=variants.find(variant=>variant.enabled);if(defaultVariant)defaultVariant.isDefault=true;
  return{options,variants};
}

module.exports={normalizeImportedVariants,explicitOptions,optionName};
