'use strict';

const clean=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const array=value=>Array.isArray(value)?value:value==null?[]:[value];
const number=value=>{const text=String(value??'').replace(/[^0-9.]/g,'');if(!text)return null;const parsed=Number(text);return Number.isFinite(parsed)?parsed:null};
const types=value=>array(value?.['@type']).map(item=>String(item).split(/[\/#]/).pop().toLowerCase());
const isType=(value,type)=>types(value).includes(type.toLowerCase());

function collectCommerceNodes(value,result,index){
  if(Array.isArray(value)){value.forEach(item=>collectCommerceNodes(item,result,index));return}
  if(!value||typeof value!=='object')return;
  if(value['@id'])index.set(String(value['@id']),value);
  if(isType(value,'ProductGroup'))result.groups.push(value);
  else if(isType(value,'Product'))result.products.push(value);
  if(value['@graph'])collectCommerceNodes(value['@graph'],result,index);
}

function resolveVariants(node,index){
  if(!node||!node.hasVariant)return node;
  return{...node,hasVariant:array(node.hasVariant).map(item=>{
    if(item&&typeof item==='object'&&item['@id']&&Object.keys(item).length===1)return index.get(String(item['@id']))||item;
    if(typeof item==='string')return index.get(item)||null;
    return item;
  }).filter(Boolean)};
}

function meta(html,key){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i'),new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,'i')];
  for(const pattern of patterns){const match=html.match(pattern);if(match)return clean(match[1])}
  return'';
}

function parseJsonLd(html){
  const groups=[],products=[],seen=new Set(),expression=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while((match=expression.exec(html))){
    try{
      const result={groups:[],products:[]},index=new Map();
      collectCommerceNodes(JSON.parse(match[1].trim()),result,index);
      for(const group of result.groups)groups.push(resolveVariants(group,index));
      products.push(...result.products);
    }catch{}
  }
  return[...groups,...products].filter(node=>{const key=node['@id']||node;if(seen.has(key))return false;seen.add(key);return true});
}

function firstOffer(node){
  const offer=array(node?.offers)[0]||{};
  return Array.isArray(offer?.offers)?offer.offers[0]||offer:offer;
}

function propertyName(value){return clean(value).split(/[\/#]/).pop().replace(/[_-]+/g,' ')}
function additionalProperties(node){
  return array(node?.additionalProperty).filter(item=>item&&typeof item==='object'&&clean(item.name)&&clean(item.value));
}

function variantOptions(node,variesBy){
  const options={},properties=additionalProperties(node);
  const add=(name,value)=>{name=propertyName(name);value=clean(value);if(name&&value)options[name]=value};
  if(variesBy.length){
    for(const dimension of variesBy){
      const name=propertyName(dimension),directKey=Object.keys(node||{}).find(key=>propertyName(key).toLowerCase()===name.toLowerCase());
      const property=properties.find(item=>propertyName(item.name).toLowerCase()===name.toLowerCase());
      add(name,directKey?node[directKey]:property?.value);
    }
  }else{
    for(const name of ['color','colour','size','storage','ram','weight','material','style','packSize'])if(node?.[name]!=null)add(name,node[name]);
    for(const property of properties)add(property.name,property.value);
  }
  return options;
}

function normalizeVariant(node,variesBy){
  const offer=firstOffer(node),images=array(node?.image).flatMap(item=>typeof item==='object'?[item.url,item.contentUrl]:item).filter(Boolean).map(String);
  return{title:clean(node?.name),sku:clean(node?.sku),sourceId:clean(node?.productID||node?.gtin13||node?.gtin12||node?.gtin8||node?.mpn||node?.['@id']),options:variantOptions(node,variesBy),price:number(offer.price||node?.price),mrp:number(offer.highPrice||node?.msrp),availability:clean(offer.availability||node?.availability),image:images[0]||'',images,additionalProperty:additionalProperties(node)};
}

function normalize(node,html,sourceUrl){
  const childNodes=array(node.hasVariant).filter(item=>item&&typeof item==='object'),variesBy=array(node.variesBy).map(propertyName).filter(Boolean),variants=childNodes.map(item=>normalizeVariant(item,variesBy)).filter(item=>Object.keys(item.options).length),primaryVariant=childNodes[0]||{},offer=firstOffer(node),primaryOffer=firstOffer(primaryVariant),aggregate=node.aggregateRating||{},brand=typeof node.brand==='object'?node.brand?.name:node.brand;
  const images=[...new Set(array(node.image).flatMap(item=>typeof item==='object'?[item.url,item.contentUrl]:item).filter(Boolean).map(String))];
  return{title:clean(node.name||primaryVariant.name||meta(html,'og:title')),shortDescription:clean(meta(html,'og:description')),description:clean(node.description||primaryVariant.description||meta(html,'description')||meta(html,'og:description')),price:number(offer.price||node.price||primaryOffer.price||meta(html,'product:price:amount')),mrp:number(offer.highPrice||node.msrp||primaryOffer.highPrice),brand:clean(brand),category:clean(node.category),sku:clean(node.sku||node.mpn),sourceProductId:clean(node.productGroupID||node.productID||node.gtin13||node.gtin12||node.gtin8||node.mpn),stock:null,availability:clean(offer.availability||primaryOffer.availability),images:images.length?images:[meta(html,'og:image')].filter(Boolean),video:clean(node.video?.contentUrl||node.video?.embedUrl),specifications:additionalProperties(node).reduce((out,item)=>{out[clean(item.name)]=clean(item.value);return out},{}),features:array(node.features).map(clean).filter(Boolean),color:clean(node.color),size:clean(node.size),variants,tags:[],weight:clean(node.weight?.value||node.weight),dimensions:{width:clean(node.width?.value||node.width),height:clean(node.height?.value||node.height),depth:clean(node.depth?.value||node.depth)},rating:aggregate.ratingValue?{value:number(aggregate.ratingValue),count:number(aggregate.reviewCount||aggregate.ratingCount)}:null,sourceUrl,sourceWebsite:new URL(sourceUrl).hostname};
}

function extractStructuredProduct(html,sourceUrl){
  const nodes=parseJsonLd(html);
  if(nodes.length)return normalize(nodes[0],html,sourceUrl);
  const title=meta(html,'og:title'),image=meta(html,'og:image'),price=number(meta(html,'product:price:amount'));
  if(!title&&!image)return null;
  return normalize({name:title,image,description:meta(html,'og:description'),offers:{price}},html,sourceUrl);
}

module.exports={extractStructuredProduct,parseJsonLd};
