(()=>{
  const style=document.createElement('style');style.textContent='[hidden]{display:none!important}';document.head.append(style);
  const params=new URLSearchParams(location.search),purpose=params.get('purpose')==='reset'?'reset':'login';
  const requestForm=document.getElementById('requestCode'),verifyForm=document.getElementById('verifyCode'),status=document.getElementById('emailStatus');let challenge='',email='';
  fetch('/api/auth/email/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
    if(data?.enabled){const note=document.querySelector('.auth-box small');if(note)note.textContent='Receive a one-time code at your registered email. Codes expire in 10 minutes. Password login is also available.';}
  }).catch(()=>{});
  if(purpose==='reset'){document.getElementById('title').textContent='Reset your password';document.getElementById('newPasswordLabel').hidden=false;verifyForm.elements.password.required=true;document.getElementById('verifyButton').textContent='Verify code and reset password';}
  const redirect=params.get('redirect')||'/account.html',safeRedirect=/^\/(?!\/)[\w\-./?=&%#]*$/.test(redirect)?redirect:'/account.html';
  async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Please try again.');return data;}
  requestForm.addEventListener('submit',async e=>{e.preventDefault();const button=requestForm.querySelector('button');button.disabled=true;status.textContent='Requesting code…';challenge='';verifyForm.hidden=true;
    try{email=requestForm.elements.email.value.trim().toLowerCase();const data=await post('/api/auth/email/request',{email,purpose});challenge=data.challenge;verifyForm.hidden=false;status.textContent=data.message;verifyForm.elements.code.value='';verifyForm.elements.code.focus();button.textContent='Resend after 60 seconds';setTimeout(()=>{button.disabled=false;button.textContent='Resend email code';},60000);}
    catch(error){status.textContent=error.message;button.disabled=false;}
  });
  verifyForm.addEventListener('submit',async e=>{e.preventDefault();if(!challenge)return;const button=verifyForm.querySelector('button');button.disabled=true;
    try{const data=await post('/api/auth/email/verify',{email,purpose,challenge,code:verifyForm.elements.code.value.trim(),...(purpose==='reset'?{password:verifyForm.elements.password.value}:{})});if(data.authenticated)location.assign(safeRedirect);else{verifyForm.reset();verifyForm.hidden=true;requestForm.hidden=true;status.textContent='Password reset complete. Please sign in using your new password. Previous sessions have been signed out.';}}
    catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  });
})();
