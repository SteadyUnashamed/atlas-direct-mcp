import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {McpServer,createMcpHandler} from '@modelcontextprotocol/server';
import {registerAppTool,registerAppResource,RESOURCE_MIME_TYPE} from '@modelcontextprotocol/ext-apps/server';
import {z} from 'zod';
import {ISSUER,RESOURCE as AUTH_RESOURCE,SCOPE,WRITE_SCOPE,verifyDiagnosticToken,verifyAppendToken,challenge} from './auth.mjs';
import {PAGE} from './ui/room-page.js';

export const RESOURCE='ui://atlas-bridge/proof-001/spec-probe-v2.html';
const HTML=await readFile(new URL('./probe.html',import.meta.url),'utf8');
const ROOM_URI='ui://atlas-bridge/proof-001/atlas-room-tool-render-v8';
const ASSET_ORIGIN='https://atlas-direct-mcp.onrender.com';
const handler=createMcpHandler((ctx)=>{
 const server=new McpServer({name:'atlas-direct-mcp',version:'0.1.0'});
 registerAppTool(server,'render_atlas_spec_probe',{
  title:'Atlas MCP Apps Spec Probe',
  description:'Render the anonymous static Atlas MCP Apps spec probe inline. Only visible UI and completed initialization establish rendering success. No private Atlas information or operations are exposed.',
  inputSchema:z.object({}).strict(),
  annotations:{readOnlyHint:true,idempotentHint:true,destructiveHint:false,openWorldHint:false},
  _meta:{securitySchemes:[{type:'noauth'}],ui:{resourceUri:RESOURCE,visibility:['model']}}
 },async()=>({content:[{type:'text',text:'Atlas MCP Apps spec probe ready.'}]}));
 registerAppResource(server,'Atlas MCP Apps Spec Probe',RESOURCE,{},async()=>({contents:[{
  uri:RESOURCE,mimeType:RESOURCE_MIME_TYPE,text:HTML,
  _meta:{ui:{domain:'https://atlas-bridge-proof-001.palewasp2048.chatgpt.site',prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}},'openai/ui':{availableDisplayModes:['inline']}}
 }]}));
 registerAppTool(server,'render_atlas_room',{title:'Atlas Room',description:'Render the Atlas Room interface; this tool contains no private messages or protected identity state.',inputSchema:z.object({}).strict(),annotations:{readOnlyHint:true,idempotentHint:true,destructiveHint:false,openWorldHint:false},_meta:{securitySchemes:[{type:'noauth'}],ui:{resourceUri:ROOM_URI,visibility:['model']},'openai/outputTemplate':ROOM_URI}},async()=>({content:[{type:'text',text:'Atlas Room is ready.'}]}));
 registerAppResource(server,'Atlas Room',ROOM_URI,{},async()=>({contents:[{uri:ROOM_URI,mimeType:RESOURCE_MIME_TYPE,text:PAGE.replace('__EMBEDDED__','true').replaceAll('/assets/',ASSET_ORIGIN+'/assets/'),_meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[ASSET_ORIGIN]}},'openai/ui':{availableDisplayModes:['inline','fullscreen'],preferredDisplayMode:'fullscreen'}}}]}));
 server.registerTool('get_atlas_auth_status',{title:'Atlas authentication check',description:'Harmless protected diagnostic. Returns no Atlas messages, identity data, or session data.',inputSchema:z.object({}).strict(),annotations:{readOnlyHint:true,idempotentHint:true,destructiveHint:false,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[SCOPE]}],_meta:{securitySchemes:[{type:'oauth2',scopes:[SCOPE]}],ui:{visibility:['model','app']}}},async()=>{const match=/^Bearer ([^\s]+)$/i.exec(ctx.requestInfo?.headers?.get('Authorization')||'');try{await verifyDiagnosticToken(match?.[1]);return {content:[{type:'text',text:'Authenticated diagnostic succeeded.'}]};}catch{return {isError:true,content:[{type:'text',text:'Authentication required.'}],_meta:{'mcp/www_authenticate':[`Bearer resource_metadata=\"https://atlas-direct-mcp.onrender.com/.well-known/oauth-protected-resource\", error=\"invalid_token\", error_description=\"Authentication required\"`]}};}});
 server.registerTool('get_recent_messages',{title:'Read Atlas conversation',description:'Read messages for one exact session belonging to the verified bound account. No identity packages or state changes.',inputSchema:z.object({session_id:z.string().trim().min(1).max(100),target_identity:z.enum(['atlas','steady','liminal','elias','gwen']).optional(),limit:z.number().int().min(1).max(100).optional()}).strict(),annotations:{readOnlyHint:true,idempotentHint:true,destructiveHint:false,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[SCOPE]}],_meta:{securitySchemes:[{type:'oauth2',scopes:[SCOPE]}],ui:{visibility:['model','app']},'openai/widgetAccessible':true}},async(args)=>{
  const match=/^Bearer ([^\s]+)$/i.exec(ctx.requestInfo?.headers?.get('Authorization')||'');
  try{
   await verifyDiagnosticToken(match?.[1]);
   if(!process.env.ATLAS_SITE_BYPASS)return {isError:true,content:[{type:'text',text:'Conversation service unavailable.'}]};
   const response=await fetch('https://atlas-bridge-proof-001.palewasp2048.chatgpt.site/api/direct-mcp/messages',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+match[1],'OAI-Sites-Authorization':'Bearer '+process.env.ATLAS_SITE_BYPASS},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)return {isError:true,content:[{type:'text',text:response.status===403?'Account is not authorized for conversation access.':'Conversation service unavailable.'}]};
   const data=await response.json();return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
  }catch{return {isError:true,content:[{type:'text',text:'Conversation service unavailable.'}]};}
 });
 server.registerTool('get_identity_context',{title:'Read Atlas identity context status',description:'Read only the selected identity context status for one owner-bound session; no identity traits or package contents.',inputSchema:z.object({session_id:z.string().trim().min(1).max(100),target_identity:z.enum(['atlas','steady','liminal','elias','gwen'])}).strict(),annotations:{readOnlyHint:true,idempotentHint:true,destructiveHint:false,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[SCOPE]}],_meta:{securitySchemes:[{type:'oauth2',scopes:[SCOPE]}],ui:{visibility:['model','app']},'openai/widgetAccessible':true}},async(args)=>{
  const match=/^Bearer ([^\s]+)$/i.exec(ctx.requestInfo?.headers?.get('Authorization')||'');
  try{
   await verifyDiagnosticToken(match?.[1]);
   if(!process.env.ATLAS_SITE_BYPASS)return {isError:true,content:[{type:'text',text:'Identity status service unavailable.'}]};
   const response=await fetch('https://atlas-bridge-proof-001.palewasp2048.chatgpt.site/api/direct-mcp/identity-status',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+match[1],'OAI-Sites-Authorization':'Bearer '+process.env.ATLAS_SITE_BYPASS},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)return {isError:true,content:[{type:'text',text:response.status===403?'Account is not authorized for identity status.':'Identity status unavailable for this session.'}]};
   const data=await response.json();return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
  }catch{return {isError:true,content:[{type:'text',text:'Identity status service unavailable.'}]};}
 });
 server.registerTool('create_session_ownership',{title:'Create Atlas session ownership',description:'Create or confirm only the ownership record for a new UUID session belonging to the verified bound account. No messages or identity state are written.',inputSchema:z.object({session_id:z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)}).strict(),annotations:{readOnlyHint:false,idempotentHint:true,destructiveHint:false,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[SCOPE]}],_meta:{securitySchemes:[{type:'oauth2',scopes:[SCOPE]}],ui:{visibility:['app']},'openai/widgetAccessible':true}},async(args)=>{
  const match=/^Bearer ([^\s]+)$/i.exec(ctx.requestInfo?.headers?.get('Authorization')||'');
  try{
   await verifyDiagnosticToken(match?.[1]);
   if(!process.env.ATLAS_SITE_BYPASS)return {isError:true,content:[{type:'text',text:'Session service unavailable.'}]};
   const response=await fetch('https://atlas-bridge-proof-001.palewasp2048.chatgpt.site/api/direct-mcp/session-ownership',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+match[1],'OAI-Sites-Authorization':'Bearer '+process.env.ATLAS_SITE_BYPASS},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)return {isError:true,content:[{type:'text',text:'Session ownership unavailable.'}]};
   const data=await response.json();return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
  }catch{return {isError:true,content:[{type:'text',text:'Session ownership unavailable.'}]};}
 });
 server.registerTool('append_user_message',{title:'Save Atlas user message',description:'Save one explicitly routed user message in an owner-bound session. Requires atlas:write. Does not perform handoff or generate a reply.',inputSchema:z.object({text:z.string().min(1).max(10000),request_id:z.uuidv4(),session_id:z.uuidv4(),source:z.literal('mcp_app'),target_identity:z.enum(['atlas','steady','liminal','elias','gwen']),speaker_identity:z.literal('user'),routing_provenance:z.literal('explicit_user_selection')}).strict(),annotations:{readOnlyHint:false,idempotentHint:true,destructiveHint:false,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[WRITE_SCOPE]}],_meta:{securitySchemes:[{type:'oauth2',scopes:[WRITE_SCOPE]}],ui:{visibility:['app']},'openai/widgetAccessible':true}},async(args)=>{
  const match=/^Bearer ([^\s]+)$/i.exec(ctx.requestInfo?.headers?.get('Authorization')||'');
  try{await verifyAppendToken(match?.[1]);if(!process.env.ATLAS_SITE_BYPASS)throw new Error('unavailable');
   const response=await fetch('https://atlas-bridge-proof-001.palewasp2048.chatgpt.site/api/direct-mcp/append-user-message',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+match[1],'OAI-Sites-Authorization':'Bearer '+process.env.ATLAS_SITE_BYPASS},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)return {isError:true,content:[{type:'text',text:response.status===409?'Message request conflicts with an existing record.':'Message append unavailable.'}]};
   const data=await response.json();return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
  }catch{return {isError:true,content:[{type:'text',text:'Message append unavailable.'}]};}
 });
 server.registerTool('append_atlas_test_message_once',{title:'Append one Atlas test message',description:'Temporary append-only validation for the single owner-authorized Atlas test request. No handoff, model call, reply, routing change, or package mutation.',inputSchema:z.object({}).strict(),annotations:{readOnlyHint:false,idempotentHint:true,destructiveHint:false,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[WRITE_SCOPE]}],_meta:{securitySchemes:[{type:'oauth2',scopes:[WRITE_SCOPE]}],ui:{visibility:['model']}}},async()=>{
  const match=/^Bearer ([^\s]+)$/i.exec(ctx.requestInfo?.headers?.get('Authorization')||'');
  try{await verifyAppendToken(match?.[1]);if(!process.env.ATLAS_SITE_BYPASS)throw new Error('unavailable');
   const args={text:'Hello, Atlas. This is a bridge test.',request_id:'fae3689a-c557-4cdc-b319-7ba2afcf8bd4',session_id:'22df27bc-2c90-4703-b326-d6bc8dc9a216',source:'mcp_app',target_identity:'atlas',speaker_identity:'user',routing_provenance:'explicit_user_selection'};
   const response=await fetch('https://atlas-bridge-proof-001.palewasp2048.chatgpt.site/api/direct-mcp/append-user-message',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+match[1],'OAI-Sites-Authorization':'Bearer '+process.env.ATLAS_SITE_BYPASS},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)return {isError:true,content:[{type:'text',text:'Test append unavailable.'}]};
   const data=await response.json();return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
  }catch{return {isError:true,content:[{type:'text',text:'Test append unavailable.'}]};}
 });
 return server;
},{responseMode:'json'});

