let roomView='room',roomProfileTab='identity',roomShellSignature='';
function roomEscape(value=''){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function roomAvatar(person,size='sm'){return person.visual?.portrait?'<span class="avatar-'+size+' has-image identity-'+roomEscape(person.id)+'"><img src="'+roomEscape(person.visual.portrait)+'" alt="'+roomEscape(person.name)+' portrait"></span>':'<span class="avatar-'+size+'">'+roomEscape(person.initials)+'</span>'}
function contextSummary(){const s=contextState;if(s.identity!==selectedIdentity()||s.session_id!==sessionId)return 'Protected context status: loading';if(s.state==='loaded')return 'Protected context status available · r'+s.revision+(s.populated?'':' · unpopulated');if(s.state==='failed')return 'Protected context unavailable · retry on refresh';return 'Protected context status: loading';}
function profileRoute(id){if(busy||!Object.hasOwn(IDENTITIES,id))return;$('identity').value=id;onIdentityChange();}
function syncRoomStatus(){
 if(typeof document.querySelectorAll!=='function')return;
 const route=selectedIdentity(),name=IDENTITIES[route],raw=$('status').textContent||'';
 const context=contextState.state==='loaded'?'Context status · r'+contextState.revision+(contextState.populated?'':' · empty'):contextState.state==='failed'?'Context unavailable':'Context loading';
 $('compactContext').textContent=name+' · '+sessionId.slice(0,8)+' · '+context;$('compactContext').title='Session '+sessionId+' · '+contextSummary();
 let delivery='';if(raw.startsWith('Waiting for ChatGPT handoff'))delivery='Waiting for ChatGPT handoff';else if(raw.startsWith('Private website connected.'))delivery=hostHandoffAvailable()?'ChatGPT host available':'ChatGPT handoff required';else if(raw.startsWith('Sent to ChatGPT'))delivery='Sent to ChatGPT';else if(raw)delivery=raw.length>90?raw.slice(0,87)+'…':raw;
 for(const id of ['groupDelivery','dmDelivery']){$(id).textContent=delivery;$(id).title=raw;}
 if(roomView==='progress'){
  renderHandoffDiagnostics();
  $('sessionInspection').textContent=JSON.stringify({session_id:sessionId,target_identity:route,speaker_identity:'user',routing_provenance:'explicit_user_selection',protected_context:{state:contextState.state,revision:contextState.revision,populated:contextState.populated}},null,2);
  $('provenanceInspection').innerHTML=durable.filter(m=>m.session_id===sessionId&&m.target_identity===route).map(m=>'<pre>'+roomEscape(JSON.stringify({id:m.id,request_id:m.request_id,session_id:m.session_id,target_identity:m.target_identity,speaker_identity:m.speaker_identity,reply_to:m.reply_to,source:m.source,routing_provenance:m.routing_provenance,delivery_state:m.delivery_state,timestamp:m.timestamp,provenance:m.provenance},null,2))+'</pre>').join('')||'<p>No durable messages in this routed conversation.</p>';
 }
}
function renderRoomShell(){
 if(typeof document.querySelectorAll!=='function')return;
 syncRoomStatus();
 const identity=selectedIdentity(),person=ROOM_PROFILES[identity];
 const signature=JSON.stringify([identity,sessionId,roomView,roomProfileTab,contextState,ready,busy]);if(signature===roomShellSignature)return;roomShellSignature=signature;
 const people=Object.entries(ROOM_PROFILES);
 $('identityList').innerHTML=people.map(([id,p])=>'<button type="button" class="identity-btn chat-identity-btn '+(id===identity?'active':'')+'" data-identity="'+id+'" aria-pressed="'+(id===identity)+'" '+(busy?'disabled':'')+'>'+roomAvatar(p)+'<span class="identity-meta"><strong>'+roomEscape(p.name)+'</strong><span>'+roomEscape(p.role.split('•')[0].trim())+'</span></span></button>').join('');
 $('identityList').querySelectorAll('[data-identity]').forEach(btn=>btn.addEventListener('click',()=>profileRoute(btn.dataset.identity)));
 $('profileSelector').innerHTML=people.map(([id,p])=>'<button type="button" class="profile-select-btn '+(id===identity?'active':'')+'" data-profile="'+id+'" aria-pressed="'+(id===identity)+'" '+(busy?'disabled':'')+'>'+roomAvatar(p)+'<span class="identity-meta"><strong>'+roomEscape(p.name)+'</strong><span>'+roomEscape(p.role.split('•')[0].trim())+'</span></span></button>').join('');
 $('profileSelector').querySelectorAll('[data-profile]').forEach(btn=>btn.addEventListener('click',()=>profileRoute(btn.dataset.profile)));
 $('participantChips').innerHTML=people.map(([id,p])=>'<button type="button" class="chip participant-chip" data-route="'+id+'" aria-pressed="'+(id===identity)+'" '+(busy?'disabled':'')+'>'+roomAvatar(p,'mini')+roomEscape(p.name)+'</button>').join('');
 $('participantChips').querySelectorAll('[data-route]').forEach(btn=>btn.addEventListener('click',()=>profileRoute(btn.dataset.route)));
 $('roomSnapshot').innerHTML=people.map(([id,p])=>'<button type="button" class="snapshot-card state-'+id+'" data-snapshot="'+id+'" aria-pressed="'+(id===identity)+'" '+(busy?'disabled':'')+'><div class="snapshot-top"><div class="snapshot-identity">'+roomAvatar(p)+'<strong>'+roomEscape(p.name)+'</strong></div><span class="state-dot"></span></div><p>'+roomEscape(p.role)+'</p></button>').join('');
 $('roomSnapshot').querySelectorAll('[data-snapshot]').forEach(btn=>btn.addEventListener('click',()=>profileRoute(btn.dataset.snapshot)));
 const banner=person.visual?.banner?' style="--profile-banner: url(\''+roomEscape(person.visual.banner)+'\')"':'';
 $('profileHeader').innerHTML='<div class="profile-hero"'+banner+'>'+roomAvatar(person,'lg')+'<div class="profile-copy"><div class="eyebrow">Identity profile</div><h3>'+roomEscape(person.name)+'</h3><div class="role">'+roomEscape(person.role)+'</div><div class="tags"><span class="chip">'+roomEscape(contextSummary())+'</span></div></div></div>';
 document.querySelectorAll('.profile-tab').forEach(btn=>{btn.classList.toggle('active',btn.dataset.profileTab===roomProfileTab);btn.onclick=()=>{roomProfileTab=btn.dataset.profileTab;renderRoomShell()}});
 const info=roomProfileTab==='identity'?['Established','Current state','Relationships','History']:roomProfileTab==='development'?['Established','Emerging','Exploring','Unresolved']:['Package history'];
 // Display-only canon summaries: never used as protected state or sent in a handoff.
 $('profileContent').innerHTML=roomProfileTab==='identity'?'<div class="info-grid" data-content-kind="presentation_profile_content" aria-label="Presentation profile">'+Object.entries(PRESENTATION_PROFILES[identity]).map(([label,text])=>'<section class="info-card presentation-profile"><h4>'+roomEscape(label)+'</h4><p>'+roomEscape(text)+'</p></section>').join('')+'</div>':'<div class="info-grid">'+info.map(label=>'<div class="info-card"><h4>'+label+'</h4><ul><li>'+roomEscape(contextState.state==='loaded'?(contextState.populated?'Protected state status is available; contents remain private.':'No protected state has been added yet.'):'Protected state status is unavailable.')+'</li></ul></div>').join('')+'</div>';
 $('personalSpacePanel').innerHTML=person.visual?.room?'<div class="space-image-wrap"><img class="space-image" src="'+roomEscape(person.visual.room)+'" alt="'+roomEscape(person.visual.roomTitle||person.name+' personal space')+'"><div class="space-overlay"><div class="eyebrow">Personal-space snapshot</div><h3>'+roomEscape(person.visual.roomTitle)+'</h3><p>'+roomEscape(person.visual.roomCaption)+'</p></div></div>':'<div class="panel-header compact"><div><h3>'+roomEscape(person.name)+'’s space</h3><p>Visual not locked yet</p></div></div><div class="space-placeholder"><div class="empty-icon">✦</div><strong>Personal-space snapshot pending</strong><span>No profile details yet.</span></div>';
 $('dmTitle').textContent='Talk With '+person.name;$('dmSubtitle').textContent='Private identity lane · '+contextSummary();$('dmSend').disabled=!ready||busy;$('dmSend').textContent='Send';$('dmInput').placeholder='Write to '+person.name+'…';
 $('developmentGrid').innerHTML=people.map(([id,p])=>'<article class="dev-card" data-open-profile="'+id+'"><div class="dev-card-head">'+roomAvatar(p)+'<div><strong>'+roomEscape(p.name)+'</strong><div class="eyebrow">protected identity context</div></div></div><div class="count-row">'+['Est.','Emerg.','Explore','Open','Revised'].map(label=>'<div class="count-box"><b>—</b><span>'+label+'</span></div>').join('')+'</div><p>'+roomEscape(id===identity?contextSummary():'Select profile to check context availability.')+'</p></article>').join('');
 $('developmentGrid').querySelectorAll('[data-open-profile]').forEach(card=>{card.style.cursor='pointer';card.onclick=()=>{roomView='profiles';roomProfileTab='development';profileRoute(card.dataset.openProfile)}});
 const viewId=roomView==='identity-chat'?'identityChatView':roomView+'View';
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active-view',v.id===viewId));document.querySelectorAll('.nav-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===roomView));
 document.body.dataset.view=roomView==='progress'?'development':roomView;
 $('pageTitle').textContent=roomView==='profiles'?person.name+' Profile':roomView==='progress'?'Identity Development':roomView==='identity-chat'?'Identity Chat':"Orion’s Tribe Chat";
 $('chatTitle').textContent='Conversation with '+person.name;$('hint').textContent='Only '+person.name+'’s explicitly routed messages in this session.';noteDisplayedReplies();
}
function setupRoomEvents(){
 if(typeof document.querySelectorAll!=='function')return;
 for(const [id,p]of Object.entries(ROOM_PROFILES))p.id=id;
 $('startPortraits').innerHTML=Object.entries(ROOM_PROFILES).map(([id,p])=>'<button type="button" class="start-person start-'+id+'" data-start-identity="'+id+'" aria-label="Enter '+p.name+'’s Identity Chat">'+roomAvatar(p,'lg')+'<span>'+roomEscape(p.name)+'</span></button>').join('');
 const enter=()=>{$('startScreen').hidden=true;document.body.classList.remove('start-screen-open');$('pageTitle').setAttribute('tabindex','-1');$('pageTitle').focus();};
 $('enterRoomBtn').addEventListener('click',enter);
 $('homeBtn').addEventListener('click',()=>{$('startScreen').hidden=false;document.body.classList.add('start-screen-open');$('enterRoomBtn').focus()});
 $('startPortraits').querySelectorAll('[data-start-identity]').forEach(btn=>btn.addEventListener('click',()=>{roomView='identity-chat';profileRoute(btn.dataset.startIdentity);enter()}));
 document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{roomView=btn.dataset.view;renderRoomShell()}));
 $('dmForm').addEventListener('submit',async e=>{e.preventDefault();if(busy||!ready||!$('dmInput').value.trim())return;const draft=$('dmInput').value;$('text').value=draft;await submitMessage({preventDefault(){}});if($('text').value!==draft)$('dmInput').value=''});
 $('exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({schema:'atlas-room-view-v1',session_id:sessionId,selected_identity:selectedIdentity(),view:roomView},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='atlas-room-view.json';a.click();URL.revokeObjectURL(url)});
 $('importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.schema!=='atlas-room-view-v1'||!validCurrentSession(data.session_id)||!Object.hasOwn(IDENTITIES,data.selected_identity))throw new Error('Import a view export only; identity packages cannot be imported here.');switchSession(data.session_id,data.selected_identity);roomView=['room','identity-chat','profiles','progress'].includes(data.view)?data.view:'room';renderRoomShell()}catch(err){status(err.message)}finally{e.target.value=''}});
 if(typeof MutationObserver==='function'){const observer=new MutationObserver(syncRoomStatus);for(const id of ['status','context-status','messages'])observer.observe($(id),{childList:true,characterData:true,subtree:true});}
 roomShellSignature='';renderRoomShell();
}
