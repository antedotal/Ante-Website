// Fixed commitment/revision API paths scope host-only Secure cookies. The
// accepted AEAD/capsule codecs and SQL family identities remain unchanged. An
// old HTTP response writes only its own path, never another selection's cookie.
import 'server-only'
import {NextResponse} from 'next/server'
import {paymentId} from '../payments/bridge-v1/supabase/functions/_shared/webPaymentHttpIntake'
import {singlePaymentCookie} from './payment-cookies'
import {collectionAdmissionCookie,collectionCapsuleCookie,decodeCollectionAdmission,installCollectionAdmission,installCollectionCapsule,type CollectionAdmission} from './collection-cookies'
import type {NextRequest} from 'next/server'
export type CollectionScope={commitmentId:string;revision:number;action:string;path:string}
export const scopedCollectionReadCookie='__Secure-ante-long-collection-read-v2',scopedCollectionReturnCookie='__Secure-ante-long-collection-return-v2'
// A canonical lower-case UUID/revision selects only a fixed read namespace; no
// RPC, provider operation, original effect or redirect can be supplied in a path.
export function collectionScope(path:string):CollectionScope|null{if(!path.startsWith('by-commitment/'))return null;const parts=path.split('/'),revision=Number(parts[2]);if(parts.length<4||!paymentId(parts[1])||parts[1]!==parts[1].toLowerCase()||!Number.isInteger(revision)||revision<1||revision>2147483647||String(revision)!==parts[2])throw Error('invalid_input');return {commitmentId:parts[1],revision,action:parts.slice(3).join('/'),path:'/api/account/collections/by-commitment/'+parts[1]+'/'+parts[2]+'/'}}
// Reuse a matching legacy original root when first visiting its scoped route.
// A different legacy commitment is ignored, retained verbatim for its recovery.
export function selectedCollectionAdmission(request:NextRequest,key:Buffer,owner:string,scope:CollectionScope|null){if(!scope)return decodeCollectionAdmission(singlePaymentCookie(request,collectionAdmissionCookie),key,owner);const scoped=singlePaymentCookie(request,scopedCollectionReadCookie);if(scoped!==null){if(scoped==='')throw Error('browser_lineage_required');const current=decodeCollectionAdmission(scoped,key,owner);if(current&&(current.commitmentId!==scope.commitmentId||current.commitmentRevision!==scope.revision))throw Error('browser_lineage_required');return current}const legacy=decodeCollectionAdmission(singlePaymentCookie(request,collectionAdmissionCookie),key,owner);return legacy?.commitmentId===scope.commitmentId&&legacy.commitmentRevision===scope.revision?legacy:null}
export function selectedCollectionCapsule(request:NextRequest,key:Buffer,owner:string,scope:CollectionScope|null){if(!scope)return singlePaymentCookie(request,collectionCapsuleCookie);const scoped=singlePaymentCookie(request,scopedCollectionReturnCookie);if(scoped!==null){if(scoped==='')throw Error('browser_lineage_required');return scoped;}const legacy=decodeCollectionAdmission(singlePaymentCookie(request,collectionAdmissionCookie),key,owner);return legacy?.commitmentId===scope.commitmentId&&legacy.commitmentRevision===scope.revision?singlePaymentCookie(request,collectionCapsuleCookie):null}
// The original installer owns codec validation and expiry. Rename/path changes
// are the only delta; Domain is never set, so the browser retains host-only scope.
function copyScopedCookie(response:NextResponse,sink:NextResponse,original:string,name:string,path:string){const cookie=sink.cookies.get(original);if(!cookie)throw Error('browser_lineage_required');response.cookies.set({...cookie,name,path})}
export function installSelectedCollectionAdmission(response:NextResponse,value:CollectionAdmission,key:Buffer,scope:CollectionScope|null){if(!scope)return installCollectionAdmission(response,value,key);const sink=NextResponse.json({});installCollectionAdmission(sink,value,key);copyScopedCookie(response,sink,collectionAdmissionCookie,scopedCollectionReadCookie,scope.path)}
export function installSelectedCollectionCapsule(response:NextResponse,token:string,expiry:string,scope:CollectionScope|null){if(!scope)return installCollectionCapsule(response,token,expiry);const sink=NextResponse.json({});installCollectionCapsule(sink,token,expiry);copyScopedCookie(response,sink,collectionCapsuleCookie,scopedCollectionReturnCookie,scope.path)}
