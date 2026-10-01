(() => {
  const error=document.getElementById('authError');
  const safeRedirect=()=>{const value=new URLSearchParams(location.search).get('redirect')||'/account.html';return /^\/(?!\/)[\w\-./?=&%#]*$/.test(value)?value:'/account.html'};
  async function request(url,body){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.error||'Please check your details and try again.');return data}
  document.addEventListener('click',event=>{const button=event.target.closest('[data-password-toggle]');if(!button)return;const input=button.parentElement.querySelector('input'),show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Hide':'Show'});
  fetch('/api/customer/account',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(data.authenticated)location.replace(safeRedirect())}).catch(()=>{});
  const login=document.getElementById('customerLoginForm');
  if(login){
    const pilot=document.createElement('p');
    const otp=document.createElement('a');otp.href='/email-access.html?redirect='+encodeURIComponent(safeRedirect());otp.textContent='Email OTP login (owner pilot)';
    const reset=document.createElement('a');reset.href='/email-access.html?purpose=reset';reset.textContent='Email password reset (owner pilot)';
    pilot.append(otp,document.createElement('br'),reset);login.after(pilot);
  }
  if(login)login.onsubmit=async event=>{event.preventDefault();error.textContent='';const data=Object.fromEntries(new FormData(login));if(!data.login.trim()||!data.password){error.textContent='Enter your email or phone and password.';return}const button=login.querySelector('.primary');button.disabled=true;try{await request('/api/auth/customer/login',{email:data.login,password:data.password,remember:data.remember==='on'});location.replace(safeRedirect())}catch(e){error.textContent=e.message}finally{button.disabled=false}};
  const register=document.getElementById('customerRegisterForm');
  if(register)register.onsubmit=async event=>{event.preventDefault();error.textContent='';const data=Object.fromEntries(new FormData(register));if(data.fullName.trim().length<2){error.textContent='Enter your full name.';return}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)){error.textContent='Enter a valid email address.';return}if(!/^[6-9]\d{9}$/.test(data.phone.replace(/\D/g,''))){error.textContent='Enter a valid 10-digit mobile number.';return}if(data.password.length<8){error.textContent='Password must be at least 8 characters.';return}if(data.password!==data.confirmPassword){error.textContent='Passwords do not match.';return}if(data.terms!=='on'){error.textContent='Accept the Terms and Privacy Policy to continue.';return}const button=register.querySelector('.primary');button.disabled=true;try{await request('/api/auth/customer/register',data);location.replace(safeRedirect())}catch(e){error.textContent=e.message}finally{button.disabled=false}};
})();
