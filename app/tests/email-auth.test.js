const test=require('node:test'),assert=require('node:assert/strict');
process.env.SESSION_SECRET='test-email-auth-secret-with-more-than-32-characters';
const auth=require('../.private/email-auth');
test('normalizes email and rejects unsupported purposes',()=>{
  assert.deepEqual(auth.validate({email:' A@Example.com ',purpose:'login'}),{email:'a@example.com',purpose:'login'});
  assert.throws(()=>auth.validate({email:'a@example.com',purpose:'admin'}));
  assert.throws(()=>auth.validate({email:'bad',purpose:'reset'}));
});
function row(){const token_hash=auth.digest('challenge');return {token_hash,code_hash:auth.digest(`${token_hash}:123456`),used:false,ready:true,attempts:0,expires_at:new Date(Date.now()+60000)};}
test('valid unconsumed code is eligible',()=>assert.equal(auth.eligible(row(),'123456'),true));
test('wrong code is rejected',()=>assert.equal(auth.eligible(row(),'654321'),false));
test('consumed code cannot be reused',()=>assert.equal(auth.eligible({...row(),used:true},'123456'),false));
test('expired code is rejected',()=>assert.equal(auth.eligible({...row(),expires_at:new Date(0)},'123456'),false));
test('five attempts exhaust code',()=>assert.equal(auth.eligible({...row(),attempts:5},'123456'),false));
test('unconfirmed email cannot authenticate',()=>assert.equal(auth.eligible({...row(),ready:false},'123456'),false));
test('challenge binding prevents code substitution',()=>assert.equal(auth.eligible({...row(),token_hash:'other'},'123456'),false));
test('missing rows fail closed',()=>assert.equal(auth.eligible(null,'123456'),false));
test('malformed challenge is rejected before database access',async()=>await assert.rejects(auth.verifyCode({email:'a@example.com',purpose:'login',challenge:'short',code:'123456'}),/Invalid/));
test('reset validates password before database access',async()=>await assert.rejects(auth.verifyCode({email:'a@example.com',purpose:'reset',challenge:'a'.repeat(43),code:'123456',password:'short'}),/password/));
