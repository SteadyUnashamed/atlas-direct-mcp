import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle,RESOURCE} from './server.mjs';
async function rpc(method,params={}){
 params={...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'atlas-test',version:'1.0.0'},'io.modelcontextprotocol/clientCapabilities':{}}};
 const response=await handle(new Request('http://localhost/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'spoofed-test-owner','Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,...(params.name||params.uri?{'Mcp-Name':params.name||params.uri}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
}
test('anonymous discovery exposes only a static noauth probe',async()=>{
 const r=await rpc('tools/list');assert.equal(r.result.tools.length,2);
 const tool=r.result.tools.find(x=>x.name==='render_atlas_spec_probe');assert.equal(tool.name,'render_atlas_spec_probe');assert.deepEqual(tool._meta.securitySchemes,[{type:'noauth'}]);assert.equal(tool._meta.ui.resourceUri,RESOURCE);
});
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
