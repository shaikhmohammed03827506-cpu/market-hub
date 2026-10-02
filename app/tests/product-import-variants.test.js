'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const {extractStructuredProduct}=require('../importers/structured-data');
const {extractAmazonProduct,amazonVariationVariants}=require('../importers/authorized-source-adapters/amazon');
const {normalizeProduct}=require('../importers/import-service');

const fixtureDirectory=path.join(__dirname,'fixtures');
const structuredFixtures=JSON.parse(fs.readFileSync(path.join(fixtureDirectory,'structured-product-variants.json'),'utf8'));
const amazonHtml=fs.readFileSync(path.join(fixtureDirectory,'amazon-variation-map.html'),'utf8');
const settings={default_stock:11,max_images:12};
const structuredHtml=value=>`<!doctype html><script type="application/ld+json">${JSON.stringify(value)}</script>`;
const importStructured=value=>normalizeProduct(extractStructuredProduct(structuredHtml(value),'https://supplier.example/item'),settings);

const simple=importStructured(structuredFixtures.simple);
assert.deepEqual(simple.options,[]);
assert.deepEqual(simple.variants,[],'a product specification must not become a made-up variant');

const oneOption=importStructured(structuredFixtures.oneOption);
assert.deepEqual(oneOption.options,[{name:'Colour',position:0,values:['Blue','Red']}]);
assert.equal(oneOption.variants.length,2);
assert.equal(oneOption.variants[1].stock,0);

const twoOptions=importStructured(structuredFixtures.twoOptionsMissingCombination);
assert.deepEqual(twoOptions.options.map(option=>option.name),['Colour','Size']);
assert.equal(twoOptions.variants.length,3,'only the three source-declared combinations should exist');
assert(!twoOptions.variants.some(variant=>variant.options.Colour==='Red'&&variant.options.Size==='M'),'the absent Red/M combination must not be synthesized');

const threeOptions=importStructured(structuredFixtures.threeOptions);
assert.deepEqual(threeOptions.options.map(option=>option.name),['Colour','Size','Storage']);
assert.equal(threeOptions.variants.length,3);
assert.deepEqual(threeOptions.variants[1].options,{Colour:'Black',Size:'Large',Storage:'256 GB'});

const mapped=amazonVariationVariants(amazonHtml);
assert.equal(mapped.length,3);
assert.deepEqual(mapped[2].options,{Colour:'Red',Size:'S'});
const amazon=normalizeProduct(extractAmazonProduct(amazonHtml,'https://www.amazon.in/dp/B0BLUE0S01'),settings);
assert.equal(amazon.variants.length,3);
assert(!amazon.variants.some(variant=>variant.options.Colour==='Red'&&variant.options.Size==='M'),'Amazon variation values alone must not produce combinations');
assert.equal(amazon.variants.find(variant=>variant.sourceId==='B0BLUE0S01').price,1200);

const unsafe='<script>var x={"variationValues":{"color_name":["Blue"]},"dimensionValuesDisplayData":{"B0BAD00001":["Red"]}}</script>';
assert.deepEqual(amazonVariationVariants(unsafe),[],'a mapping value outside the declared dimension values is unsafe');
assert.deepEqual(amazonVariationVariants('<script>var x={"variationValues":{"color_name":["Blue","Red"]}}</script>'),[],'dimension values without explicit ASIN rows must not create variants');

console.log('product-import variant tests passed');
