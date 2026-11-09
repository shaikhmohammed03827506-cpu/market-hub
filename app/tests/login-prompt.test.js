const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../login-prompt.js'),'utf8');
async function run({path='/',seen=false,status=401,authenticated=false,blocked=false}={}){
  let callback,delay,shown=false,saved=false;
  const links={};
  const dialog={setAttribute(){},querySelector:s=>links[s]||(links[s]={}),addEventListener(){},showModal(){shown=true}};
  const ctx={window:{},HTMLDialogElement:function(){},location:{pathname:path,search:''},
    sessionStorage:{getItem:()=>seen,setItem(){saved=true}},
    fetch:async()=>({status,ok:status===200,json:async()=>({authenticated})}),
    setTimeout(fn,ms){callback=fn;delay=ms},
    document:{visibilityState:'visible',querySelector:()=>blocked,createElement:()=>dialog,body:{append(){}}}};
  vm.runInNewContext(code,ctx);
  if(callback)await callback();
  return {shown,delay,saved,links};
}
test('guest invitation opens after 3500ms with local sign-in redirect',async()=>{
  const result=await run();assert.equal(result.delay,3500);assert.equal(result.shown,true);
  assert.equal(result.links['[data-login-link]'].href,'/login.html?redirect=%2F');
});
test('authenticated customers never get prompt',async()=>assert.equal((await run({status:200,authenticated:true})).shown,false));
test('closed invitation does not repeat in tab session',async()=>assert.equal((await run({seen:true})).shown,false));
test('checkout and focused forms are not interrupted',async()=>assert.equal((await run({blocked:true})).shown,false));
test('login, admin and checkout routes are excluded',async()=>{for(const path of ['/login.html','/admin.html','/checkout-success.html'])assert.equal((await run({path})).shown,false)});
test('account service error does not trigger login prompt',async()=>assert.equal((await run({status:503})).shown,false));
