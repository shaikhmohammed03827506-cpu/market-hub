const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const appDirectory = path.join(__dirname, 'app');
const checkoutPatchFile = path.join(__dirname, 'market-hub-v26-shiprocket-checkout.zip');

function applyFastrrCheckoutFix() {
  const serverFile = path.join(appDirectory, 'server.js');
  if (!fs.existsSync(serverFile)) return;
  let source = fs.readFileSync(serverFile, 'utf8');
  if (source.includes('function shiprocketCartItem(')) return;
  const before = source;
  source = source.replace(
    "taxable: true, grams: Number(product.weight_grams || 500)",
    "taxable: true, quantity: Number(product.stock_quantity || 0), grams: Number(product.weight_grams || 500)"
  );
  const cartHelper = `\n// Include trusted product details in each checkout request. This prevents a newly\n// enabled Shiprocket Checkout account from rejecting an item while it is syncing.\nfunction shiprocketCartItem(product, origin, quantity) {\n  const imageUrl = product.image_url ? \`${origin}\${product.image_url.startsWith('/') ? product.image_url : \`/\${product.image_url}\`}\` : '';\n  return { variant_id: String(product.id), quantity, catalog_data: { price: Number(product.price_inr), name: String(product.name), image_url: imageUrl } };\n}\n`;
  source = source.replace('\nfunction prepareShiprocketCart(request, cart) {', `${cartHelper}\nfunction prepareShiprocketCart(request, cart) {`);
  source = source.replace('items.push({ variant_id: String(product.id), quantity });', 'items.push(shiprocketCartItem(product, publicOrigin(request), quantity));');
  if (source === before) throw new Error('Could not apply the Shiprocket Checkout update.');
  fs.writeFileSync(serverFile, source);
}

if (!fs.existsSync(path.join(appDirectory, 'server.js'))) {
  new AdmZip(path.join(__dirname, 'market-hub-v1.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v2-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v3-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v4-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v5-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v6-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v7-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v8-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v9-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v10-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v11-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v12-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v13-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v14-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v15-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v16-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v17-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v18-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v19-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v20-patch.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v21-packing-video.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v22-account-tools.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v24-shiprocket-shipping.zip')).extractAllTo(appDirectory, true);
  new AdmZip(path.join(__dirname, 'market-hub-v25-auth-redirect.zip')).extractAllTo(appDirectory, true);
  if (fs.existsSync(checkoutPatchFile)) new AdmZip(checkoutPatchFile).extractAllTo(appDirectory, true);
}
applyFastrrCheckoutFix();
require(path.join(appDirectory, 'server.js'));
