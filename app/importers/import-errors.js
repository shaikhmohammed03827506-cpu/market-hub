'use strict';

function productImportErrorResponse(error){
  const original=String(error?.message||error||'Product import failed.');
  if(error instanceof SyntaxError||/Unexpected token.+(?:JSON|position)/i.test(original))return{status:400,body:{ok:false,error:{code:'INVALID_REQUEST',message:'The importer request was not valid JSON. Refresh the page and try again.'}}};
  if(/valid product URL|Only HTTPS|authorized-source|private|metadata|credentials|custom ports/i.test(original))return{status:400,body:{ok:false,error:{code:'INVALID_PRODUCT_URL',message:original}}};
  if(/No JSON-LD Product|usable OpenGraph|did not expose usable public product information|no usable public product data/i.test(original))return{status:422,body:{ok:false,error:{code:'PRODUCT_DATA_NOT_FOUND',message:'No usable public product data was found at this URL. The page may require sign-in, be unavailable, or not expose product details that MARKET HUB can safely import.'}}};
  const sourceStatus=original.match(/Source returned HTTP (\d{3})|Media returned HTTP (\d{3})/i)?.slice(1).find(Boolean);
  if(sourceStatus||/aborted|timeout|fetch failed|ENOTFOUND|ECONNRESET|too many source redirects/i.test(original))return{status:422,body:{ok:false,error:{code:'SOURCE_UNAVAILABLE',message:sourceStatus?`The source website did not allow MARKET HUB to read this product page (HTTP ${sourceStatus}). Try the full public product URL or try again later.`:'The source product page could not be reached safely. Check the URL and try again later.'}}};
  if(/not defined|MODULE_NOT_FOUND|Cannot find module|database|ECONNREFUSED|connection/i.test(original))return{status:503,body:{ok:false,error:{code:'IMPORTER_CONFIGURATION_ERROR',message:'The product importer is temporarily unavailable because a server component could not load. The error has been logged for the administrator.'}}};
  return{status:400,body:{ok:false,error:{code:'IMPORT_FAILED',message:original||'The product could not be imported.'}}};
}

module.exports={productImportErrorResponse};
