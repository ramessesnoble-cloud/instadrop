// Two servers, one database. Start: PORT=3112 DATABASE_URL=... node server.js  and  PORT=3113 DATABASE_URL=... node server.js (same DATA_DIR/JWT_SECRET, log server A to srv.log in the folder you pass). Then: node test/multi-server.test.js <folder-with-srv.log>
const A='http://localhost:3112',B='http://localhost:3113',fs=require('fs');
let pass=0,fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);c?pass++:fail++};
const call=async(base,p,{b,cookie}={})=>{const r=await fetch(base+p,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'instadrop',...(cookie?{cookie}:{})},body:JSON.stringify(b||{})});let d={};try{d=await r.json()}catch{};const sc=(r.headers.get('set-cookie')||'').split(';')[0];return{s:r.status,d,c:sc}};
(async()=>{
 const em='multi'+Date.now()+'@example.com';
 let r=await call(A,'/api/auth/signup',{b:{name:'Multi',identifier:em,password:'long enough passphrase'}}); ok(r.s===201,'signup on server A'); let ck=r.c;
 r=await call(B,'/api/auth/login',{b:{identifier:em,password:'long enough passphrase'}}); ok(r.s===200&&r.d.access,'same account logs in on server B'); 
 const accA=r.d.access; r=await fetch(A+'/api/auth/me',{headers:{authorization:'Bearer '+accA}}); ok(r.status===200,'token issued by B verified by A (stateless)');
 r=await call(B,'/api/auth/refresh',{cookie:ck}); ok(r.s===200,'session made on A refreshes on B'); const ck2=r.c;
 r=await call(A,'/api/auth/refresh',{cookie:ck2}); ok(r.s===200,'rotated cookie then refreshes on A'); const ck3=r.c;
 // race: same cookie to both servers at once
 const [x,y]=await Promise.all([call(A,'/api/auth/refresh',{cookie:ck3}),call(B,'/api/auth/refresh',{cookie:ck3})]); ok([x.s,y.s].filter(s=>s===200).length===1,'simultaneous refresh with one token on two servers: exactly one wins ('+x.s+','+y.s+')');
 // duplicate signup race
 const em2='race'+Date.now()+'@example.com'; const [p,q]=await Promise.all([call(A,'/api/auth/signup',{b:{name:'R',identifier:em2,password:'long enough passphrase'}}),call(B,'/api/auth/signup',{b:{name:'R',identifier:em2,password:'long enough passphrase'}})]); ok([p.s,q.s].sort().join()==='201,409','duplicate signup race: one 201, one 409 ('+p.s+','+q.s+')');
 // reset token single use across servers
 await call(A,'/api/auth/forgot',{b:{identifier:em}}); await new Promise(r=>setTimeout(r,300));
 const log=fs.readFileSync(process.argv[2]+'/srv.log','utf8'); const tok=[...log.matchAll(/to=([^ ]+) .*reset=([\w-]+)/g)].filter(m=>m[1]===em).pop()[2];
 const [s1,s2]=await Promise.all([call(B,'/api/auth/reset',{b:{token:tok,password:'brand new passphrase'}}),call(A,'/api/auth/reset',{b:{token:tok,password:'another new passphrase'}})]); ok([s1.s,s2.s].sort().join()==='200,400','reset link works once across servers ('+s1.s+','+s2.s+')');
 console.log(pass+' passed, '+fail+' failed');
})();
