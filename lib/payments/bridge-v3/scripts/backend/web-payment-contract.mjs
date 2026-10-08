// Canonical PostgreSQL jsonb request representation binds owner/action and every explicit precondition.
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
export const internalId = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
// Provider text is case-sensitive opaque identity, never an internal selector or ownership proof.
export const providerId = value => typeof value==='string' && Buffer.byteLength(value)>=1 && Buffer.byteLength(value)<=256 && !/[\u0000-\u001f\u007f]/.test(value);
export function canonicalRequest(value) {
 if(value===null || typeof value==='boolean' || typeof value==='number' || typeof value==='string')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalRequest).join(', ')+']';
 if(!value || Object.getPrototypeOf(value)!==Object.prototype)throw new TypeError('plain JSON required');
 return '{'+Object.keys(value).sort((a,b)=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k=>JSON.stringify(k)+': '+canonicalRequest(value[k])).join(', ')+'}';
}
export const paymentRequestHash = value => createHash('sha256').update(canonicalRequest(value)).digest('hex');
// Operation revision belongs to persisted progress, never inferred from resource revision.
export function validOperationRevision(value) {
 return value && internalId(value.operation_id) && Number.isSafeInteger(value.operation_revision) && value.operation_revision>=1;
}