export async function handle(request){
 const url=new URL(request.url);
 if(request.method==='GET'&&url.pathname==='/.well-known/oauth-protected-resource')return Response.json({resource:AUTH_RESOURCE,authorization_servers:[ISSUER],scopes_supported:[SCOPE,WRITE_SCOPE]},{headers:{'Cache-Control':'public, max-age=300'}});
 if(request.method==='GET'&&/^\/assets\/[0-9a-f]{64}\.jpg$/.test(url.pathname)){
  try{return new Response(await readFile(new URL('./ui'+url.pathname,import.meta.url)),{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000, immutable','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Not found',{status:404});}
 }
 if(url.pathname==='/health'&&request.method==='GET')return Response.json({status:'ok',phase:'static_probe_only'});
 if(url.pathname!=='/mcp')return new Response('Atlas direct MCP — static probe only.',{status:url.pathname==='/'?200:404});
 // No bridge/data tools exist in phase 1. Never trust incoming identity headers.
 const rpc=request.method==='POST'?await request.clone().json().catch(()=>({})):{};
 if(rpc.method==='tools/call'&&['append_user_message','append_atlas_test_message_once'].includes(rpc.params?.name)){
  const match=/^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization')||'');
  try{await verifyAppendToken(match?.[1]);}catch{return challenge(rpc.id??null,request.headers.get('MCP-Protocol-Version')==='2026-07-28');}
 }
 if(rpc.method==='tools/call'&&['get_atlas_auth_status','get_recent_messages','get_identity_context','create_session_ownership'].includes(rpc.params?.name)){
  const match=/^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization')||'');
  try{await verifyDiagnosticToken(match?.[1]);}catch{return challenge(rpc.id??null,request.headers.get('MCP-Protocol-Version')==='2026-07-28');}
 }
 let result=await handler.fetch(request);
 if(rpc.method==='tools/list'&&result.ok&&result.headers.get('content-type')?.includes('application/json')){
  const payload=await result.clone().json();
  for(const tool of payload.result?.tools||[])if(['get_atlas_auth_status','get_recent_messages','get_identity_context','create_session_ownership'].includes(tool.name))tool.securitySchemes=[{type:'oauth2',scopes:[SCOPE]}];
  for(const tool of payload.result?.tools||[])if(['append_user_message','append_atlas_test_message_once'].includes(tool.name))tool.securitySchemes=[{type:'oauth2',scopes:[WRITE_SCOPE]}];
  const headers=new Headers(result.headers);headers.delete('content-length');result=new Response(JSON.stringify(payload),{status:result.status,headers});
 }
 console.info(JSON.stringify({event:'atlas_direct_mcp',method:rpc.method??null,tool:rpc.params?.name??null,resource:rpc.params?.uri??null,http_status:result.status}));
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=http.createServer(async(req,res)=>{
  try{
   const parts=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413).end();return;}parts.push(chunk);}
   const origin=process.env.RENDER_EXTERNAL_URL||'http://localhost';
   const response=await handle(new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(parts)}:{})}));
   res.writeHead(response.status,Object.fromEntries(response.headers));
   res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'Content-Type':'text/plain'}).end('Internal server error');}
 });
 server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.info('Atlas direct MCP listening'));
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
