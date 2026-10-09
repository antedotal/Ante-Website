// Read-only browser admission cannot cross owners/purposes, change the selected
// original commitment or survive expiry. No secret/provider identifier is stored.
import {expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
import {newCollectionAdmission,encodeCollectionAdmission,decodeCollectionAdmission,collectionBrowserDigest} from '../lib/server/collection-cookies'
const key=Buffer.alloc(32,3),owner='11111111-1111-4111-8111-111111111111',commitment='22222222-2222-4222-8222-222222222222'
it('exact owner and original read admission round-trip with stable browser lineage',()=>{const admission=newCollectionAdmission(owner,commitment,1),token=encodeCollectionAdmission(admission,key);expect(decodeCollectionAdmission(token,key,owner)).toEqual(admission);expect(collectionBrowserDigest(admission)).toBe(collectionBrowserDigest({...admission}));expect(Object.keys(admission)).not.toContain('operationId')})
it('foreign owner, altered ciphertext and another key deny',()=>{const admission=newCollectionAdmission(owner,commitment,1),token=encodeCollectionAdmission(admission,key);expect(()=>decodeCollectionAdmission(token,key,commitment)).toThrow();expect(()=>decodeCollectionAdmission(token,Buffer.alloc(32,4),owner)).toThrow();expect(()=>decodeCollectionAdmission(token.slice(0,-1)+'!',key,owner)).toThrow()})
it('expired and extra-authority admissions deny',()=>{const admission=newCollectionAdmission(owner,commitment,1);expect(()=>encodeCollectionAdmission({...admission,expiresAt:Date.now()-1},key)).toThrow();expect(()=>encodeCollectionAdmission({...admission,providerIntentId:'pi_replacement'} as typeof admission,key)).toThrow()})
