'use strict';
const assert=require('assert');
const {productImportErrorResponse}=require('../importers/import-errors');

let response=productImportErrorResponse(new ReferenceError('validateProductImportCategory is not defined'));
assert.equal(response.status,503);
assert.equal(response.body.error.code,'IMPORTER_CONFIGURATION_ERROR');
response=productImportErrorResponse(new Error('No JSON-LD Product or usable OpenGraph product data was found.'));
assert.equal(response.status,422);
assert.equal(response.body.error.code,'PRODUCT_DATA_NOT_FOUND');
assert.match(response.body.error.message,/No usable public product data/);
response=productImportErrorResponse(new Error('Source returned HTTP 503.'));
assert.equal(response.status,422);
assert.equal(response.body.error.code,'SOURCE_UNAVAILABLE');
assert.match(response.body.error.message,/HTTP 503/);
response=productImportErrorResponse(new SyntaxError('Unexpected token } in JSON'));
assert.equal(response.status,400);
assert.equal(response.body.error.code,'INVALID_REQUEST');
console.log('product-import error tests passed');
