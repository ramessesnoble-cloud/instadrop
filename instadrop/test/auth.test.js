// Auth end-to-end test. Start a server first: PORT=3112 node server.js   (add DATABASE_URL=... to test Postgres). Then: node test/auth.test.js
const crypto=require('crypto'); const BASE='http://localhost:3112';
let pass=0,fail=0; const ok=(c,n,extra='')=>{c?pass++:fail++; console.log((c?'PASS':'FAIL')+'  '+n+(c?'':'  '+extra))};
function jar(){return {c:''}}
async function call(path,{m='GET',b,tok,j,h={}}={}){const headers={'content-type':'application/json','x-requested-with':'instadrop',...h}; if(tok)headers.authorization='Bearer '+tok; if(j&&j.c)headers.cookie=j.c;
  const r=await fetch(BASE+path,{method:m,headers,body:b?JSON.stringify(b):undefined}); const sc=r.headers.get('set-cookie'); if(sc&&j){const v=sc.split(';')[0]; j.c=v.endsWith('=')?'':v; j.raw=sc}
  let d={};try{d=await r.json()}catch{} return {s:r.status,d,h:r.headers}}
// independent TOTP
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const dec=s=>{let bits='';for(const ch of s)bits+=B32.indexOf(ch).toString(2).padStart(5,'0');const o=[];for(let i=0;i+8<=bits.length;i+=8)o.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(o)};
const totp=(sec,off=0)=>{const c=Math.floor(Date.now()/30000)+off;const b=Buffer.alloc(8);b.writeUInt32BE(Math.floor(c/2**32),0);b.writeUInt32BE(c>>>0,4);const h=crypto.createHmac('sha1',dec(sec)).update(b).digest();const o=h[19]&15;return String(((h.readUInt32BE(o)&0x7fffffff)%1e6)).padStart(6,'0')};
(async()=>{
 let r=await call('/api/health'); ok(r.s===200&&r.d.ok,'health check');
 // headers
 ok(r.h.get('x-content-type-options')==='nosniff'&&r.h.get('x-frame-options')==='DENY','security headers');
 // signup validation
 r=await call('/api/auth/signup',{m:'POST',b:{name:'Ann',identifier:'ann@example.com',password:'short'}}); ok(r.s===400,'weak (short) password rejected',JSON.stringify(r.d));
 r=await call('/api/auth/signup',{m:'POST',b:{name:'Ann',identifier:'ann@example.com',password:'password123'}}); ok(r.s===400&&r.d.code==='weak','common password rejected');
 r=await call('/api/auth/signup',{m:'POST',b:{name:'Ann',identifier:'not-an-email',password:'Tr0ub4dor&3x'}}); ok(r.s===400,'bad identifier rejected');
 const J=jar(); r=await call('/api/auth/signup',{m:'POST',j:J,b:{name:'Ann',identifier:'Ann@Example.com',password:'correct horse battery'}});
 ok(r.s===201&&r.d.access&&r.d.user.email==='ann@example.com','signup ok, email normalised',JSON.stringify(r.d));
 ok(/HttpOnly/.test(J.raw)&&/SameSite=Strict/.test(J.raw)&&/Path=\/api\/auth/.test(J.raw),'refresh cookie is HttpOnly + SameSite=Strict + scoped');
 ok(!JSON.stringify(r.d).includes('scrypt'),'no hash in response');
 const access1=r.d.access;
 r=await call('/api/auth/signup',{m:'POST',b:{name:'Ann2',identifier:'ann@example.com',password:'correct horse battery'}}); ok(r.s===409,'duplicate email -> 409');
 r=await call('/api/auth/signup',{m:'POST',b:{name:'Pho',identifier:'0772 123 456',dial:'256',password:'correct horse battery'}}); ok(r.s===201&&r.d.user.phone==='+256772123456','phone signup normalised to +256772123456',JSON.stringify(r.d));
 r=await call('/api/auth/me',{tok:access1}); ok(r.s===200&&r.d.user.name==='Ann','/me with access token');
 r=await call('/api/auth/me'); ok(r.s===401,'/me without token -> 401');
 // token tampering
 const [h,p,s]=access1.split('.'); const none=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+p+'.';
 r=await call('/api/auth/me',{tok:none}); ok(r.s===401,'alg=none token rejected');
 const claims=JSON.parse(Buffer.from(p,'base64url')); claims.role='admin'; const forged=h+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.'+s;
 r=await call('/api/auth/me',{tok:forged}); ok(r.s===401,'tampered claims rejected');
 // login: wrong, right; enumeration timing
 const t0=Date.now(); r=await call('/api/auth/login',{m:'POST',b:{identifier:'ann@example.com',password:'wrong password 1'}}); const tKnown=Date.now()-t0;
 const msgKnown=r.d.error; ok(r.s===401,'wrong password -> 401');
 const t1=Date.now(); r=await call('/api/auth/login',{m:'POST',b:{identifier:'nobody@example.com',password:'wrong password 1'}}); const tUnknown=Date.now()-t1;
 ok(r.s===401&&r.d.error===msgKnown,'unknown account gives the SAME message');
 ok(Math.abs(tKnown-tUnknown)<150,`unknown vs known account timing similar (${tKnown}ms vs ${tUnknown}ms)`);
 // brute force: 5 fails then locked even with the right password
 for(let i=0;i<3;i++) await call('/api/auth/login',{m:'POST',b:{identifier:'ann@example.com',password:'wrong password '+i}});
 r=await call('/api/auth/login',{m:'POST',b:{identifier:'ann@example.com',password:'wrong again'}}); // 5th fail
 r=await call('/api/auth/login',{m:'POST',b:{identifier:'ann@example.com',password:'correct horse battery'}}); ok(r.s===429&&r.h.get('retry-after'),'account throttled after 5 failures (429 + Retry-After), even with right password');
 r=await call('/api/auth/login',{m:'POST',b:{identifier:'0772123456',dial:'256',password:'correct horse battery'}}); ok(r.s===200&&r.d.access,'other accounts unaffected');
 // refresh rotation
 const R=jar(); r=await call('/api/auth/signup',{m:'POST',j:R,b:{name:'Bob',identifier:'bob@example.com',password:'another long passphrase'}}); const bobAccess=r.d.access; const c0=R.c;
 r=await call('/api/auth/refresh',{m:'POST',j:R}); ok(r.s===200&&r.d.access&&R.c!==c0,'refresh rotates the cookie');
 const c1=R.c; const stale=jar(); stale.c=c0;
 r=await call('/api/auth/refresh',{m:'POST',j:stale}); ok(r.s===401,'OLD refresh token rejected (reuse detected)');
 const cur=jar(); cur.c=c1; r=await call('/api/auth/refresh',{m:'POST',j:cur}); ok(r.s===401,'reuse revoked the whole login (new token dead too)');
 r=await call('/api/auth/refresh',{m:'POST',j:R,h:{'x-requested-with':''}}); ok(r.s===400,'refresh without CSRF header refused');
 // MFA
 const M=jar(); r=await call('/api/auth/signup',{m:'POST',j:M,b:{name:'Cy',identifier:'cy@example.com',password:'mfa test passphrase'}}); const cyAccess=r.d.access;
 r=await call('/api/auth/mfa/setup',{m:'POST',tok:cyAccess}); ok(r.s===200&&/^[A-Z2-7]{32}$/.test(r.d.secret),'mfa setup returns secret',JSON.stringify(r.d)); const sec=r.d.secret;
 r=await call('/api/auth/mfa/enable',{m:'POST',tok:cyAccess,b:{code:'000000'}}); ok(r.s===400,'wrong TOTP rejected at enable');
 const code=totp(sec); r=await call('/api/auth/mfa/enable',{m:'POST',tok:cyAccess,b:{code}}); ok(r.s===200&&r.d.recovery.length===8,'mfa enabled with an independent TOTP implementation, 8 recovery codes'); const rec=r.d.recovery;
 r=await call('/api/auth/login',{m:'POST',b:{identifier:'cy@example.com',password:'mfa test passphrase'}}); ok(r.s===200&&r.d.mfa&&!r.d.access,'login now asks for the second step (no access token yet)'); const mt=r.d.mfaToken;
 r=await call('/api/auth/me',{tok:mt}); ok(r.s===401,'MFA step token cannot be used as an access token');
 r=await call('/api/auth/mfa/verify',{m:'POST',b:{mfaToken:mt,code:'123456'}}); ok(r.s===401,'wrong MFA code rejected');
 r=await call('/api/auth/mfa/verify',{m:'POST',b:{mfaToken:mt,code:totp(sec,1)}}); ok(r.s===200&&r.d.access,'right MFA code -> signed in');
 r=await call('/api/auth/mfa/verify',{m:'POST',b:{mfaToken:mt,code:totp(sec,1)}}); ok(r.s===401,'same TOTP code cannot be replayed');
 r=await call('/api/auth/mfa/verify',{m:'POST',b:{mfaToken:mt,code:rec[0]}}); ok(r.s===200,'recovery code works');
 r=await call('/api/auth/mfa/verify',{m:'POST',b:{mfaToken:mt,code:rec[0]}}); ok(r.s===401,'recovery code works only once');
 // sessions + password change
 const D1=jar(),D2=jar(); let a=await call('/api/auth/signup',{m:'POST',j:D1,b:{name:'Di',identifier:'di@example.com',password:'first strong passphrase'}}); await call('/api/auth/login',{m:'POST',j:D2,b:{identifier:'di@example.com',password:'first strong passphrase'}});
 r=await call('/api/auth/sessions',{tok:a.d.access}); ok(r.d.sessions.length===2&&r.d.sessions.filter(x=>x.current).length===1,'lists 2 devices, marks current');
 r=await call('/api/auth/password',{m:'POST',tok:a.d.access,b:{password:'first strong passphrase',newPassword:'second strong passphrase'}}); ok(r.s===200,'password change');
 r=await call('/api/auth/refresh',{m:'POST',j:D2}); ok(r.s===401,'other device signed out after password change');
 r=await call('/api/auth/login',{m:'POST',b:{identifier:'di@example.com',password:'first strong passphrase'}}); ok(r.s===401,'old password no longer works');
 // reset
 r=await call('/api/auth/forgot',{m:'POST',b:{identifier:'nobody-here@example.com'}}); const rNo=JSON.stringify(r.d); r=await call('/api/auth/forgot',{m:'POST',b:{identifier:'di@example.com'}}); ok(r.s===200&&JSON.stringify(r.d)===rNo,'forgot gives identical answer for real and unknown accounts');
 // orders ownership
 const vs=await (await fetch(BASE+'/api/vendors?cc=UG&region=UG-C')).json(); const v=vs.find(x=>x.id==='mama'); const full=await (await fetch(BASE+'/api/vendors/mama')).json();
 const order={vendorId:'mama',items:[{id:full.items[0].id,q:1}],name:'Ann',phone:'+256772000111',address:'Kampala',pay:'Cash',mode:'delivery'};
 r=await call('/api/orders',{m:'POST',tok:access1,b:order}); ok(r.s===201&&r.d.ctoken&&/^ID-[A-Z2-9]{8}$/.test(r.d.id),'order created, long random id + private token',r.d.error); const oid=r.d.id,ct=r.d.ctoken;
 r=await call('/api/orders/'+oid); ok(r.s===404,'stranger cannot read the order');
 r=await call('/api/orders/'+oid,{h:{'x-token':ct}}); ok(r.s===200&&!r.d.ctoken,'device token can read it (token not echoed back)');
 r=await call('/api/orders/'+oid,{tok:access1}); ok(r.s===200,'owner account can read it on another device');
 r=await call('/api/orders/'+oid,{tok:bobAccess}); ok(r.s===404,'a different signed-in user cannot');
 r=await call('/api/me/orders',{tok:access1}); ok(r.s===200&&r.d.length===1&&r.d[0].ctoken===ct,'/me/orders lists my orders (with token for tracking)');
 r=await fetch(BASE+'/api/stream/order/'+oid); ok(r.status===404,'order stream refuses strangers'); 
 // throughput
 const N=24; const t2=Date.now(); const rs=await Promise.all(Array.from({length:N},()=>call('/api/auth/login',{m:'POST',b:{identifier:'0772 123 456',dial:'256',password:'correct horse battery'}}))); const dt=Date.now()-t2;
 ok(rs.every(x=>x.s===200),`${N} concurrent logins all succeed`,rs.map(x=>x.s).join()); console.log(`INFO  ${N} concurrent logins in ${dt}ms => ${(N/(dt/1000)).toFixed(1)} logins/s on this machine (scrypt 64MiB, ${require('os').cpus().length} cpu)`);
 // signup flood
 let last; for(let i=0;i<12;i++){ last=await call('/api/auth/signup',{m:'POST',b:{name:'F'+i,identifier:'flood'+i+'@example.com',password:'flood passphrase '+i}}) } ok(last.s===429,'signup flood from one IP -> 429');
 console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
