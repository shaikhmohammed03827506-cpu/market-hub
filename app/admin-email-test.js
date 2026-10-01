document.getElementById('sendTest').addEventListener('click',async function(){
  const result=document.getElementById('result');this.disabled=true;result.textContent='Sending test…';
  try{const response=await fetch('/api/admin/email/connection-test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Test failed.');result.textContent=`Brevo accepted the message for ${data.recipient}. Check inbox/spam and provider delivery logs. Message ID: ${data.messageId}`;}
  catch(error){result.textContent=error.message;}finally{this.disabled=false;}
});
