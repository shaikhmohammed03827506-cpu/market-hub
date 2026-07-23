const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const appDirectory = path.join(__dirname, 'app');
const checkoutPatchFile = path.join(__dirname, 'market-hub-v26-shiprocket-checkout.zip');

function applyFastrrCheckoutFix() {
  const serverFile = path.join(appDirectory, 'server.js');
  if (!fs.existsSync(serverFile)) return;
  let source = fs.readFileSync(serverFile, 'utf8');
  const before = source;
  source = source.replace(
    "taxable: true, grams: Number(product.weight_grams || 500)",
    "taxable: true, quantity: Number(product.stock_quantity || 0), grams: Number(product.weight_grams || 500)"
  );
  // Fastrr validates checkout variants against its product catalogue. Sync the
  // product first, then send only the documented variant_id and quantity fields.
  const checkoutItem = "items.push({ variant_id: String(product.id), quantity });";
  source = source.replace('items.push(shiprocketCartItem(product, publicOrigin(request), quantity));', checkoutItem);
  source = source.replace(
    /if \(!seen\.has\(sku\)\) \{\s*\/\/ catalog_data is sent with the checkout item below\.[\s\S]*?seen\.add\(sku\);\s*\}/,
    "if (!seen.has(sku)) { await shiprocketCheckout('/wh/v1/custom/product', shiprocketProductPayload(product, publicOrigin(request))); seen.add(sku); }"
  );
  if (source !== before) fs.writeFileSync(serverFile, source);
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
