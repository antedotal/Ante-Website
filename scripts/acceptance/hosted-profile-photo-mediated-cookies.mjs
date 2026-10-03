// Private, origin-pinned HTTP jars. These helpers never initialize an Auth client or perform I/O.
import { createChunks, combineChunks, stringToBase64URL, stringFromBase64URL } from '@supabase/ssr';

export const SESSION_COOKIE='sb-yxilmwxptfnebnjsikwo-auth-token';
const jars=new WeakMap();
const need=(ok)=>{if(!ok)throw Error('cookie_boundary');};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function pinned(origin){const u=new URL(origin);need(u.protocol==='https:'&&u.origin===origin);return u;}
function data(jar,origin){const value=jars.get(jar);need(value&&(!origin||value.origin===origin));return value;}
function validSession(s){
  need(s&&typeof s==='object'&&!Array.isArray(s)&&typeof s.access_token==='string'&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s.access_token)&&s.access_token.length<=8192);
  need(typeof s.refresh_token==='string'&&s.refresh_token.length>0&&s.refresh_token.length<=8192&&s.token_type==='bearer'&&Number.isSafeInteger(s.expires_at)&&Number.isFinite(s.expires_in)&&s.expires_in>0&&uuid.test(s.user?.id));
  return s;
}
// Reject mixed unchunked/chunked cookies, gaps, aliases and excessive session documents.
function encoded(entries){
  const names=[...entries.keys()];if(!names.length)return null;
  need(names.length<=64);
  if(entries.has(SESSION_COOKIE)){need(names.length===1);return entries.get(SESSION_COOKIE).value;}
  need(names.every(name=>name.startsWith(`${SESSION_COOKIE}.`)&&/^(0|[1-9][0-9]*)$/.test(name.slice(SESSION_COOKIE.length+1))));
  let value='';for(let i=0;i<names.length;i++){const part=entries.get(`${SESSION_COOKIE}.${i}`);need(part);value+=part.value;}
  return value;
}
function decode(value){
  need(typeof value==='string'&&value.length<=131072&&/^base64-[A-Za-z0-9_-]+$/.test(value));
  try{const json=stringFromBase64URL(value.slice(7));need(stringToBase64URL(json)===value.slice(7));return validSession(JSON.parse(json));}catch{throw Error('cookie_boundary');}
}
function live(entries){return new Map([...entries].filter(([,c])=>c.expiresAt>Date.now()));}

/** Serialize the complete provider session; induced expiry changes only its client expiry field. */
export function sessionCookies(session,origin,{forceRefresh=false}={}){
  pinned(origin);need(typeof forceRefresh==='boolean');const copy=structuredClone(validSession(session));
  if(forceRefresh)copy.expires_at=Math.floor(Date.now()/1000)-60;
  const value=`base64-${stringToBase64URL(JSON.stringify(copy))}`;decode(value);
  const jar=Object.freeze({});jars.set(jar,{origin,entries:new Map(createChunks(SESSION_COOKIE,value).map(({name,value})=>[name,{value,expiresAt:Infinity}]))});return jar;
}

/** Parse independent Set-Cookie fields atomically; never split an Expires date on commas. */
export function applyResponseCookies(jar,headers,origin){
  const current=data(jar,origin),url=pinned(origin);need(typeof headers.getSetCookie==='function');
  const entries=live(current.entries),seen=new Set();
  for(const field of headers.getSetCookie()){
    need(field.length<=16384&&!/[\r\n]/.test(field));const [pair,...parts]=field.split(';');const equal=pair.indexOf('=');need(equal>0);
    const name=pair.slice(0,equal).trim(),value=pair.slice(equal+1).trim();need(name===SESSION_COOKIE||new RegExp(`^${SESSION_COOKIE}\\.(0|[1-9][0-9]*)$`).test(name));need(!seen.has(name));seen.add(name);
    need(value===''||/^[A-Za-z0-9_-]+$/.test(value));
    const attrs=new Map();for(const part of parts){const i=part.indexOf('=');const key=(i<0?part:part.slice(0,i)).trim().toLowerCase(),v=i<0?null:part.slice(i+1).trim();need(!attrs.has(key)&&['path','secure','samesite','max-age','expires','domain','httponly'].includes(key));attrs.set(key,v);}
    need(attrs.get('path')==='/'&&attrs.has('secure')&&attrs.get('secure')===null&&attrs.get('samesite')?.toLowerCase()==='lax');
    need(!attrs.has('domain')||attrs.get('domain')?.toLowerCase()===url.hostname);need(!attrs.has('httponly')||attrs.get('httponly')===null);
    let expiresAt=Infinity;if(attrs.has('expires')){expiresAt=Date.parse(attrs.get('expires'));need(Number.isFinite(expiresAt));}
    if(attrs.has('max-age')){const age=attrs.get('max-age');need(/^-?(0|[1-9][0-9]*)$/.test(age)&&Number.isSafeInteger(Number(age)));expiresAt=Date.now()+Number(age)*1000;}
    if(expiresAt<=Date.now()){entries.delete(name);}else{need(value.length>0);entries.set(name,{value,expiresAt});}
  }
  const value=encoded(entries);if(value!==null)decode(value);current.entries=entries;
}

/** Only the exact pinned HTTPS origin can receive this jar; expired parts fail closed. */
export function cookieHeader(jar,origin){pinned(origin);const entries=live(data(jar,origin).entries),value=encoded(entries);if(value!==null)decode(value);return [...entries].map(([name,c])=>`${name}=${c.value}`).join('; ');}

/** Use installed SSR's recombination API as well as strict contiguous-chunk validation. */
export async function sessionFromCookies(jar){const entries=live(data(jar).entries);const expected=encoded(entries);need(expected!==null);const value=await combineChunks(SESSION_COOKIE,name=>entries.get(name)?.value);need(value===expected);return decode(value);}
