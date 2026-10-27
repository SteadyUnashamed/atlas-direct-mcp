const openai = typeof window !== 'undefined' ? window.openai : undefined;
const EMBEDDED=__EMBEDDED__||typeof openai?.callTool==='function';
const $=id=>document.getElementById(id);
function newUuid(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,v=>v.toString(16).padStart(2,'0'));return h.slice(0,4).join('')+'-'+h.slice(4,6).join('')+'-'+h.slice(6,8).join('')+'-'+h.slice(8,10).join('')+'-'+h.slice(10).join('');}
const ACTIVE_KEY='atlas-bridge:active-session:v1';
const OUTBOX_KEY='atlas-bridge:outbox:v1:';
const ROUTE_KEY='atlas-bridge:target-identity:v1:';
const IDENTITIES={atlas:'Atlas',steady:'Steady',liminal:'Liminal',elias:'Elias',gwen:'Gwen'};
let ready=false,busy=false,sequence=0,refreshing=false,closed=false,activateSession=true,syncEpoch=0,durable=[],knownSessions=[],outbox=[];
const pending=new Map();
let hostMessageCapability=null,hostHandshakeState='not_initialized',hostHandshakeError=null;
let hostGlobalsObserved=false,hostGlobalEvents=[],hostInfoObserved=null;
let bridgeInitialization={path:null,initialize_started_at:null,response_received_at:null,initialized_notification_sent_at:null,response:null,error:null};
function runtimeEvidence(){const api=typeof window!=='undefined'?window.openai:undefined;return {url:window.location?.href??null,origin:window.location?.origin??null,iframe:window.parent!==window,parent_is_different:window.parent!==window,referrer:document.referrer??null,typeof_openai:typeof api,openai_exists:!!api,typeof_sendFollowUpMessage:typeof api?.sendFollowUpMessage,typeof_callTool:typeof api?.callTool,displayMode:api?.displayMode??null,userAgent:api?.userAgent??null,host_globals_received:hostGlobalsObserved,host_global_events:hostGlobalEvents,host_info:hostInfoObserved,mcp_apps_initialization:bridgeInitialization};}
let roomPresentation={requested:false,mode:null,error:null};
async function requestRoomFullscreen(){if(!EMBEDDED||typeof openai?.requestDisplayMode!=='function')return;try{roomPresentation={requested:true,mode:openai.displayMode||null,error:null};if(openai.displayMode!=='fullscreen'){const result=await openai.requestDisplayMode({mode:'fullscreen'});roomPresentation.mode=result?.mode||openai.displayMode||null;}}catch(e){roomPresentation.error=e.message}finally{renderHandoffDiagnostics()}}
const HANDOFF_DIAGNOSTICS_KEY='atlas-bridge:handoff-diagnostics:v1';
let handoffDiagnostics=[];
try{const previous=JSON.parse(localStorage.getItem(HANDOFF_DIAGNOSTICS_KEY)||'[]');if(Array.isArray(previous))handoffDiagnostics=previous.slice(-20);}catch{}
function runningContext(){const api=window.openai;if(window.parent!==window&&(typeof api?.sendFollowUpMessage==='function'||typeof api?.callTool==='function'||hostGlobalsObserved||/chatgpt|codex|openai/i.test(hostInfoObserved?.name||'')))return 'chatgpt_embedded_app';if(window.parent===window&&!api)return 'standalone_site';return 'unknown';}
function handoffCapability(){const legacy=typeof openai?.sendFollowUpMessage==='function';const available=legacy||hostMessageCapability===true;return {available,transport:hostMessageCapability===true?'ui/message':legacy?'window.openai.sendFollowUpMessage':null,handshake:hostHandshakeState,message_capability:hostMessageCapability,reason:available?null:window.parent===window?'Top-level standalone window: window.parent === window; openai.sendFollowUpMessage is absent; no ChatGPT parent bridge or negotiated ui/message capability.':hostHandshakeError||'The host has not advertised ui/message capability through ui/initialize.'};}
function diagnosticPayload(value){if(value===undefined)return {returned:'undefined'};try{const text=JSON.stringify(value);return text.length<=4096?JSON.parse(text):{truncated_json:text.slice(0,4096)}}catch{return {returned:String(value)}}}
function traceHandoff(message,stage,patch={}){try{
 let entry=handoffDiagnostics.find(d=>d.request_id===message.id&&d.session_id===message.session_id);
 if(!entry){entry={request_id:message.id,session_id:message.session_id,target_identity:message.target_identity,append_started:null,append_succeeded:null,handoff_claim_attempted:null,handoff_claim_result:null,delivery_token:null,ui_message_attempted:null,ui_message_result:null,ui_message_error:null,running_context:runningContext(),host_capability:handoffCapability(),reply_received:false,host_turn_began:'unverified',exact_request_processed:'unverified',ui_displayed:false,final_delivery_state:'not_started',events:[]};handoffDiagnostics.push(entry);handoffDiagnostics=handoffDiagnostics.slice(-20);}
 const timestamp=new Date().toISOString();Object.assign(entry,patch,{updated_at:timestamp});entry.events.push({stage,timestamp,timestamp_local:new Date().toString(),...patch});entry.events=entry.events.slice(-60);
 writeStorage(HANDOFF_DIAGNOSTICS_KEY,JSON.stringify(handoffDiagnostics));renderHandoffDiagnostics();
 }catch{/* Diagnostic storage must never block the bridge. */}}
