const test=require('node:test');
const assert=require('node:assert/strict');
const {sendConnectionTest,TEST_EMAIL}=require('../.private/brevo-mail');
test('requires server credential',async()=>{await assert.rejects(sendConnectionTest({apiKey:''}),/not configured/);});
test('sends only authorized fixed recipient and does not return secret',async()=>{
  const result=await sendConnectionTest({apiKey:'test-secret',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.brevo.com/v3/smtp/email');assert.equal(options.headers['api-key'],'test-secret');
    assert.equal(options.redirect,'error');const payload=JSON.parse(options.body);assert.deepEqual(payload.to,[{email:TEST_EMAIL}]);assert.ok(payload.htmlContent);
    return {ok:true,json:async()=>({messageId:'test-message-id'})};}});
  assert.equal(result.accepted,true);assert.equal(JSON.stringify(result).includes('test-secret'),false);
});
test('provider errors never echo secret or raw response',async()=>{
  await assert.rejects(sendConnectionTest({apiKey:'secret',fetchImpl:async()=>({ok:false,status:401,json:async()=>({message:'secret'})})}),/HTTP 401/);
});
test('network and ambiguous acceptance fail closed',async()=>{
  await assert.rejects(sendConnectionTest({apiKey:'x',fetchImpl:async()=>{throw new Error('secret');}}),/Check Brevo logs/);
  await assert.rejects(sendConnectionTest({apiKey:'x',fetchImpl:async()=>({ok:true,json:async()=>({})})}),/no message ID/);
});
