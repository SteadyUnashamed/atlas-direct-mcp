import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {McpServer,createMcpHandler} from '@modelcontextprotocol/server';
import {registerAppTool,registerAppResource,RESOURCE_MIME_TYPE} from '@modelcontextprotocol/ext-apps/server';
import {z} from 'zod';

export const RESOURCE='ui://atlas-bridge/proof-001/spec-probe-v2.html';
const HTML=await readFile(new URL('./probe.html',import.meta.url),'utf8');
const handler=createMcpHandler(()=>{
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
 return server;
},{responseMode:'json'});

export async function handle(request){
 const url=new URL(request.url);
 if(url.pathname==='/health'&&request.method==='GET')return Response.json({status:'ok',phase:'static_probe_only'});
 if(url.pathname!=='/mcp')return new Response('Atlas direct MCP — static probe only.',{status:url.pathname==='/'?200:404});
 // No bridge/data tools exist in phase 1. Never trust incoming identity headers.
 const rpc=request.method==='POST'?await request.clone().json().catch(()=>({})):{};
 const result=await handler.fetch(request);
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
