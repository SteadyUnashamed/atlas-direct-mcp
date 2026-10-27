import {createRemoteJWKSet,jwtVerify} from 'jose';

export const ISSUER='https://dev-lx2ta0smn81gpeib.us.auth0.com/';
export const RESOURCE='https://atlas-direct-mcp.onrender.com';
export const METADATA=RESOURCE+'/.well-known/oauth-protected-resource';
export const SCOPE='atlas:read';
export const WRITE_SCOPE='atlas:write';
const remoteKeys=createRemoteJWKSet(new URL('.well-known/jwks.json',ISSUER));

export async function verifyDiagnosticToken(token,keys=remoteKeys){
 if(!token||typeof token!=='string')throw new Error('Missing bearer token');
 const {payload}=await jwtVerify(token,keys,{issuer:ISSUER,audience:RESOURCE,algorithms:['RS256'],requiredClaims:['iss','aud','exp','sub']});
 if(typeof payload.sub!=='string'||!payload.sub.trim())throw new Error('Invalid token subject');
 const scopes=typeof payload.scope==='string'?payload.scope.split(/\s+/):[];
 if(!scopes.includes(SCOPE))throw new Error('Missing required scope');
 return {authenticated:true};
}
export async function verifyAppendToken(token,keys=remoteKeys){
 if(!token||typeof token!=='string')throw new Error('Missing bearer token');
 const {payload}=await jwtVerify(token,keys,{issuer:ISSUER,audience:RESOURCE,algorithms:['RS256'],requiredClaims:['iss','aud','exp','sub','azp']});
 if(typeof payload.sub!=='string'||!payload.sub.trim()||payload.azp!=='UgCVpv7vqNdxej2v3d5xGdnihjrTnNSV')throw new Error('Invalid authorization');
 if(typeof payload.scope!=='string'||!payload.scope.split(/\s+/).includes(WRITE_SCOPE)){const err=new Error('Write permission is required');err.code='insufficient_scope';throw err;}
 return {authenticated:true};
}

export function challenge(id,modern=false){
 const header=`Bearer resource_metadata="${METADATA}", error="invalid_token", error_description="Authentication required"`;
 return new Response(JSON.stringify({jsonrpc:'2.0',id,result:{...(modern?{resultType:'complete'}:{}),isError:true,content:[{type:'text',text:'Authentication required.'}],_meta:{'mcp/www_authenticate':[header]}}}),{status:200,headers:{'Content-Type':'application/json','WWW-Authenticate':header,'Cache-Control':'no-store'}});
}
export function isolatedWriteChallenge(id,modern=false,error){
 const code=error?.code==='insufficient_scope'?'insufficient_scope':'invalid_token';
 const fields=[`Bearer resource_metadata="${METADATA}"`,`scope="${WRITE_SCOPE}"`,`error="${code}"`,`error_description="Atlas write authorization is required"`];
 const header=fields.join(', ');
 return new Response(JSON.stringify({jsonrpc:'2.0',id,result:{...(modern?{resultType:'complete'}:{}),isError:true,content:[{type:'text',text:'Atlas write authorization is required.'}],_meta:{'mcp/www_authenticate':[header]}}}),{status:200,headers:{'Content-Type':'application/json','WWW-Authenticate':header,'Cache-Control':'no-store'}});
}
