'use strict';
// Exercise real auth functions with an isolated SQL adapter; never contact production.
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../.private/email-auth'),'utf8');
function harness(options={}){
  const state={rows:[],sent:[],queries:[],revoked:null,user:{id:'test-user',email:'owner@example.test',password_hash:'original-hash',is_active:true}};
  const query=async(sql,args=[])=>{
    const q=sql.replace(/\s+/g,' ').trim();state.queries.push(q);
    const result=rows=>({rows,rowCount:rows.length});
    if(q.startsWith('create ')||['begin','commit','rollback'].includes(q)||q.startsWith('select pg_advisory')||q.startsWith('delete '))return result([]);
    if(q.startsWith('select count(*)'))return result([{total:0,per_email:0,per_ip:0,recent:0,...options.counts}]);
    if(q.startsWith('select id,password_hash'))return result(options.ambiguous?[state.user,state.user]:options.absent?[]:[state.user]);
    if(q.startsWith('select id,email'))return result([state.user]);
    if(q.startsWith('insert into customer_email_challenges')){
      const [token_hash,email,purpose,user_id,password_snapshot,code_hash,ip_hash]=args;
      state.rows.push({token_hash,email,purpose,user_id,password_snapshot,code_hash,ip_hash,expires_at:new Date(Date.now()+600000),attempts:0,used:false,ready:false});return result([]);
    }
    if(q.startsWith('select * from customer_email_challenges'))return result(state.rows.filter(r=>r.token_hash===args[0]).map(r=>({...r})));
    if(q.startsWith('update customer_email_challenges')){
      const rows=state.rows.filter(r=>q.includes('where email=')?r.email===args[0]&&r.purpose===args[1]:q.includes('where user_id=')?r.user_id===args[0]:r.token_hash===args[0]);
      rows.forEach(r=>{if(q.includes('set used=true'))r.used=true;if(q.includes('set ready=true'))r.ready=true;if(q.includes('set attempts='))r.attempts++;});return result([]);
    }
    if(q.startsWith('update users set password_hash')){state.user.password_hash=args[1];return result([]);}
    if(q.startsWith('insert into customer_session_revocations')){state.revoked=new Date();return result([]);}
    if(q.startsWith('select revoked_at'))return result(state.revoked?[{revoked_at:state.revoked}]:[]);
    throw new Error('Unhandled test query: '+q);
  };
  const db={query,connect:async()=>({query,release(){}})};
  const context={module:{exports:{}},Buffer,process:{env:{SESSION_SECRET:'isolated-auth-flow-test-secret-with-32-characters',BREVO_API_KEY:'test-only',EMAIL_OTP_ENABLED:options.pilot?'false':'true'}},require:id=>{
    if(id==='node:crypto')return crypto;
    if(id==='../db')return {database:()=>db};
    if(id==='./brevo-mail')return {TEST_EMAIL:'owner@example.test',sendEmailCode:async(email,code,purpose)=>{if(options.providerFail)throw new Error('private-provider-error');state.sent.push({email,code,purpose});}};
    throw new Error('Unexpected module');
  }};
  vm.runInNewContext(source,context);return {auth:context.module.exports,state};
}
async function request(h,purpose='login'){
  const result=await h.auth.requestCode({email:'owner@example.test',purpose},'test-ip');
  return {email:'owner@example.test',purpose,challenge:result.challenge,code:h.state.sent.at(-1)?.code};
}
test('successful verification consumes challenge; replay is rejected',async()=>{
  const h=harness(),input=await request(h);assert.equal((await h.auth.verifyCode(input)).userId,'test-user');
  await assert.rejects(h.auth.verifyCode(input),/Invalid or expired/);
  assert.ok(h.state.queries.some(q=>q.includes('for update')));
});
test('five wrong attempts persist and block the correct code',async()=>{
  const h=harness(),input=await request(h);
  for(let i=0;i<5;i++)await assert.rejects(h.auth.verifyCode({...input,code:'000000'}),/Invalid or expired/);
  assert.equal(h.state.rows[0].attempts,5);await assert.rejects(h.auth.verifyCode(input),/Invalid or expired/);
});
test('expired code and wrong purpose are rejected',async()=>{
  const h=harness(),input=await request(h);
  await assert.rejects(h.auth.verifyCode({...input,purpose:'reset',password:'test-new-password'}),/Invalid or expired/);
  h.state.rows[0].expires_at=new Date(0);await assert.rejects(h.auth.verifyCode(input),/Invalid or expired/);
});
test('resend invalidates previous challenge',async()=>{
  const h=harness(),old=await request(h),fresh=await request(h);
  await assert.rejects(h.auth.verifyCode(old),/Invalid or expired/);assert.equal((await h.auth.verifyCode(fresh)).purpose,'login');
});
for(const counts of [{total:200},{per_email:5},{per_ip:15},{recent:1}])test('request quota enforced: '+JSON.stringify(counts),async()=>{
  const h=harness({counts});await assert.rejects(request(h),/Please wait/);assert.equal(h.state.sent.length,0);
});
for(const option of ['absent','ambiguous','providerFail'])test(option+' returns generic response without usable challenge',async()=>{
  const h=harness({[option]:true}),input=await request(h);
  assert.equal(h.state.sent.length,0);await assert.rejects(h.auth.verifyCode({...input,code:'123456'}),/Invalid or expired/);
});
test('reset hashes password, invalidates all challenges and revokes old sessions',async()=>{
  const h=harness(),login=await request(h),reset=await request(h,'reset');
  await h.auth.verifyCode({...reset,password:'new-test-password'});
  assert.match(h.state.user.password_hash,/^scrypt\$/);assert.notEqual(h.state.user.password_hash,'new-test-password');
  assert.ok(h.state.rows.every(r=>r.used));await assert.rejects(h.auth.verifyCode(login),/Invalid or expired/);
  assert.equal(await h.auth.sessionRevoked({userId:'test-user',issuedAt:0}),true);
  assert.equal(await h.auth.sessionRevoked({userId:'test-user',issuedAt:Date.now()+1000}),false);
});
test('password change after code issuance invalidates that code',async()=>{
  const h=harness(),input=await request(h);h.state.user.password_hash='changed-password';
  await assert.rejects(h.auth.verifyCode(input),/Invalid or expired/);
});
test('disabled user cannot authenticate with previously issued code',async()=>{
  const h=harness(),input=await request(h);h.state.user.is_active=false;
  await assert.rejects(h.auth.verifyCode(input),/Invalid or expired/);
});
test('pilot rejects non-owner while public mode accepts registered customer requests',async()=>{
  const h=harness({pilot:true});await assert.rejects(h.auth.requestCode({email:'other@example.test',purpose:'login'},'ip'),/being tested/);
  const enabled=harness();enabled.state.user.email='other@example.test';
  const result=await enabled.auth.requestCode({email:'other@example.test',purpose:'login'},'ip');
  assert.equal(enabled.state.sent[0].email,'other@example.test');assert.equal(result.challenge.length,43);
});
