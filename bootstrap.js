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
const businessOperationsV31PatchFile = path.join(__dirname, 'market-hub-v31-business-operations.zip');
const businessOperationsV31PatchMarker = path.join(appDirectory, '.market-hub-v31-business-operations');
const premiumRenovationV32PatchFile = path.join(__dirname, 'market-hub-v32-premium-renovation.zip');
const premiumRenovationV32PatchMarker = path.join(appDirectory, '.market-hub-v32-premium-renovation');
const luxuryExperienceV33PatchFile = path.join(__dirname, 'market-hub-v33-luxury-experience.zip');
const luxuryExperienceV33PatchMarker = path.join(appDirectory, '.market-hub-v33-luxury-experience');
const finalProductionV34PatchFile = path.join(__dirname, 'market-hub-v34-final-production.zip');
const finalProductionV34PatchMarker = path.join(appDirectory, '.market-hub-v34-final-production');
const aiShoppingV351PatchFile = path.join(__dirname, 'market-hub-v35-1-ai-shopping-core.zip');
const aiShoppingV351PatchMarker = path.join(appDirectory, '.market-hub-v35-1-ai-shopping-core');
const smartDiscoveryV352PatchFile = path.join(__dirname, 'market-hub-v35-2-smart-discovery.zip');
const smartDiscoveryV352PatchMarker = path.join(appDirectory, '.market-hub-v35-2-smart-discovery');
const aiAdminV353PatchFile = path.join(__dirname, 'market-hub-v35-3-ai-admin-assistant.zip');
const aiAdminV353PatchMarker = path.join(appDirectory, '.market-hub-v35-3-ai-admin-assistant');
const marketingV36PatchFile = path.join(__dirname, 'market-hub-v36-marketing-automation-suite.zip');
const marketingV36PatchMarker = path.join(appDirectory, '.market-hub-v36-marketing-automation-suite');
const marketplaceV37PatchFile = path.join(__dirname, 'market-hub-v37-omnichannel-marketplace.zip');
const marketplaceV37PatchMarker = path.join(appDirectory, '.market-hub-v37-omnichannel-marketplace');
const enterpriseV38PatchFile = path.join(__dirname, 'market-hub-v38-ultimate-enterprise-edition.zip');
const enterpriseV38PatchMarker = path.join(appDirectory, '.market-hub-v38-ultimate-enterprise-edition');
const mobileV39PatchFile = path.join(__dirname, 'market-hub-v39-mobile-commerce-suite.zip');
// v39 hotfix marker forces existing deployments to extract the updated v39 archive once.
const mobileV39PatchMarker = path.join(appDirectory, '.market-hub-v39-mobile-pwa-hotfix-4');
const storefrontV40PatchFile = path.join(__dirname, 'market-hub-v40-universal-smart-cart.zip');
const storefrontV40PatchMarker = path.join(appDirectory, '.market-hub-v40-global-cart-wishlist-hotfix-1');
const customerAccountV41PatchFile = path.join(__dirname, 'market-hub-v41-customer-account-orders.zip');
const customerAccountV41PatchMarker = path.join(appDirectory, '.market-hub-v41-customer-account-orders');
const orderAccountV42PatchFile = path.join(__dirname, 'market-hub-v42-order-account-linking.zip');
const orderAccountV42PatchMarker = path.join(appDirectory, '.market-hub-v42-order-account-linking');
const navigationV411PatchFile = path.join(__dirname, 'market-hub-v41-1-mobile-navigation-auth.zip');
const navigationV411PatchMarker = path.join(appDirectory, '.market-hub-v41-1-mobile-navigation-auth');
const smartImportV42PatchFile = path.join(__dirname, 'market-hub-v42-smart-product-import-suite.zip');
const smartImportV42PatchMarker = path.join(appDirectory, '.market-hub-v42-smart-product-import-suite');

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

