import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle,RESOURCE} from './server.mjs';
async function rpc(method,params={},expectedStatus=200){
 params={...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'atlas-test',version:'1.0.0'},'io.modelcontextprotocol/clientCapabilities':{}}};
 const response=await handle(new Request('http://localhost/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'spoofed-test-owner','Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,...(params.name||params.uri?{'Mcp-Name':params.name||params.uri}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
const body=await response.json();assert.equal(response.status,expectedStatus,JSON.stringify(body));return body;
} 
test('anonymous discovery exposes only a static noauth probe',async()=>{
 const r=await rpc('tools/list');assert.equal(r.result.tools.length,8);
 const tool=r.result.tools.find(x=>x.name==='render_atlas_spec_probe');assert.equal(tool.name,'render_atlas_spec_probe');assert.deepEqual(tool._meta.securitySchemes,[{type:'noauth'}]);assert.equal(tool._meta.ui.resourceUri,RESOURCE);
});
test('identity status tool is OAuth-protected and read-only',async()=>{const list=await rpc('tools/list');const t=list.result.tools.find(x=>x.name==='get_identity_context');assert.deepEqual(t.securitySchemes,[{type:'oauth2',scopes:['atlas:read']}]);assert.equal(t.annotations.readOnlyHint,true);const r=await rpc('tools/call',{name:'get_identity_context',arguments:{session_id:'test',target_identity:'atlas'}});assert.equal(r.result.isError,true);assert.match(r.result._meta['mcp/www_authenticate'][0],/oauth-protected-resource/)});
test('session ownership is an authenticated, idempotent, app-only operation',async()=>{const list=await rpc('tools/list');const t=list.result.tools.find(x=>x.name==='create_session_ownership');assert.deepEqual(t.securitySchemes,[{type:'oauth2',scopes:['atlas:read']}]);assert.equal(t.annotations.readOnlyHint,false);assert.equal(t.annotations.idempotentHint,true);assert.deepEqual(t._meta.ui.visibility,['app']);const r=await rpc('tools/call',{name:'create_session_ownership',arguments:{session_id:'12345678-1234-4234-8234-123456789abc'}});assert.equal(r.result.isError,true);assert.match(r.result._meta['mcp/www_authenticate'][0],/oauth-protected-resource/)});
test('conversation reader is OAuth-protected and requires a session',async()=>{const list=await rpc('tools/list');const t=list.result.tools.find(x=>x.name==='get_recent_messages');assert.deepEqual(t.securitySchemes,[{type:'oauth2',scopes:['atlas:read']}]);assert.equal(t.annotations.readOnlyHint,true);assert.deepEqual(t.inputSchema.required,['session_id']);const r=await rpc('tools/call',{name:'get_recent_messages',arguments:{session_id:'test'}});assert.equal(r.result.isError,true);assert.match(r.result._meta['mcp/www_authenticate'][0],/oauth-protected-resource/);});
test('static resource and tool result preserve the probe contract',async()=>{
 const r=await rpc('resources/read',{uri:RESOURCE});const c=r.result.contents[0];
 assert.equal(c.mimeType,'text/html;profile=mcp-app');assert.match(c.text,/Atlas MCP Apps Spec Probe/);assert.match(c.text,/ui\/initialize/);assert.deepEqual(c._meta.ui.csp,{connectDomains:[],resourceDomains:[]});
 const call=await rpc('tools/call',{name:'render_atlas_spec_probe',arguments:{}});assert.ok(!call.error);assert.ok(!call.result.isError);assert.equal(call.result.content[0].text,'Atlas MCP Apps spec probe ready.');
});
test('private operations cannot be called, including with spoofed identity',async()=>{
 for(const name of ['get_recent_messages','append_user_message','record_atlas_reply','get_identity_package']){
  const result=await rpc('tools/call',{name,arguments:{}});assert.ok(result.error||result.result?.isError);
 }
});

test('anonymous Room resource exposes only static assets and retains bridge code',async()=>{
 const listed=await rpc('tools/list');const tool=listed.result.tools.find(x=>x.name==='render_atlas_room');assert.deepEqual(tool._meta.securitySchemes,[{type:'noauth'}]);
 const r=await rpc('resources/read',{uri:tool._meta.ui.resourceUri});const html=r.result.contents[0].text;
 assert.match(html,/append_user_message/);assert.match(html,/sendFollowUpMessage/);assert.match(html,/ui\/initialize/);assert.doesNotMatch(html,/data:image\/jpeg;base64,/);
 const urls=[...new Set(html.match(/https:\/\/atlas-direct-mcp\.onrender\.com\/assets\/[0-9a-f]{64}\.jpg/g)||[])];assert.equal(urls.length,12);
 for(const url of urls){const response=await handle(new Request(url));assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');}
 const bad=await handle(new Request('https://atlas-direct-mcp.onrender.com/assets/unknown.jpg'));assert.equal(bad.status,404);
});


test('protected diagnostic challenges an anonymous request without exposing Atlas data',async()=>{
 const list=await rpc('tools/list');const tool=list.result.tools.find(t=>t.name==='get_atlas_auth_status');assert.deepEqual(tool.securitySchemes,[{type:'oauth2',scopes:['atlas:read']}]);const r=await rpc('tools/call',{name:'get_atlas_auth_status',arguments:{}});assert.equal(r.result.resultType,'complete');assert.equal(r.result.isError,true);assert.match(r.result._meta['mcp/www_authenticate'][0],/oauth-protected-resource/);assert.deepEqual(r.result.content,[{type:'text',text:'Authentication required.'}]);
 const meta=await handle(new Request('https://atlas-direct-mcp.onrender.com/.well-known/oauth-protected-resource'));assert.equal(meta.status,200);const b=await meta.json();assert.equal(b.resource,'https://atlas-direct-mcp.onrender.com');assert.deepEqual(b.scopes_supported,['atlas:read','atlas:write']);
});

test('token verification enforces signature, issuer, audience, expiry and read scope',async()=>{
 const {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT}=await import('jose');const {verifyDiagnosticToken,ISSUER,RESOURCE}=await import('./auth.mjs');
 const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';const keys=createLocalJWKSet({keys:[jwk]});
 async function sign(overrides={}){let c={iss:ISSUER,aud:RESOURCE,sub:'test-subject',scope:'atlas:read',exp:Math.floor(Date.now()/1000)+300,...overrides};return new SignJWT(c).setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(privateKey)}
 assert.deepEqual(await verifyDiagnosticToken(await sign(),keys),{authenticated:true});
 for(const bad of [{iss:'https://wrong.example/'},{aud:'https://wrong.example'},{exp:1},{scope:'other'}])await assert.rejects(verifyDiagnosticToken(await sign(bad),keys));
 const pair=await generateKeyPair('RS256');const forged=await new SignJWT({iss:ISSUER,aud:RESOURCE,sub:'test-subject',scope:'atlas:read',exp:Math.floor(Date.now()/1000)+300}).setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(pair.privateKey);await assert.rejects(verifyDiagnosticToken(forged,keys));
});

test('append requires separate write scope and designated client',async()=>{
 const list=await rpc('tools/list');const t=list.result.tools.find(x=>x.name==='append_user_message');assert.deepEqual(t.securitySchemes,[{type:'oauth2',scopes:['atlas:write']}]);assert.equal(t.annotations.idempotentHint,true);
 const {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT}=await import('jose');const {verifyAppendToken,ISSUER,RESOURCE}=await import('./auth.mjs');const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='key';const keys=createLocalJWKSet({keys:[jwk]});
 async function sign(scope,azp){return new SignJWT({iss:ISSUER,aud:RESOURCE,sub:'user',scope,azp,exp:Math.floor(Date.now()/1000)+300}).setProtectedHeader({alg:'RS256',kid:'key'}).sign(privateKey)}
 await verifyAppendToken(await sign('atlas:read atlas:write','UgCVpv7vqNdxej2v3d5xGdnihjrTnNSV'),keys);await assert.rejects(verifyAppendToken(await sign('atlas:read','UgCVpv7vqNdxej2v3d5xGdnihjrTnNSV'),keys));await assert.rejects(verifyAppendToken(await sign('atlas:write','other'),keys));
});

test('one-request test tool requires write authorization and has no handoff path',async()=>{
 const list=await rpc('tools/list');const t=list.result.tools.find(x=>x.name==='append_atlas_test_message_once');assert.deepEqual(t.securitySchemes,[{type:'oauth2',scopes:['atlas:write']}]);assert.equal(t.annotations.idempotentHint,true);assert.deepEqual(t.inputSchema.properties,{});
 const r=await rpc('tools/call',{name:'append_atlas_test_message_once',arguments:{}},401);assert.equal(r.result.isError,true);assert.match(r.result._meta['mcp/www_authenticate'][0],/oauth-protected-resource/);
 const source=await (await import('node:fs/promises')).readFile(new URL('./server.mjs',import.meta.url),'utf8');const part=source.split("server.registerTool('append_atlas_test_message_once'")[1].split(' return server;')[0];
 for(const forbidden of ['sendFollowUpMessage','claim_handoff','record_atlas_reply','ui/message','identity-package'])assert.doesNotMatch(part,new RegExp(forbidden));
 assert.match(part,/api\/direct-mcp\/append-user-message/);assert.match(part,/fae3689a-c557-4cdc-b319-7ba2afcf8bd4/);
});

test('isolated test challenges a valid read-only or missing token with atlas:write without an append',async()=>{
 const {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT}=await import('jose');const {ISSUER,RESOURCE}=await import('./auth.mjs');
 const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='scope-test';const keys=createLocalJWKSet({keys:[jwk]});
 const token=await new SignJWT({iss:ISSUER,aud:RESOURCE,sub:'subject',azp:'UgCVpv7vqNdxej2v3d5xGdnihjrTnNSV',scope:'atlas:read',exp:Math.floor(Date.now()/1000)+300}).setProtectedHeader({alg:'RS256',kid:'scope-test'}).sign(privateKey);
 function request(token){return new Request('http://localhost/mcp',{method:'POST',headers:{'content-type':'application/json','MCP-Protocol-Version':'2026-07-28',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({jsonrpc:'2.0',id:42,method:'tools/call',params:{name:'append_atlas_test_message_once',arguments:{}}})})}
 const originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected network access')};
 try{
  const r=await handle(request(token),{appendTestKeys:keys});const body=await r.json();const challenge=body.result._meta['mcp/www_authenticate'][0];assert.equal(body.result.isError,true);assert.match(challenge,/error="insufficient_scope"/);assert.match(challenge,/scope="atlas:write"/);assert.match(challenge,/resource_metadata="https:\/\/atlas-direct-mcp\.onrender\.com\/\.well-known\/oauth-protected-resource"/);assert.match(challenge,/error_description=/);assert.equal(r.headers.get('WWW-Authenticate'),challenge);assert.equal(calls,0);
  const missing=await handle(request(null),{appendTestKeys:keys});const m=await missing.json();const missingChallenge=m.result._meta['mcp/www_authenticate'][0];assert.equal(m.result.isError,true);assert.match(missingChallenge,/error="invalid_token"/);assert.match(missingChallenge,/scope="atlas:write"/);assert.match(missingChallenge,/resource_metadata="https:\/\/atlas-direct-mcp\.onrender\.com\/\.well-known\/oauth-protected-resource"/);assert.match(missingChallenge,/error_description=/);assert.equal(missing.headers.get('WWW-Authenticate'),missingChallenge);assert.equal(calls,0);
 }finally{globalThis.fetch=originalFetch}
});
