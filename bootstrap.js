const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const appDirectory = path.join(__dirname, 'app');
const checkoutPatchFile = path.join(__dirname, 'market-hub-v26-shiprocket-checkout.zip');
const checkoutPatchMarker = path.join(appDirectory, '.market-hub-v26-shiprocket-checkout');
const customerExperiencePatchFile = path.join(__dirname, 'market-hub-v27-customer-experience.zip');
const customerExperiencePatchMarker = path.join(appDirectory, '.market-hub-v27-customer-experience');
const smartSlideCartPatchFile = path.join(__dirname, 'market-hub-v28-smart-slide-cart.zip');
const smartSlideCartPatchMarker = path.join(appDirectory, '.market-hub-v28-smart-slide-cart');
const customerExperienceV29PatchFile = path.join(__dirname, 'market-hub-v29-customer-experience.zip');
const customerExperienceV29PatchMarker = path.join(appDirectory, '.market-hub-v29-customer-experience');
const premiumShoppingV30PatchFile = path.join(__dirname, 'market-hub-v30-premium-shopping.zip');
const premiumShoppingV30PatchMarker = path.join(appDirectory, '.market-hub-v30-premium-shopping');

function applyCheckoutPatch() {
  if (fs.existsSync(checkoutPatchMarker)) return;
  if (!fs.existsSync(checkoutPatchFile)) {
    throw new Error('Required Shiprocket Checkout patch is missing: market-hub-v26-shiprocket-checkout.zip');
  }
  new AdmZip(checkoutPatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(checkoutPatchMarker, 'v26 shiprocket checkout patch applied\n');
}

function applyCustomerExperiencePatch() {
  if (fs.existsSync(customerExperiencePatchMarker)) return;
  if (!fs.existsSync(customerExperiencePatchFile)) {
    throw new Error('Required customer experience patch is missing: market-hub-v27-customer-experience.zip');
  }
  new AdmZip(customerExperiencePatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(customerExperiencePatchMarker, 'v27 customer experience patch applied\n');
}

function applySmartSlideCartPatch() {
  if (fs.existsSync(smartSlideCartPatchMarker)) return;
  if (!fs.existsSync(smartSlideCartPatchFile)) {
    throw new Error('Required smart slide cart patch is missing: market-hub-v28-smart-slide-cart.zip');
  }
  new AdmZip(smartSlideCartPatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(smartSlideCartPatchMarker, 'v28 smart slide cart patch applied\n');
}

function applyCustomerExperienceV29Patch() {
  if (fs.existsSync(customerExperienceV29PatchMarker)) return;
  if (!fs.existsSync(customerExperienceV29PatchFile)) throw new Error('Required v29 customer experience patch is missing: market-hub-v29-customer-experience.zip');
  new AdmZip(customerExperienceV29PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(customerExperienceV29PatchMarker, 'v29 customer experience patch applied\n');
}

function applyPremiumShoppingV30Patch() {
  if (fs.existsSync(premiumShoppingV30PatchMarker)) return;
  if (!fs.existsSync(premiumShoppingV30PatchFile)) throw new Error('Required v30 premium shopping patch is missing: market-hub-v30-premium-shopping.zip');
  new AdmZip(premiumShoppingV30PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(premiumShoppingV30PatchMarker, 'v30 premium shopping patch applied\n');
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
}
applyCheckoutPatch();
applyCustomerExperiencePatch();
applySmartSlideCartPatch();
applyCustomerExperienceV29Patch();
applyPremiumShoppingV30Patch();
require(path.join(appDirectory, 'server.js'));