function applyBusinessOperationsV31Patch() {
  if (fs.existsSync(businessOperationsV31PatchMarker)) return;
  if (!fs.existsSync(businessOperationsV31PatchFile)) throw new Error('Required v31 business operations patch is missing: market-hub-v31-business-operations.zip');
  new AdmZip(businessOperationsV31PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(businessOperationsV31PatchMarker, 'v31 business operations patch applied\n');
}

function applyPremiumRenovationV32Patch() {
  if (fs.existsSync(premiumRenovationV32PatchMarker)) return;
  if (!fs.existsSync(premiumRenovationV32PatchFile)) throw new Error('Required v32 premium renovation patch is missing: market-hub-v32-premium-renovation.zip');
  new AdmZip(premiumRenovationV32PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(premiumRenovationV32PatchMarker, 'v32 premium renovation patch applied\n');
}

function applyLuxuryExperienceV33Patch() {
  if (fs.existsSync(luxuryExperienceV33PatchMarker)) return;
  if (!fs.existsSync(luxuryExperienceV33PatchFile)) throw new Error('Required v33 luxury experience patch is missing: market-hub-v33-luxury-experience.zip');
  new AdmZip(luxuryExperienceV33PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(luxuryExperienceV33PatchMarker, 'v33 luxury experience patch applied\n');
}

function applyFinalProductionV34Patch() {
  if (fs.existsSync(finalProductionV34PatchMarker)) return;
  if (!fs.existsSync(finalProductionV34PatchFile)) throw new Error('Required v34 final production patch is missing: market-hub-v34-final-production.zip');
  new AdmZip(finalProductionV34PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(finalProductionV34PatchMarker, 'v34 final production patch applied\n');
}

function applyAiShoppingV351Patch() {
  if (fs.existsSync(aiShoppingV351PatchMarker)) return;
  if (!fs.existsSync(aiShoppingV351PatchFile)) throw new Error('Required v35.1 AI shopping patch is missing: market-hub-v35-1-ai-shopping-core.zip');
  new AdmZip(aiShoppingV351PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(aiShoppingV351PatchMarker, 'v35.1 smart recommendation patch applied\n');
}

function applySmartDiscoveryV352Patch() {
  if (fs.existsSync(smartDiscoveryV352PatchMarker)) return;
  if (!fs.existsSync(smartDiscoveryV352PatchFile)) throw new Error('Required v35.2 smart discovery patch is missing: market-hub-v35-2-smart-discovery.zip');
  new AdmZip(smartDiscoveryV352PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(smartDiscoveryV352PatchMarker, 'v35.2 smart discovery patch applied\n');
}

function applyAiAdminV353Patch() {
  if (fs.existsSync(aiAdminV353PatchMarker)) return;
  if (!fs.existsSync(aiAdminV353PatchFile)) throw new Error('Required v35.3 admin assistant patch is missing: market-hub-v35-3-ai-admin-assistant.zip');
  new AdmZip(aiAdminV353PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(aiAdminV353PatchMarker, 'v35.3 business intelligence patch applied\n');
}

function applyMarketingV36Patch() {
  if (fs.existsSync(marketingV36PatchMarker)) return;
  if (!fs.existsSync(marketingV36PatchFile)) throw new Error('Required v36 marketing patch is missing: market-hub-v36-marketing-automation-suite.zip');
  new AdmZip(marketingV36PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(marketingV36PatchMarker, 'v36 marketing automation patch applied\n');
}

function applyMarketplaceV37Patch() {
  if (fs.existsSync(marketplaceV37PatchMarker)) return;
  if (!fs.existsSync(marketplaceV37PatchFile)) throw new Error('Required v37 omnichannel marketplace patch is missing: market-hub-v37-omnichannel-marketplace.zip');
  new AdmZip(marketplaceV37PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(marketplaceV37PatchMarker, 'v37 omnichannel marketplace patch applied\n');
}

function applyEnterpriseV38Patch() {
  if (fs.existsSync(enterpriseV38PatchMarker)) return;
  if (!fs.existsSync(enterpriseV38PatchFile)) throw new Error('Required v38 enterprise patch is missing: market-hub-v38-ultimate-enterprise-edition.zip');
  new AdmZip(enterpriseV38PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(enterpriseV38PatchMarker, 'v38 enterprise patch applied\n');
}

function applyMobileV39Patch() {
  if (fs.existsSync(mobileV39PatchMarker)) return;
  if (!fs.existsSync(mobileV39PatchFile)) throw new Error('Required v39 mobile commerce patch is missing: market-hub-v39-mobile-commerce-suite.zip');
  new AdmZip(mobileV39PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(mobileV39PatchMarker, 'v39 mobile PWA hotfix patch applied\n');
}

function applyStorefrontV40Patch() {
  if (fs.existsSync(storefrontV40PatchMarker)) return;
  if (!fs.existsSync(storefrontV40PatchFile)) throw new Error('Required v40 storefront patch is missing: market-hub-v40-universal-smart-cart.zip');
  new AdmZip(storefrontV40PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(storefrontV40PatchMarker, 'v40 global cart and wishlist hotfix 1 applied\n');
}

function applyCustomerAccountV41Patch() {
  if (fs.existsSync(customerAccountV41PatchMarker)) return;
  if (!fs.existsSync(customerAccountV41PatchFile)) throw new Error('Required v41 customer account patch is missing: market-hub-v41-customer-account-orders.zip');
  new AdmZip(customerAccountV41PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(customerAccountV41PatchMarker, 'v41 customer account and order management applied\n');
}

function applyOrderAccountV42Patch() {
  if (fs.existsSync(orderAccountV42PatchMarker)) return;
  if (!fs.existsSync(orderAccountV42PatchFile)) throw new Error('Required v42 order account linking patch is missing: market-hub-v42-order-account-linking.zip');
  new AdmZip(orderAccountV42PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(orderAccountV42PatchMarker, 'v42 order account linking patch applied\n');
}

function applyNavigationV411Patch() {
  if (fs.existsSync(navigationV411PatchMarker)) return;
  if (!fs.existsSync(navigationV411PatchFile)) throw new Error('Required v41.1 navigation patch is missing: market-hub-v41-1-mobile-navigation-auth.zip');
  new AdmZip(navigationV411PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(navigationV411PatchMarker, 'v41.1 mobile navigation and separate authentication applied\n');
}

function applySmartImportV42Patch() {
  if (fs.existsSync(smartImportV42PatchMarker)) return;
  if (!fs.existsSync(smartImportV42PatchFile)) throw new Error('Required v42 Smart Product Import patch is missing.');
  new AdmZip(smartImportV42PatchFile).extractAllTo(appDirectory, true);
  fs.writeFileSync(smartImportV42PatchMarker, 'v42 smart product import suite applied\n');
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
applyBusinessOperationsV31Patch();
applyPremiumRenovationV32Patch();
applyLuxuryExperienceV33Patch();
applyFinalProductionV34Patch();
applyAiShoppingV351Patch();
applySmartDiscoveryV352Patch();
applyAiAdminV353Patch();
applyMarketingV36Patch();
applyMarketplaceV37Patch();
applyEnterpriseV38Patch();
applyMobileV39Patch();
applyStorefrontV40Patch();
applyCustomerAccountV41Patch();
applyOrderAccountV42Patch();
applyNavigationV411Patch();
applySmartImportV42Patch();
require(path.join(appDirectory, 'server.js'));
