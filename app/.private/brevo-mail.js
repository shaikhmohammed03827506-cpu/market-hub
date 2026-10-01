'use strict';
const TEST_EMAIL = 'shaikhmohammed03827506@gmail.com';
async function sendConnectionTest({apiKey=process.env.BREVO_API_KEY,fetchImpl=fetch}={}) {
  if (!apiKey) throw new Error('Brevo API key is not configured in this deployment.');
  let response;
  try {
    response=await fetchImpl('https://api.brevo.com/v3/smtp/email',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{'api-key':apiKey,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({sender:{name:'MARKET HUB',email:TEST_EMAIL},to:[{email:TEST_EMAIL}],
        subject:'MARKET HUB — email connection test',
        textContent:'This is the authorized MARKET HUB email connection test. No order or password has been changed. This is not a login OTP.',
        htmlContent:'<h1>MARKET HUB</h1><p>This is your authorized email connection test.</p><p>No order or password has been changed. This is not a login OTP.</p>',
        tags:['market-hub-connection-test']})
    });
  } catch { throw new Error('Email provider did not respond. Check Brevo logs before retrying.'); }
  if (!response.ok) throw new Error(`Brevo rejected the test (HTTP ${response.status}). Check account activation, API key and sender settings.`);
  const data=await response.json();
  if (!data.messageId) throw new Error('Brevo returned no message ID. Check provider logs before retrying.');
  return {accepted:true,messageId:data.messageId,recipient:TEST_EMAIL};
}
async function sendEmailCode(email,code,purpose) {
  if(!process.env.BREVO_API_KEY)throw new Error('Email is unavailable.');
  if(!/^\d{6}$/.test(code))throw new Error('Invalid code format.');
  const label=purpose==='reset'?'password reset':'sign-in';
  const response=await fetch('https://api.brevo.com/v3/smtp/email',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{'api-key':process.env.BREVO_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({sender:{name:'MARKET HUB',email:TEST_EMAIL},to:[{email}],
      subject:`${code} is your MARKET HUB ${label} code`,
      textContent:`Your MARKET HUB ${label} code is ${code}. It expires in 10 minutes and works once. Do not share this code. If you did not request it, ignore this email.`,
      htmlContent:`<h1>MARKET HUB</h1><p>Your ${label} code:</p><h2>${code}</h2><p>Expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.</p>`,tags:['market-hub-email-auth']})
  });
  if(!response.ok)throw new Error('Email delivery request failed.');
  const data=await response.json();if(!data.messageId)throw new Error('Email delivery request was not confirmed.');
}
module.exports={sendConnectionTest,sendEmailCode,TEST_EMAIL};
