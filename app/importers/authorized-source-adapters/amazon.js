'use strict';

const {fetchAuthorizedHtml}=require('../base-importer');
const {extractStructuredProduct}=require('../structured-data');

const clean=value=>decodeEntities(String(value??'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const amount=value=>{const parsed=Number(String(value??'').replace(/[^0-9.]/g,''));return Number.isFinite(parsed)&&parsed>0?parsed:null};
function decodeEntities(value){return value.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,code)=>String.fromCharCode(Number(code)))}
function attribute(tag,name){const match=String(tag||'').match(new RegExp(`\\b${name}=["']([^"']*)["']`,'i'));return match?decodeEntities(match[1]):''}
function elementById(html,id){const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=html.match(new RegExp(`<([a-z0-9]+)[^>]*\\bid=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,'i'));return match?clean(match[2]):''}
function amazonAsin(sourceUrl,html=''){let url;try{url=new URL(sourceUrl)}catch{return''}const path=url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i),query=url.searchParams.get('asin'),page=String(html).match(/\bdata-asin=["']([A-Z0-9]{10})["']/i);return String(path?.[1]||query||page?.[1]||'').toUpperCase()}
function amazonImages(html){const images=[];const push=value=>{try{const parsed=new URL(decodeEntities(value));if(/^https?:$/.test(parsed.protocol))images.push(parsed.href)}catch{}};for(const match of html.matchAll(/\bdata-old-hires=["']([^"']+)["']/gi))push(match[1]);for(const match of html.matchAll(/\bdata-a-dynamic-image=["']([^"']+)["']/gi)){let value=decodeEntities(match[1]);try{Object.keys(JSON.parse(value)).forEach(push)}catch{}}for(const match of html.matchAll(/<img[^>]+\bid=["']landingImage["'][^>]*>/gi))push(attribute(match[0],'src'));return[...new Set(images)]}
function tableSpecifications(html){const result={};for(const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...row[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(match=>clean(match[1])).filter(Boolean);if(cells.length>=2&&cells[0].length<=120)result[cells[0]]=cells.slice(1).join(' ')}return result}
function detailSpecifications(html){const result={};for(const item of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)){const text=clean(item[1]),separator=text.indexOf(':');if(separator>0&&separator<100){const key=text.slice(0,separator).trim(),value=text.slice(separator+1).trim();if(key&&value)result[key]=value}}return result}
function jsonObjectFor(html,key){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const source of [String(html||''),decodeEntities(String(html||''))]){
    const match=new RegExp(`["']?${escaped}["']?\\s*:`,'i').exec(source);
    if(!match)continue;
    const start=source.indexOf('{',match.index+match[0].length);
    if(start<0)continue;
    let depth=0,quoted=false,escapedCharacter=false;
    for(let index=start;index<source.length&&index-start<=500000;index++){
      const character=source[index];
      if(quoted){if(escapedCharacter)escapedCharacter=false;else if(character==='\\')escapedCharacter=true;else if(character==='"')quoted=false;continue}
      if(character==='"'){quoted=true;continue}
      if(character==='{')depth++;
      else if(character==='}'&&--depth===0){try{return JSON.parse(source.slice(start,index+1))}catch{break}}
    }
  }
  return null;
}
function amazonVariationVariants(html){
  const displayData=jsonObjectFor(html,'dimensionValuesDisplayData'),variationValues=jsonObjectFor(html,'variationValues'),displayLabels=jsonObjectFor(html,'variationDisplayLabels')||{};
  if(!displayData||!variationValues)return[];
  const dimensions=Object.keys(variationValues).filter(key=>Array.isArray(variationValues[key])&&variationValues[key].length);
  if(!dimensions.length)return[];
  const allowed=dimensions.map(key=>new Set(variationValues[key].map(value=>clean(value).toLowerCase()).filter(Boolean))),variants=[];
  for(const [sourceId,values] of Object.entries(displayData)){
    if(!/^[A-Z0-9]{10}$/i.test(sourceId)||!Array.isArray(values)||values.length!==dimensions.length)continue;
    const normalized=values.map(clean);
    if(normalized.some((value,index)=>!value||!allowed[index].has(value.toLowerCase())))continue;
    const options={};dimensions.forEach((dimension,index)=>{options[clean(displayLabels[dimension])||dimension]=normalized[index]});
    variants.push({sourceId:sourceId.toUpperCase(),asin:sourceId.toUpperCase(),options});
  }
  return variants;
}
function mergeAmazonVariants(structured,html,currentAsin,currentFields){
  const mapped=amazonVariationVariants(html),existing=Array.isArray(structured.variants)?structured.variants:[];
  if(!mapped.length)return existing;
  return mapped.map(variant=>{const prior=existing.find(item=>String(item.sourceId||item.asin||item.sourceProductId||'').toUpperCase()===variant.sourceId);return{...(variant.sourceId===currentAsin?currentFields:{}),...(prior||{}),...variant,options:{...(prior?.options||{}),...variant.options}}});
}
function extractAmazonProduct(html,sourceUrl){const structured=extractStructuredProduct(html,sourceUrl)||{},asin=amazonAsin(sourceUrl,html),title=structured.title||elementById(html,'productTitle'),brand=structured.brand||elementById(html,'bylineInfo').replace(/^(?:Visit the|Brand:)\s*/i,'').replace(/ Store$/i,''),features=elementById(html,'feature-bullets'),description=structured.description||elementById(html,'productDescription')||features,price=structured.price||amount(elementById(html,'priceblock_ourprice')||elementById(html,'priceblock_dealprice')||elementById(html,'corePrice_feature_div')),mrp=structured.mrp||amount(elementById(html,'priceblock_listprice')||elementById(html,'basisPrice')),images=[...new Set([...(structured.images||[]),...amazonImages(html)])],specifications={...(structured.specifications||{}),...tableSpecifications(html),...detailSpecifications(elementById(html,'detailBullets_feature_div'))},variants=mergeAmazonVariants(structured,html,asin,{title,sku:structured.sku,price,mrp,availability:structured.availability,image:images[0]||''});if(!title&&!images.length)return null;return{...structured,title,brand,description,shortDescription:structured.shortDescription||features,price,mrp,discount:mrp&&price?Math.max(0,Math.round((mrp-price)*100/mrp)):null,images,specifications,variants,asin,sourceProductId:asin||structured.sourceProductId||'',sourceUrl,sourceWebsite:new URL(sourceUrl).hostname}}
async function analyze(url,{settings}){const allowed=[...(settings.allowed_domains||[]),'amazon.in','amzn.in','media-amazon.com','ssl-images-amazon.com'],fetched=await fetchAuthorizedHtml(url,{allowedDomains:allowed,allowLocal:false}),product=extractAmazonProduct(fetched.html,fetched.finalUrl);if(!product)throw new Error('Amazon did not expose usable public product information for this URL.');return product}

module.exports={analyze,extractAmazonProduct,amazonAsin,amazonImages,amazonVariationVariants};
