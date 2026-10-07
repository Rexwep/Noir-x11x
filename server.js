'use strict';
// NOIR X11 server — zero dependencies, Node 18+. Render-ready.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const PORT=+process.env.PORT||3000, PASS=process.env.ADMIN_PASSWORD||'';
const ROOT=__dirname,PUB=path.join(ROOT,'public');
const DATA=path.resolve(process.env.DATA_DIR||path.join(ROOT,'data')),DB=path.join(DATA,'projects.json'),UP=path.join(DATA,'uploads');
if(PASS.length<8){console.error('\n  Set ADMIN_PASSWORD (min 8 chars) first.\n  Example: ADMIN_PASSWORD="my-strong-pass" node server.js\n');process.exit(1)}
fs.mkdirSync(UP,{recursive:true});
const SEED=path.join(ROOT,'data','projects.json');
if(!fs.existsSync(DB)&&fs.existsSync(SEED))fs.copyFileSync(SEED,DB); // first boot on a fresh disk
process.on('uncaughtException',e=>console.error('uncaught',e));process.on('unhandledRejection',e=>console.error('unhandled',e));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
// Stateless signed tokens: survive restarts/redeploys, no server memory needed
const KEY=crypto.createHmac('sha256','noir-x11-v2').update(PASS).digest();
const sig=p=>crypto.createHmac('sha256',KEY).update(p).digest('hex');
const mint=()=>{const p=String(Date.now()+12*36e5);return p+'.'+sig(p)};
const eq=(a,b)=>{const x=crypto.createHash('sha256').update(a).digest(),y=crypto.createHash('sha256').update(b).digest();return crypto.timingSafeEqual(x,y)};
const authed=req=>{const t=(req.headers.authorization||'').replace(/^Bearer /,''),i=t.indexOf('.');if(i<1)return false;const p=t.slice(0,i);return eq(t.slice(i+1),sig(p))&&+p>Date.now()};
const ipOf=req=>((req.headers['x-forwarded-for']||'').split(',')[0]||req.socket.remoteAddress||'').trim();
const tries=new Map();let gN=0,gR=0;
const load=()=>{try{return JSON.parse(fs.readFileSync(DB,'utf8'))}catch{return[]}};
const save=a=>{if(fs.existsSync(DB))fs.copyFileSync(DB,DB+'.bak');fs.writeFileSync(DB+'.tmp',JSON.stringify(a,null,1));fs.renameSync(DB+'.tmp',DB)};
const str=(v,n)=>String(v==null?'':v).slice(0,n).trim();
const color=v=>/^#[0-9a-f]{6}$/i.test(v)?v:'#111111';
const safeUrl=v=>{v=str(v,500);if(!v)return'';try{const u=new URL(/^https?:\/\//i.test(v)?v:'https://'+v);return/^https?:$/.test(u.protocol)?u.href:''}catch{return''}};
const clean=(p,i)=>({id:typeof p.id==='string'&&/^[\w-]{3,40}$/.test(p.id)?p.id:'p_'+crypto.randomBytes(5).toString('hex'),name:str(p.name,80)||'Untitled',category:str(p.category,80),description:str(p.description,300),url:safeUrl(p.url),thumb:/^\/uploads\/[\w-]+\.(webp|jpg|png)$/.test(p.thumb||'')?p.thumb:'',c1:color(p.c1),c2:color(p.c2),published:p.published!==false,order:Number.isFinite(+p.order)?+p.order:i+1});
const send=(res,code,body,type='application/json',extra={})=>{
  const buf=Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body)),rq=res.req||{headers:{}};
  const h={'Content-Type':type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',...extra};
  if(rq.headers['x-forwarded-proto']==='https')h['Strict-Transport-Security']='max-age=31536000';
  h['Content-Length']=buf.length;res.writeHead(code,h);res.end(rq.method==='HEAD'?undefined:buf)};
const body=(req,max=3e6)=>new Promise((ok,no)=>{let n=0,c=[];req.on('data',d=>{n+=d.length;if(n>max){no(new Error('big'));req.destroy()}else c.push(d)});req.on('end',()=>ok(Buffer.concat(c).toString()));req.on('error',no)});
async function api(req,res,url){
  if(url.pathname==='/api/projects'&&req.method==='GET')return send(res,200,load().filter(p=>p.published!==false).sort((a,b)=>a.order-b.order),'application/json',{'Cache-Control':'no-cache'});
  if(url.pathname==='/api/login'&&req.method==='POST'){
    const ip=ipOf(req),now=Date.now(),t=tries.get(ip)||{n:0,r:0};
    if(now>t.r){t.n=0;t.r=now+6e4}if(now>gR){gN=0;gR=now+6e4}
    if(++t.n>5||++gN>40){tries.set(ip,t);return send(res,429,{error:'Too many attempts. Wait a minute.'})}tries.set(ip,t);
    let j={};try{j=JSON.parse(await body(req,2e3))}catch{}
    if(!eq(String(j.password||''),PASS))return send(res,401,{error:'Wrong password'});
    return send(res,200,{token:mint()});
  }
  if(!authed(req))return send(res,401,{error:'Login required'});
  if(url.pathname==='/api/admin/projects'&&req.method==='GET')return send(res,200,load().sort((a,b)=>a.order-b.order),'application/json',{'Cache-Control':'no-store'});
  if(url.pathname==='/api/admin/projects'&&req.method==='PUT'){
    let a;try{a=JSON.parse(await body(req,1e6))}catch{return send(res,400,{error:'Bad JSON'})}
    if(!Array.isArray(a)||a.length>200)return send(res,400,{error:'Invalid list'});
    const out=a.map(clean);save(out);return send(res,200,out);
  }
  if(url.pathname==='/api/admin/upload'&&req.method==='POST'){
    let j;try{j=JSON.parse(await body(req,4e6))}catch{return send(res,400,{error:'Bad upload'})}
    const m=/^data:image\/(webp|jpeg|png);base64,([\w+/=]+)$/.exec(j.data||'');if(!m)return send(res,400,{error:'Image only'});
    const buf=Buffer.from(m[2],'base64');if(buf.length>2.5e6)return send(res,413,{error:'Max 2.5 MB'});
    const ext=m[1]==='jpeg'?'jpg':m[1],name=crypto.randomBytes(8).toString('hex')+'.'+ext;fs.writeFileSync(path.join(UP,name),buf);return send(res,200,{thumb:'/uploads/'+name});
  }
  if(url.pathname==='/api/admin/logout')return send(res,200,{ok:true});
  send(res,404,{error:'Not found'});
}
const cache=new Map();
function serve(req,res,url){
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,'Method not allowed','text/plain');
  let p;try{p=decodeURIComponent(url.pathname)}catch{return send(res,400,'Bad request','text/plain')}
  if(p==='/')p='/index.html';if(p==='/admin'||p==='/admin/')p='/admin.html';
  const up=p.startsWith('/uploads/'),base=up?UP:PUB,f=path.normalize(path.join(base,up?p.slice(9):p));
  let st;try{st=fs.statSync(f)}catch{return send(res,404,'Not found','text/plain')}
  if(!f.startsWith(base+path.sep)||!st.isFile())return send(res,404,'Not found','text/plain');
  const ext=path.extname(f).toLowerCase(),type=MIME[ext]||'application/octet-stream',etag='"'+st.size+'-'+st.mtimeMs.toString(36)+'"';
  const h={ETag:etag,'Cache-Control':ext==='.html'?'no-cache':'public, max-age=604800'};
  if(p==='/admin.html'){h['X-Robots-Tag']='noindex, nofollow';h['X-Frame-Options']='DENY';h['Cache-Control']='no-store'}
  if(req.headers['if-none-match']===etag){res.writeHead(304,h);return res.end()}
  let c=cache.get(f);if(!c||c.etag!==etag){const raw=fs.readFileSync(f);c={etag,raw,gz:/\.(html|js|css|json|svg|txt)$/.test(ext)?zlib.gzipSync(raw,{level:6}):null};if(raw.length<3e6)cache.set(f,c)}
  if(c.gz&&/gzip/.test(req.headers['accept-encoding']||'')){h['Content-Encoding']='gzip';h.Vary='Accept-Encoding';return send(res,200,c.gz,type,h)}
  send(res,200,c.raw,type,h);
}
const srv=http.createServer((req,res)=>{
  try{
    const url=new URL(req.url,'http://x');
    if(url.pathname==='/healthz')return send(res,200,'ok','text/plain');
    if(url.pathname.startsWith('/api/'))return api(req,res,url).catch(e=>{console.error(e);if(!res.headersSent)send(res,500,{error:'Server error'})});
    serve(req,res,url);
  }catch(e){console.error(e);if(!res.headersSent)send(res,400,'Bad request','text/plain')}
});
srv.keepAliveTimeout=65e3;srv.headersTimeout=66e3;srv.requestTimeout=30e3;
srv.listen(PORT,'0.0.0.0',()=>console.log(`NOIR X11 running on port ${PORT} · data: ${DATA}`));
setInterval(()=>{const n=Date.now();tries.forEach((v,k)=>v.r<n&&tries.delete(k))},36e5).unref();
const stop=()=>srv.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
