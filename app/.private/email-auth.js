'use strict';
const crypto=require('node:crypto');
const {database}=require('../db');
const {sendEmailCode,TEST_EMAIL}=require('./brevo-mail');
let schema;
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
function validate(input){
  const email=normalizeEmail(input.email),purpose=input.purpose;
  if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email.');
  if(!['login','reset'].includes(purpose))throw new Error('Invalid verification purpose.');
  return {email,purpose};
}
function digest(value){
  const secret=process.env.SESSION_SECRET||'';if(secret.length<32)throw new Error('Email verification is unavailable.');
  return crypto.createHmac('sha256',secret).update(value).digest('hex');
}
function matches(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function eligible(row,code,now=Date.now()){
  return !!row&&!row.used&&row.ready&&row.attempts<5&&new Date(row.expires_at).getTime()>now&&matches(row.code_hash,digest(`${row.token_hash}:${code}`));
}
async function ensure(){
  if(!schema)schema=database().query(`
    create table if not exists customer_email_challenges (
      token_hash text primary key,email text not null,purpose text not null,user_id uuid,
      password_snapshot text,code_hash text not null,ip_hash text not null,
      created_at timestamptz not null default now(),expires_at timestamptz not null,
      attempts integer not null default 0,ready boolean not null default false,used boolean not null default false);
    create index if not exists customer_email_challenges_created_idx on customer_email_challenges(created_at);
    create table if not exists customer_session_revocations(user_id uuid primary key,revoked_at timestamptz not null);
  `).catch(error=>{schema=null;throw error;});
  return schema;
}
async function requestCode(input,ip){
  const {email,purpose}=validate(input);
  if(!process.env.BREVO_API_KEY)throw new Error('Email verification is unavailable.');
  // Pilot prevents sending to real customers until owner flow has been tested.
  if(process.env.EMAIL_OTP_ENABLED!=='true'&&email!==TEST_EMAIL)throw new Error('Email login is being tested. Please use password login.');
  await ensure();
  const token=crypto.randomBytes(32).toString('base64url'),tokenHash=digest(token);
  const code=String(crypto.randomInt(100000,1000000)),ipHash=digest(`ip:${ip}`);
  const client=await database().connect();let customer;
  try{
    await client.query('begin');
    // One database-wide lock makes quotas atomic across serverless instances.
    await client.query('select pg_advisory_xact_lock(184913721)');
    await client.query("delete from customer_email_challenges where created_at < now()-interval '2 days'");
    const counts=await client.query(`select
      count(*) filter(where created_at>now()-interval '24 hours')::int as total,
      count(*) filter(where email=$1 and created_at>now()-interval '1 hour')::int as per_email,
      count(*) filter(where ip_hash=$2 and created_at>now()-interval '1 hour')::int as per_ip,
      count(*) filter(where email=$1 and created_at>now()-interval '60 seconds')::int as recent
      from customer_email_challenges`,[email,ipHash]);
    const c=counts.rows[0];if(c.total>=200||c.per_email>=5||c.per_ip>=15||c.recent>0)throw new Error('Please wait before requesting another code, or use password login.');
    const users=await client.query("select id,password_hash from users where lower(email)=$1 and is_active=true and password_hash is not null and password_hash<>''",[email]);
    if(users.rowCount===1)customer=users.rows[0];
    await client.query('update customer_email_challenges set used=true where email=$1 and purpose=$2 and used=false',[email,purpose]);
    await client.query(`insert into customer_email_challenges(token_hash,email,purpose,user_id,password_snapshot,code_hash,ip_hash,expires_at)
      values($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`,[tokenHash,email,purpose,customer?.id||null,customer?digest(customer.password_hash):null,digest(`${tokenHash}:${code}`),ipHash]);
    await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  // Identical public responses for absent/ambiguous accounts and provider failures.
  if(customer){
    try{await sendEmailCode(email,code,purpose);await database().query('update customer_email_challenges set ready=true where token_hash=$1',[tokenHash]);}
    catch{await database().query('update customer_email_challenges set used=true where token_hash=$1',[tokenHash]);}
  }
  return {challenge:token,message:'If this email belongs to an active registered account, a code will arrive shortly. Check spam too.',expiresIn:600};
}
const hashPassword=password=>new Promise((resolve,reject)=>{
  const salt=crypto.randomBytes(16).toString('base64url');crypto.scrypt(password,salt,64,(err,key)=>err?reject(err):resolve(`scrypt$${salt}$${key.toString('base64url')}`));
});
async function verifyCode(input){
  const {email,purpose}=validate(input);
  if(!/^[A-Za-z0-9_-]{43}$/.test(String(input.challenge||''))||!/^\d{6}$/.test(String(input.code||'')))throw new Error('Invalid or expired code.');
  const password=String(input.password||'');
  if(purpose==='reset'&&(password.length<8||password.length>200))throw new Error('Use a password of 8–200 characters.');
  await ensure();const client=await database().connect();let verified=null;
  try{
    await client.query('begin');
    const result=await client.query('select * from customer_email_challenges where token_hash=$1 for update',[digest(input.challenge)]);
    const row=result.rows[0];
    if(row&&!row.used){
      await client.query('update customer_email_challenges set attempts=attempts+1 where token_hash=$1',[row.token_hash]);
      if(row.email===email&&row.purpose===purpose&&eligible(row,input.code)&&row.user_id){
        const found=await client.query('select id,email,password_hash,is_active from users where id=$1 for update',[row.user_id]);
        const user=found.rows[0];
        if(user?.is_active&&normalizeEmail(user.email)===email&&matches(digest(user.password_hash||''),row.password_snapshot)){
          await client.query('update customer_email_challenges set used=true where token_hash=$1',[row.token_hash]);
          if(purpose==='reset'){
            await client.query('update users set password_hash=$2,updated_at=now() where id=$1',[user.id,await hashPassword(password)]);
            await client.query('insert into customer_session_revocations(user_id,revoked_at) values($1,clock_timestamp()) on conflict(user_id) do update set revoked_at=excluded.revoked_at',[user.id]);
            await client.query('update customer_email_challenges set used=true where user_id=$1',[user.id]);
          }
          verified={userId:user.id,purpose};
        }
      }
    }
    await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  if(!verified)throw new Error('Invalid or expired code. Request a new code if needed.');
  return verified;
}
async function sessionRevoked(session){
  await ensure();const result=await database().query('select revoked_at from customer_session_revocations where user_id=$1',[session.userId]);
  return result.rowCount>0&&Number(session.issuedAt||0)<=new Date(result.rows[0].revoked_at).getTime();
}
module.exports={requestCode,verifyCode,sessionRevoked,validate,normalizeEmail,digest,matches,eligible};
