import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle,RESOURCE} from './server.mjs';
async function rpc(method,params={}){
 params={...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'atlas-test',version:'1.0.0'},'io.modelcontextprotocol/clientCapabilities':{}}};
 const response=await handle(new Request('http://localhost/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'spoofed-test-owner','Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,...(params.name||params.uri?{'Mcp-Name':params.name||params.uri}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
}
test('anonymous discovery exposes only a static noauth probe',async()=>{
 const r=await rpc('tools/list');assert.equal(r.result.tools.length,1);
 const tool=r.result.tools[0];assert.equal(tool.name,'render_atlas_spec_probe');assert.deepEqual(tool._meta.securitySchemes,[{type:'noauth'}]);assert.equal(tool._meta.ui.resourceUri,RESOURCE);
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