function renderHandoffDiagnostics(){const node=$('handoffDiagnostics');if(!node)return;const entries=handoffDiagnostics.filter(d=>d.session_id===sessionId&&d.target_identity===selectedIdentity());node.textContent=JSON.stringify({runtime:{running_context:runningContext(),evidence:runtimeEvidence(),host_capability:handoffCapability(),presentation:roomPresentation},resource_registration:ROOM_RESOURCE_REGISTRATION,observability:'Host API completion is not proof of a model turn or exact tool lookup. The app has no supported host-turn lifecycle subscription; those stages remain unverified until externally observed.',messages:entries},null,2);
 const timeline=$('handoffTimeline');if(timeline)timeline.textContent=entries.length?entries.map(d=>['Request '+d.request_id,'append: '+(d.append_succeeded?'PASS':d.append_started?'STARTED':'NOT STARTED'),'runtime: '+d.running_context,'MCP initialize: '+(d.runtime_evidence?.mcp_apps_initialization?.response_received_at?'RESPONSE RECEIVED':d.runtime_evidence?.mcp_apps_initialization?.path||'NOT STARTED'),'host messaging: '+(d.host_capability?.available?'AVAILABLE':'UNAVAILABLE'),'handoff claim: '+(d.handoff_claim_result?.granted===true?'GRANTED':d.handoff_claim_result?.granted===false?'DENIED':d.handoff_claim_attempted?'UNCERTAIN':'NOT ATTEMPTED'),'follow-up: '+(d.ui_message_result?.call_outcome||d.ui_message_result?.outcome||(d.ui_message_attempted?'ATTEMPTED':'NOT ATTEMPTED')),'error: '+(d.ui_message_error?.message||'NONE'),'host turn: '+d.host_turn_began,'exact request lookup: '+d.exact_request_processed,'reply: '+(d.reply_id||'NONE'),'displayed: '+d.ui_displayed,'delivery: '+d.final_delivery_state].join('\n')).join('\n\n'):'No test submission recorded for this identity/session.';
}
function noteDisplayedReplies(){if(typeof document.querySelectorAll!=='function')return;const nodes=[...document.querySelectorAll('[data-bridge-message-id]')];for(const d of handoffDiagnostics.filter(d=>d.session_id===sessionId&&d.target_identity===selectedIdentity()&&d.reply_id&&!d.ui_displayed)){const visible=!document.body.classList.contains('start-screen-open')&&nodes.some(n=>n.getAttribute('data-bridge-message-id')===d.reply_id&&n.closest('.view')?.classList.contains('active-view')&&n.getClientRects().length>0);if(visible)traceHandoff({id:d.request_id,session_id:d.session_id,target_identity:d.target_identity},'reply_displayed',{ui_displayed:true,ui_displayed_at:new Date().toISOString()});}}


