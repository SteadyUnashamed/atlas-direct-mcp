import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const profiles=JSON.parse(readFileSync(resolve(root,'ui/room-profiles.json'),'utf8'));
const assetData=path=>'/'+path;
for(const p of Object.values(profiles))for(const [key,value]of Object.entries(p.visual||{}))if(value.startsWith('assets/'))p.visual[key]=assetData(value);
let styles=readFileSync(resolve(root,'ui/room-style.css'),'utf8')+'\n'+readFileSync(resolve(root,'ui/room-bridge.css'),'utf8');
const cssAssets=new Map();styles=styles.replace(/url\("(assets\/[^\"]+)"\)/g,(_,path)=>{if(!cssAssets.has(path))cssAssets.set(path,'--room-art-'+cssAssets.size);return 'var('+cssAssets.get(path)+')'});
styles=':root{'+[...cssAssets].map(([path,key])=>key+':url("'+assetData(path)+'");').join('')+'}\n'+styles;
// Reuse byte-identical images without recompressing or changing the original artwork.
const images=[];for(const p of Object.values(profiles))for(const [key,value]of Object.entries(p.visual||{})){if(value.startsWith('data:')){let i=images.indexOf(value);if(i<0){i=images.length;images.push(value)}p.visual[key]={image_index:i}}}
const profileScript='const ROOM_IMAGES='+JSON.stringify(images)+';\nconst ROOM_PROFILES='+JSON.stringify(profiles)+';\nfor(const p of Object.values(ROOM_PROFILES))for(const [k,v]of Object.entries(p.visual||{}))if(v&&typeof v==="object"&&"image_index"in v)p.visual[k]=ROOM_IMAGES[v.image_index];\n';
const presentationScript='const PRESENTATION_PROFILES='+JSON.stringify(JSON.parse(readFileSync(resolve(root,'ui/presentation-profiles.json'),'utf8')))+';\n';
const workerSource=readFileSync(resolve(root,'server.mjs'),'utf8');
const resourceUri=workerSource.match(/const ROOM_URI='([^']+)'/)[1];
const registrationScript='const ROOM_RESOURCE_REGISTRATION='+JSON.stringify({resource_uri:resourceUri,mime_type:'text/html;profile=mcp-app',tool:'render_atlas_room',tool_resource_reference:resourceUri,output_template:resourceUri,display_modes:['inline','fullscreen'],preferred_display_mode:'fullscreen',connect_domains:[],resource_domains:[],frontend:'Shared Atlas Room frontend: room-shell.html, room-controller.js, bridge-client.js. resource renderPage(true); standalone renderPage(false).'})+';\n';
const script=profileScript+presentationScript+registrationScript+readFileSync(resolve(root,'ui/room-controller.js'),'utf8')+'\n'+readFileSync(resolve(root,'ui/bridge-client.js'),'utf8');
const html=readFileSync(resolve(root,'ui/room-shell.html'),'utf8').replace('__ROOM_STYLES__',styles)+'<script>'+script+'</script></body></html>';
writeFileSync(resolve(root,'ui/room-page.js'),'export const PAGE = '+JSON.stringify(html)+';\n');
if(!process.argv.includes('--module-only')){mkdirSync(resolve(root,'dist/server'),{recursive:true});const server=readFileSync(resolve(root,'server.mjs'),'utf8').replace("import { PAGE } from '../ui/room-page.js';",'const PAGE = '+JSON.stringify(html)+';');writeFileSync(resolve(root,'dist/server/index.js'),server);}
console.log('Atlas Room UI assembled with original visual assets');
