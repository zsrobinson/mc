import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';

test('Access signatures, audience, expiry, Origin and Unix helper boundary',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mc-test-'));
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256'};
 const certs=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[jwk]}))});
 await new Promise<void>(r=>certs.listen(0,'127.0.0.1',r));
 const issuer='http://127.0.0.1:'+(certs.address() as {port:number}).port;
 const secret='test-only-helper-secret';
 const helper=createServer((req,res)=>{assert.equal(req.headers.authorization,'Bearer '+secret);res.setHeader('Content-Type','application/json');res.end('[]')});
 const socket=join(dir,'helper.sock');await new Promise<void>(r=>helper.listen(socket,r));
 await writeFile(join(dir,'secret'),secret);await writeFile(join(dir,'services.json'),'[]');
 const allocator=createServer();await new Promise<void>(r=>allocator.listen(0,'127.0.0.1',r));
 const port=(allocator.address() as {port:number}).port;await new Promise<void>(r=>allocator.close(()=>r()));
 const origin='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,ACCESS_ISSUER:issuer,ACCESS_AUD:'test-audience',PUBLIC_ORIGIN:origin,PORT:String(port),HELPER_SOCKET:socket,HELPER_SECRET_FILE:join(dir,'secret'),SERVICE_MANIFEST:join(dir,'services.json')},stdio:'ignore'});
 try{
  let ready=false;
  for(let i=0;i<50;i++){try{await fetch(origin);ready=true;break}catch{await new Promise(r=>setTimeout(r,100))}}
  assert.ok(ready,'server starts');
  const token=await new SignJWT({email:'operator@example.test'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer).setAudience('test-audience').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const headers={'Cf-Access-Jwt-Assertion':token};
  assert.equal((await fetch(origin+'/api/session')).status,401);
  const session=await fetch(origin+'/api/session',{headers});assert.equal(session.status,200);assert.equal((await session.json()).email,'operator@example.test');
  const wrong=await new SignJWT({email:'operator@example.test'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer).setAudience('different').setExpirationTime('5m').sign(privateKey);
  assert.equal((await fetch(origin+'/api/session',{headers:{'Cf-Access-Jwt-Assertion':wrong}})).status,401);
  const expired=await new SignJWT({email:'operator@example.test'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer).setAudience('test-audience').setExpirationTime(1).sign(privateKey);
  assert.equal((await fetch(origin+'/api/session',{headers:{'Cf-Access-Jwt-Assertion':expired}})).status,401);
  assert.equal((await fetch(origin+'/api/control',{method:'POST',headers:{...headers,Origin:'https://wrong.example.test'},body:'{"verb":"list"}'})).status,403);
  const forwarded=await fetch(origin+'/api/control',{method:'POST',headers:{...headers,Origin:origin},body:'{"verb":"list"}'});assert.equal(forwarded.status,200);assert.deepEqual(await forwarded.json(),[]);
 }finally{child.kill();await new Promise<void>(r=>child.once('exit',()=>r()));certs.close();helper.close();await rm(dir,{recursive:true,force:true})}
});
