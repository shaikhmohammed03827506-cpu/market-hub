'use strict';
const adapters=new Map();
function registerAuthorizedAdapter(domain,adapter){if(!domain||typeof adapter?.analyze!=='function')throw new Error('Authorized adapter is invalid.');adapters.set(String(domain).toLowerCase(),adapter)}
function adapterFor(hostname){const host=String(hostname).toLowerCase();return [...adapters].find(([domain])=>host===domain||host.endsWith(`.${domain}`))?.[1]||null}
const amazon=require('./amazon');
registerAuthorizedAdapter('amazon.in',amazon);
registerAuthorizedAdapter('amzn.in',amazon);
module.exports={registerAuthorizedAdapter,adapterFor};
