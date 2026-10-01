const diagnostic=document.createElement('pre');diagnostic.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';document.querySelector('.auth-box').append(diagnostic);
fetch('/api/admin/email/pilot-status',{cache:'no-store'}).then(r=>r.json()).then(data=>{diagnostic.textContent='Owner pilot diagnostic (no secrets):\n'+JSON.stringify(data,null,2);}).catch(()=>{diagnostic.textContent='Diagnostic unavailable.';});
document.getElementById('sendTest').addEventListener('click',async function(){
  const result=document.getElementById('result');this.disabled=true;result.textContent='Sending test…';
  try{const response=await fetch('/api/admin/email/connection-test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Test failed.');result.textContent=`Brevo accepted the message for ${data.recipient}. Check inbox/spam and provider delivery logs. Message ID: ${data.messageId}`;}
  catch(error){result.textContent=error.message;}finally{this.disabled=false;}
});