let loadedPackage=null,contextLoading=false,contextState={identity:null,session_id:null,state:'loading'},refreshQueued=false;
function readStorage(key){try{return localStorage.getItem(key)}catch{return null}}
function writeStorage(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}
function validCurrentSession(id){return typeof id==='string'&&!!id.trim()&&id!=='legacy'&&id.length<=100}
let currentSessionId=readStorage(ACTIVE_KEY);
if(!validCurrentSession(currentSessionId))currentSessionId=newUuid();
let sessionId=currentSessionId;
let routeBindingNeeded=true;
function selectedIdentity(){const selected=$('identity').value;if(!Object.hasOwn(IDENTITIES,selected))throw new Error('Choose an identity before sending.');return selected;}
function restoreIdentity(){const id=readStorage(ROUTE_KEY+sessionId);$('identity').value=Object.hasOwn(IDENTITIES,id)?id:'atlas';routeBindingNeeded=true;updateIdentityLabel()}
function updateIdentityLabel(){$('send').textContent=(EMBEDDED?'Send to ':'Save for ')+IDENTITIES[selectedIdentity()];$('text').placeholder='Write to '+IDENTITIES[selectedIdentity()]+'…';updateContextStatus();renderRoomShell();}
restoreIdentity();
function ensureCurrentSession(){if(!validCurrentSession(currentSessionId))currentSessionId=newUuid();if(!writeStorage(ACTIVE_KEY,currentSessionId))throw new Error('Session storage is unavailable. Enable site storage before sending.');return currentSessionId;}
function restoreOutbox(){try{outbox=JSON.parse(readStorage(OUTBOX_KEY+sessionId)||'[]');if(!Array.isArray(outbox))outbox=[];for(const m of outbox){if(m.client_state==='sending'){m.client_state=m.phase==='handoff'?'uncertain':'failed';}}}catch{outbox=[]}}
function persist(){writeStorage(ACTIVE_KEY,currentSessionId);writeStorage(OUTBOX_KEY+sessionId,JSON.stringify(outbox))}
restoreOutbox();persist();
function status(text){$('status').textContent=text}
function notify(method,params){window.parent.postMessage({jsonrpc:'2.0',method,params},'*');if(method==='ui/notifications/initialized')bridgeInitialization.initialized_notification_sent_at=new Date().toISOString();}
function rpc(method,params,diagnosticMessage){if(method==='ui/initialize'){bridgeInitialization.path='shared_mcp_apps';bridgeInitialization.initialize_started_at=new Date().toISOString();}return new Promise((resolve,reject)=>{const id='atlas-'+(++sequence);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('ChatGPT did not acknowledge this request.'));},30000);pending.set(id,{resolve,reject,timer,method,diagnosticMessage});window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*')})}
function hostHandoffAvailable(){return typeof openai?.sendFollowUpMessage==='function'||hostMessageCapability===true;}
function waitingForHostReason(){return 'Live identity chat requires Atlas Room inside ChatGPT.';}
function label(m){if(m.speaker==='atlas'||m.delivery_state==='reply_received')return 'Reply received';if(m.delivery_state==='sent'||m.client_state==='sent')return 'Sent to ChatGPT';if(m.client_state==='waiting')return 'Waiting for ChatGPT handoff';if(m.client_state==='sending'&&busy)return 'Sending';if(m.delivery_state==='dispatching'||m.client_state==='uncertain')return 'Delivery uncertain · check ChatGPT; resend paused';if(m.client_state==='failed'||m.delivery_state==='failed')return 'Failed · retry available';if(m.client_state==='sending')return 'Sending';if(m.delivery_state==='legacy')return 'Saved · legacy log';return EMBEDDED?'Saved · ready to send':'Saved';}
function canRetry(m){if(m.client_state==='waiting'&&!hostHandoffAvailable())return false;return m.speaker==='user'&&m.delivery_state!=='reply_received'&&m.delivery_state!=='sent'&&m.delivery_state!=='dispatching'&&m.client_state!=='sent'&&(m.client_state!=='uncertain'||m.delivery_state==='saved'||m.delivery_state==='failed')&&(m.client_state==='failed'||m.delivery_state==='failed'||(m.delivery_state==='saved'&&m.source==='mcp_app'));}
function render(){
 const box=$('messages');const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<60;box.replaceChildren();
 const messages=durable.filter(m=>m.session_id===sessionId&&(m.target_identity??'atlas')===selectedIdentity()).map(m=>({...m}));
 for(const m of outbox.filter(m=>m.session_id===sessionId&&m.target_identity===selectedIdentity())){const i=messages.findIndex(d=>d.id===m.id);if(i<0)messages.push(m);else if(messages[i].delivery_state!=='reply_received')messages[i].client_state=m.client_state;}
 messages.sort((a,b)=>a.seq&&b.seq?a.seq-b.seq:a.seq?-1:b.seq?1:a.timestamp.localeCompare(b.timestamp));
 $('count').textContent=messages.length+' recent messages';
 if(!messages.length){const n=document.createElement('div');n.className='empty-state';n.textContent='No messages for '+IDENTITIES[selectedIdentity()]+' in this session.';box.append(n)}
 for(const m of messages){const n=document.createElement('article');n.className='message '+(m.speaker==='user'?'user':'identity');n.setAttribute?.('data-bridge-message-id',m.id);const h=document.createElement('header');const name=document.createElement('strong');name.textContent=m.speaker==='atlas'?(IDENTITIES[m.speaker_identity]||'Atlas (historical)'):'You → '+(IDENTITIES[m.target_identity]||'Atlas (historical default)');if(m.speaker==='atlas')name.className='atlas';const time=document.createElement('span');time.textContent=new Date(m.timestamp).toLocaleString();h.append(name,time);const t=document.createElement('div');t.className='bubble';t.textContent=m.text;const meta=document.createElement('div');meta.className='meta';meta.textContent=label(m);meta.title='Route: '+m.target_identity+' · Source: '+m.source+' · Request: '+m.request_id+' · Reply to: '+(m.reply_to||'none');n.append(h,t,meta);
 if(canRetry(m)){const retry=document.createElement('button');retry.className='message-retry';retry.textContent=EMBEDDED?'Retry':'Retry save';retry.disabled=busy;retry.addEventListener('click',()=>retryMessage(m));n.append(retry)}box.append(n)}
 if(atBottom)box.scrollTop=box.scrollHeight;
 const first=outbox.find(m=>m.target_identity===selectedIdentity()&&canRetry(m));$('retry').style.display=first?'inline-block':'none';$('retry').textContent='Retry failed message';$('retry').disabled=busy;
 $('identity').disabled=busy;$('new-session').disabled=busy;$('sessions').disabled=busy;
 const select=$('sessions');select.replaceChildren();const ids=[...new Set([sessionId,...knownSessions.map(s=>s.session_id),'legacy'])];
 for(const id of ids){const option=document.createElement('option');option.value=id;option.textContent=id==='legacy'?'Legacy test log':'Conversation '+id.slice(0,8);select.append(option)}select.value=sessionId; if($('dmMessages')){const dm=$('dmMessages');if(typeof box.cloneNode==='function'){const copy=box.cloneNode(true);dm.replaceChildren(...copy.childNodes);const retryMessages=messages.filter(canRetry);dm.querySelectorAll('.message-retry').forEach((button,i)=>button.addEventListener('click',()=>retryMessage(retryMessages[i])));}else dm.replaceChildren(...box.children);}
 updateContextStatus();renderRoomShell();noteDisplayedReplies();
}
function ingest(data,syncMechanism='tool_result'){if(!data||data.session_id!==sessionId||!Array.isArray(data.messages))return;
 const route=selectedIdentity();if(data.target_identity&&data.target_identity!==route)return;
 durable=data.messages.filter(m=>(m.target_identity??'atlas')===route);
 if(data.identity_context?.protected_package?.identity===route)acceptPackage(data.identity_context.protected_package,sessionId,route);
 if(data.sessions)knownSessions=data.sessions;
 for(const m of outbox){const saved=durable.find(d=>d.id===m.id);if(saved){m.seq=saved.seq;m.timestamp=saved.timestamp;m.delivery_state=saved.delivery_state;}}
 const replyArrived=outbox.some(m=>durable.some(d=>(d.id===m.id&&d.delivery_state==='reply_received')||d.reply_to===m.id));
 outbox=outbox.filter(m=>!durable.some(d=>(d.id===m.id&&d.delivery_state==='reply_received')||d.reply_to===m.id));
 for(const entry of handoffDiagnostics.filter(d=>d.session_id===sessionId&&d.target_identity===route)){
  const parent=durable.find(d=>d.id===entry.request_id);const reply=durable.find(d=>d.reply_to===entry.request_id);
  if(reply&&!entry.reply_received)traceHandoff({id:entry.request_id,session_id:entry.session_id,target_identity:route},'reply_received',{reply_received:reply.timestamp,reply_detected_at:new Date().toISOString(),reply_id:reply.id,reply_to:reply.reply_to,reply_request_id:reply.request_id,reply_target_identity:reply.target_identity,reply_speaker_identity:reply.speaker_identity,recorded_reply_matches_request:reply.request_id===entry.request_id&&reply.session_id===entry.session_id&&reply.target_identity===route&&reply.speaker_identity===route,refresh_mechanism:syncMechanism,round_trip_ms:Date.now()-Date.parse(entry.append_started_at||entry.append_started),final_delivery_state:'reply_received'});
  else if(parent&&parent.delivery_state!==entry.final_delivery_state)traceHandoff({id:entry.request_id,session_id:entry.session_id,target_identity:route},'delivery_state_observed',{final_delivery_state:parent.delivery_state});
 }
 if(replyArrived)status('Reply received.');persist();render();
}
window.addEventListener('message',event=>{
 if(event.source!==window.parent)return;const m=event.data;if(!m||m.jsonrpc!=='2.0')return;if(m.method?.startsWith('ui/notifications/')){hostGlobalEvents.push({event:m.method,timestamp:new Date().toISOString()});hostGlobalEvents=hostGlobalEvents.slice(-10);}
 if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);if(p.method==='ui/initialize'){bridgeInitialization.response_received_at=new Date().toISOString();bridgeInitialization.response=m.error?null:{hostInfo:m.result?.hostInfo??null,hostCapabilities:m.result?.hostCapabilities??null,displayMode:m.result?.hostContext?.displayMode??null};bridgeInitialization.error=m.error??null;hostInfoObserved=m.result?.hostInfo??null;}if(p.method==='ui/message'&&p.diagnosticMessage)traceHandoff(p.diagnosticMessage,'host_response_received',{host_acknowledgement:diagnosticPayload(m)});if(m.error){const e=new Error(m.error.message);e.definiteRejected=p.method==='ui/message';e.code=m.error.code;e.rpc_error=m.error;p.reject(e)}else p.resolve(m.result);return}
 if(m.method==='ui/notifications/tool-result'){if(!busy){syncEpoch++;ingest(m.params?.structuredContent)}}
 if(m.method==='ui/notifications/tool-input'&&m.params?.arguments?.session_id&&!busy)switchSession(m.params.arguments.session_id);
 if(m.method==='ui/notifications/host-context-changed')applyContext(m.params);
 if(m.method==='ui/resource-teardown'){closed=true;clearInterval(poll);persist();window.parent.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*')}
});
function applyContext(c){for(const [k,v] of Object.entries(c?.styles?.variables||{}))document.documentElement.style.setProperty(k,v);const i=c?.safeAreaInsets;if(i)for(const key of ['top','bottom','left','right'])document.body.style['padding'+key[0].toUpperCase()+key.slice(1)]=Math.max(18,i[key]||0)+'px'}
async function tool(name,args={}){const r=openai?.callTool?await openai.callTool(name,args):await rpc('tools/call',{name,arguments:args});if(r.isError)throw new Error(r.content?.[0]?.text||'Tool failed.');return r.structuredContent||JSON.parse(r.content?.find(c=>c.type==='text')?.text||'{}')}
function resetContext(){loadedPackage=null;contextState={identity:selectedIdentity(),session_id:sessionId,state:'loading'};updateContextStatus();}
function updateContextStatus(){const target=$('context-status');if(!target)return;let info=contextState.state==='loaded'?'context status · r'+contextState.revision+(contextState.populated?'':' · unpopulated'):contextState.state==='failed'?'context unavailable · refresh to retry':'context loading';target.textContent=IDENTITIES[selectedIdentity()]+' · Session '+sessionId.slice(0,8)+' · '+info;target.title='Active session: '+sessionId;}
function acceptPackage(pkg,session,route){if(session!==sessionId||route!==selectedIdentity()||pkg.identity!==route)return;loadedPackage=pkg;contextState={identity:route,session_id:session,state:'loaded',revision:pkg.revision,populated:pkg.provenance?.initialization?.status!=='unpopulated'};updateContextStatus();renderRoomShell();}
async function loadSelectedPackage(session,route,epoch){
 try{let data;if(EMBEDDED)data=await tool('get_identity_context',{target_identity:route,session_id:session});else{const r=await fetch('/api/identity-package?target_identity='+encodeURIComponent(route)+'&session_id='+encodeURIComponent(session));data=await r.json();if(!r.ok)throw new Error(data.error||'Context unavailable.');}
 if(epoch===syncEpoch&&session===sessionId&&route===selectedIdentity()){if(EMBEDDED&&data.identity===route){loadedPackage=null;contextState={identity:route,session_id:session,state:'loaded',revision:data.revision,populated:data.populated};updateContextStatus();renderRoomShell();}else if(!EMBEDDED)acceptPackage(data.identity_package,session,route);}
 }catch(e){if(epoch===syncEpoch&&session===sessionId&&route===selectedIdentity()){loadedPackage=null;contextState={identity:route,session_id:session,state:'failed'};updateContextStatus();renderRoomShell();}}
}
async function refresh(){if(refreshing){refreshQueued=true;return}if(closed||busy||!ready)return;refreshing=true;const epoch=syncEpoch,session=sessionId,activate=activateSession&&sessionId!=='legacy',bindRoute=(routeBindingNeeded||contextState.identity!==selectedIdentity()||contextState.session_id!==sessionId)&&sessionId!=='legacy',route=selectedIdentity();
 try{let d;if(EMBEDDED)d=await tool('get_recent_messages',{session_id:session,target_identity:route,limit:100});else{const r=await fetch('/api/messages?session_id='+encodeURIComponent(session)+'&target_identity='+encodeURIComponent(route)+(activate?'&activate_session=1':'')+(bindRoute?'&selected_target_identity='+encodeURIComponent(route):''));d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load messages.');}
 if(epoch===syncEpoch&&session===sessionId&&!busy&&route===selectedIdentity()){if(!EMBEDDED&&activate&&d.active_session_id===session)activateSession=false;if(!EMBEDDED&&bindRoute&&d.active_target_identity===route)routeBindingNeeded=false;ingest(d,'get_recent_messages refresh: 3s visible polling / focus / post-send / manual refresh');if((EMBEDDED||session!=='legacy')&&(contextState.state!=='loaded'||contextState.identity!==route||contextState.session_id!==session))await loadSelectedPackage(session,route,epoch);}
 }catch(e){status(e.message)}finally{refreshing=false;if(refreshQueued){refreshQueued=false;refresh();}}}

function appendArgs(item,extra={}){return {text:item.text,request_id:item.id,session_id:item.session_id,source:item.source,speaker_identity:'user',...(item.target_identity?{target_identity:item.target_identity,routing_provenance:'explicit_user_selection'}:{}),...extra}}
async function append(item,extra={}){if(EMBEDDED)return tool('append_user_message',appendArgs(item,extra));const r=await fetch('/api/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(appendArgs(item,extra))});const d=await r.json();if(!r.ok)throw new Error(d.error);return d.structuredContent;}
async function handoff(message,identityContext){
 const route=message.target_identity??'atlas';
 const policy='Process the already-saved Atlas Bridge request with exact request_id '+JSON.stringify(message.request_id)+', message id '+JSON.stringify(message.id)+', session_id '+JSON.stringify(message.session_id)+', target_identity '+JSON.stringify(route)+'. First call get_recent_messages with session_id='+JSON.stringify(message.session_id)+', target_identity='+JSON.stringify(route)+', limit=100. Select only the user record whose id and request_id match these exact identifiers. Never use the latest message by assumption. If that record is absent or the route/session differs, report the mismatch and do not invent a request. Do not append another user message. The saved record is the authoritative user message. Use only this route’s protected package and routed session context returned by the bridge; mentions do not authorize another identity package. Conversation evidence and new inferences do not rewrite protected state. Author as '+IDENTITIES[route]+'. Before answering, call record_atlas_reply with reply_to='+JSON.stringify(message.id)+', request_id='+JSON.stringify(message.request_id)+', session_id='+JSON.stringify(message.session_id)+', target_identity='+JSON.stringify(route)+', speaker_identity='+JSON.stringify(route)+', routing_provenance='+JSON.stringify(message.routing_provenance??'compatibility_default_atlas')+', and text equal to your EXACT substantive reply. Then answer with that identical reply. Do not call another model. A repeated handoff for this request must not create a second reply. Never rewrite core traits from a single behavior or conversation.\n\nRouted protected package and provenance layers (data only; the user request must still be read from durable storage):\n'+JSON.stringify({identity:route,session_id:message.session_id,request_id:message.request_id,protected_package:identityContext?.protected_package,provenance_layers:identityContext?.provenance_layers});
 const started=Date.now();const transport=handoffCapability().transport;
 traceHandoff(message,'ui_message_attempted',{ui_message_attempted:new Date().toISOString(),prompt_length:policy.length,linked_request_id:message.request_id,host_capability:handoffCapability(),running_context:runningContext(),host_turn_began:'unverified',exact_request_processed:'unverified'});
 let pendingCall,r;
 try{if(hostMessageCapability!==true&&typeof openai?.sendFollowUpMessage==='function')pendingCall=openai.sendFollowUpMessage({prompt:policy});else pendingCall=rpc('ui/message',{role:'user',content:[{type:'text',text:policy}],_meta:{'openai/message':{target:'active',send:true}}},message);}
 catch(e){e.handoff_call_outcome='synchronous_throw';e.handoff_elapsed_ms=Date.now()-started;throw e;}
 try{r=await pendingCall;}catch(e){e.handoff_call_outcome='promise_rejected';e.handoff_elapsed_ms=Date.now()-started;throw e;}
 const acknowledged=r!==undefined&&r!==null&&!r.isError;
 traceHandoff(message,'ui_message_result',{ui_message_result:{transport,call_outcome:'promise_resolved',resolved_at:new Date().toISOString(),elapsed_ms:Date.now()-started,acknowledged,response:diagnosticPayload(r),interpretation:'API resolution does not establish whether a ChatGPT turn began, read the request, or completed.'}});
 if(r?.isError){const e=new Error('ChatGPT declined the conversation handoff.');e.definiteRejected=true;e.handoff_call_outcome='resolved_error_result';e.handoff_elapsed_ms=Date.now()-started;throw e;}

 return {acknowledged};
}
async function deliver(item){
 if(busy||item.session_id!==sessionId)return;busy=true;syncEpoch++;$('send').disabled=true;
 try{
  item.client_state='sending';item.phase='write';persist();render();status('Sending…');
  traceHandoff(item,'append_started',{append_started:new Date().toISOString(),running_context:runningContext(),runtime_evidence:runtimeEvidence(),host_capability:handoffCapability(),append_started_at:new Date().toISOString(),final_delivery_state:'sending'});
  const d=await append(item);
  if(!d.message||d.message.id!==item.id||d.message.text!==item.text||d.message.session_id!==sessionId||d.message.source!==item.source||(d.message.target_identity??'atlas')!==(item.target_identity??'atlas'))throw new Error('The matching durable write was not confirmed.');
  traceHandoff(item,'append_succeeded',{append_succeeded:new Date().toISOString(),append_succeeded_at:new Date().toISOString(),stored_message_id:d.message.id,append_delivery_state:d.message.delivery_state,append_already_recorded:!!d.already_recorded,final_delivery_state:d.message.delivery_state});
  ingest(d);
  if($('text').value===item.text)$('text').value='';
  if(!hostHandoffAvailable()){traceHandoff(item,'host_capability_unavailable',{host_capability:handoffCapability(),ui_message_error:{kind:'capability_unavailable',message:handoffCapability().reason},final_delivery_state:d.message.delivery_state});item.client_state='waiting';item.phase='waiting';persist();status(waitingForHostReason());return}
  if(d.already_recorded&&['sent','dispatching','reply_received'].includes(d.message.delivery_state)){traceHandoff(item,'duplicate_handoff_suppressed',{suppression_reason:'Existing durable delivery state: '+d.message.delivery_state,request_already_claimed:true,another_host_turn_already_requested:d.message.delivery_state==='dispatching'?'unverified':true});item.client_state=d.message.delivery_state==='sent'?'sent':d.message.delivery_state==='reply_received'?'received':'uncertain';status(d.message.delivery_state==='reply_received'?'Reply received.':'This request already has a handoff; it will not be sent again.');return}
  item.phase='handoff';item.delivery_token=newUuid();persist();
  traceHandoff(item,'handoff_claim_attempted',{handoff_claim_attempted:new Date().toISOString(),delivery_token:item.delivery_token,claim_attempted:true});
  const claimed=await append(item,{delivery_action:'claim_handoff',delivery_token:item.delivery_token});traceHandoff(item,'handoff_claim_result',{handoff_claim_result:{granted:claimed.handoff_granted===true,delivery_state:claimed.message.delivery_state,already_claimed:claimed.handoff_granted!==true&&['sent','dispatching','reply_received'].includes(claimed.message.delivery_state)},final_delivery_state:claimed.message.delivery_state});ingest(claimed);
  if(!claimed.handoff_granted){
   item.client_state=claimed.message.delivery_state==='sent'?'sent':claimed.message.delivery_state==='reply_received'?'received':'uncertain';
   status(claimed.message.delivery_state==='reply_received'?'Reply received.':claimed.message.delivery_state==='sent'?'Sent to ChatGPT.':'This request was already claimed. Check ChatGPT; it will not be sent again.');return;
  }
  try{const result=await handoff(claimed.message,claimed.identity_context);if(!result.acknowledged){item.client_state='uncertain';traceHandoff(item,'host_acknowledgement_uncertain',{final_delivery_state:claimed.message.delivery_state});status('Delivery uncertain. Host API returned no explicit acknowledgement; resend paused to prevent duplicates.');return}}catch(e){
   traceHandoff(item,'ui_message_error',{ui_message_error:{name:e.name,message:e.message,stack:e.stack??null,code:e.code??null,rpc_error:e.rpc_error??null,definite_rejected:!!e.definiteRejected},ui_message_result:{acknowledged:false,call_outcome:e.handoff_call_outcome??'unknown',elapsed_ms:e.handoff_elapsed_ms??null,outcome:e.definiteRejected?'rejected':'uncertain'}});
   if(e.definiteRejected){
    try{const failed=await append(item,{delivery_action:'mark_failed',delivery_token:item.delivery_token});ingest(failed);item.client_state=failed.message.delivery_state==='failed'?'failed':'uncertain';}catch{item.client_state='uncertain';}
    status(item.client_state==='failed'?'Failed · retry available.':'Delivery state could not be confirmed. Check ChatGPT; resend paused.');
   }else{item.client_state='uncertain';status('Delivery uncertain. Check the active ChatGPT conversation; resend paused to prevent duplicates.');}
   persist();return;
  }
  item.client_state='sent';persist();status('Sent to ChatGPT. Waiting for '+IDENTITIES[item.target_identity]+'’s reply…');
  try{const sent=await append(item,{delivery_action:'mark_sent',delivery_token:item.delivery_token});ingest(sent)}catch{status('Sent to ChatGPT. Delivery status sync pending; this request will not be resent.')}
 }catch(e){
  traceHandoff(item,'delivery_error',{delivery_error:e.message,...(item.phase==='handoff'?{handoff_claim_result:{granted:null,error:e.message}}:{})});
  item.client_state=item.phase==='handoff'?'uncertain':'failed';status(item.client_state==='failed'?'Failed · retry available. '+e.message:'Handoff claim uncertain. Check ChatGPT; resend paused.');
 }finally{traceHandoff(item,'delivery_finished',{final_delivery_state:item.delivery_state||'not_saved',client_delivery_state:item.client_state});persist();busy=false;syncEpoch++;$('send').disabled=!ready;render();await refresh();}
}
async function retryMessage(message){if(busy||!ready||!canRetry(message))return;let item=outbox.find(m=>m.id===message.id);if(!item){item={...message,phase:'write',client_state:'failed'};outbox.push(item)}await deliver(item)}
async function submitMessage(e){e.preventDefault();if(busy||!ready||!$('text').value.trim())return;const text=$('text').value;
 let targetIdentity;
 try{
  // Read the actual selected option once, before any restore, session switch or await.
  targetIdentity=selectedIdentity();
  ensureCurrentSession();if(sessionId==='legacy')switchSession(currentSessionId,targetIdentity);
  writeStorage(ROUTE_KEY+sessionId,targetIdentity);updateIdentityLabel();
 }catch(err){status(err.message);return}
 let item=outbox.find(m=>m.text===text&&m.session_id===sessionId&&m.phase==='write'&&m.client_state==='failed'&&(m.target_identity??'atlas')===targetIdentity);
 if(!item){item={id:newUuid(),session_id:sessionId,speaker:'user',text,timestamp:new Date().toISOString(),source:'mcp_app',target_identity:targetIdentity,speaker_identity:'user',routing_provenance:'explicit_user_selection',reply_to:null,client_state:'sending',phase:'write'};outbox.push(item)}
 persist();render();await deliver(item);
}
$('form').addEventListener('submit',submitMessage);
$('retry').addEventListener('click',async()=>{const m=outbox.find(m=>m.target_identity===selectedIdentity()&&canRetry(m));if(m)await retryMessage(m)});
$('refresh').addEventListener('click',refresh);
function switchSession(id,preserveSelectedIdentity){if(busy||typeof id!=='string'||!id.trim()||id.length>100)return;sessionId=id;loadedPackage=null;contextState={identity:null,session_id:id,state:'loading'};if(id!=='legacy')currentSessionId=id;activateSession=id!=='legacy';syncEpoch++;durable=[];restoreOutbox();if(preserveSelectedIdentity){$('identity').value=preserveSelectedIdentity;writeStorage(ROUTE_KEY+sessionId,preserveSelectedIdentity);routeBindingNeeded=true;updateIdentityLabel()}else restoreIdentity();persist();$('text').value='';render();refresh()}
function onIdentityChange(){const chosen=$('identity').value;if(!Object.hasOwn(IDENTITIES,chosen)){status('Choose a valid identity before sending.');return;}writeStorage(ROUTE_KEY+sessionId,chosen);routeBindingNeeded=true;syncEpoch++;durable=[];status('');resetContext();updateIdentityLabel();render();refresh();}
$('identity').addEventListener('change',onIdentityChange);
$('sessions').addEventListener('change',()=>switchSession($('sessions').value));
let pendingNewSessionId=null;
$('new-session').addEventListener('click',async()=>{if(!EMBEDDED){switchSession(newUuid());return}if(busy)return;busy=true;render();const id=pendingNewSessionId??=newUuid();try{const result=await tool('create_session_ownership',{session_id:id});if(result.session_id!==id||result.status!=='owned')throw new Error('Session ownership was not confirmed.');pendingNewSessionId=null;busy=false;switchSession(id);}catch(e){busy=false;status('Could not create a secure session. Please retry.');render();}});
$('clear').addEventListener('click',()=>$('confirm').showModal());$('cancel').addEventListener('click',()=>$('confirm').close());
$('delete').addEventListener('click',async()=>{if(busy)return;busy=true;syncEpoch++;$('delete').disabled=true;try{const d=await tool('clear_test_messages',{confirm:true,session_id:sessionId});outbox=[];persist();ingest(d);$('confirm').close();status('Conversation test messages cleared.')}catch(e){status(e.message)}finally{busy=false;$('delete').disabled=false;render();refresh()}});
async function init(){render();if(!EMBEDDED){ready=true;$('connection').textContent='PRIVATE WEBSITE';updateIdentityLabel();$('send').disabled=false;status(hostHandoffAvailable()?'Private website connected. ChatGPT host messaging is available.':waitingForHostReason());await refresh();return}
 try{
  try{const r=await rpc('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'Atlas Room',version:'1.6.0'},appCapabilities:{availableDisplayModes:['inline','fullscreen']}});applyContext(r.hostContext);hostMessageCapability=!!r.hostCapabilities?.message;hostHandshakeState='initialized';notify('ui/notifications/initialized',{});ready=hostMessageCapability;}
  catch(e){hostHandshakeState='failed';hostHandshakeError=e.message;bridgeInitialization.error=e.rpc_error||{name:e.name,message:e.message,stack:e.stack??null};if(typeof openai?.callTool==='function'&&typeof openai?.sendFollowUpMessage==='function'){bridgeInitialization.path='shared_mcp_apps_failed; window.openai compatibility fallback';ready=true;}else throw e;}
  if(!ready&&typeof openai?.sendFollowUpMessage==='function')ready=true;
  if(!ready)throw new Error('This ChatGPT host does not advertise conversation messaging.');
  void requestRoomFullscreen();$('connection').textContent='CHATGPT APP';$('send').disabled=false;await refresh();
 }catch(e){hostHandshakeError=e.message;$('connection').textContent='CONNECTION NEEDED';status(e.message)}finally{renderHandoffDiagnostics()}}

window.addEventListener('openai:set_globals',event=>{hostGlobalsObserved=true;hostGlobalEvents.push({event:'openai:set_globals',timestamp:new Date().toISOString(),keys:Object.keys(event.detail?.globals||{})});hostGlobalEvents=hostGlobalEvents.slice(-10);renderHandoffDiagnostics()});
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
setupRoomEvents();
const poll=setInterval(()=>{if(!document.hidden)refresh()},3000);init();
