// Frozen, fixed-purpose HTTP acceptance vocabulary. No descriptor accepts a caller URL or header map.
/** @typedef {'A'|'B'|'C'|'N'} Actor */
/** @typedef {'absence'|'G1'|'G2'} KeyLabel */
/** @typedef {'object'|'authenticated'|'public'|'render-auth'|'render-public'|'sign'|'list'} ViewId */
/** @typedef {{readonly id:ViewId, readonly method:'GET'|'POST', readonly path:'object'|'object/authenticated'|'object/public'|'render/image/authenticated'|'render/image/public'|'object/sign'|'object/list', readonly body:null|'sign-60'|'owner-list'}} DirectView */
/** @typedef {{readonly keyLabel:KeyLabel,readonly actor:Actor,readonly view:ViewId}} DirectDescriptor */
/** @typedef {{readonly id:number,readonly actor:Actor,readonly expected:'G1'|'G2'|401|404,readonly condition:string,readonly requestHeader:null|'range'|'if-none-match'|'if-modified-since'|'expired-session'}} PhotoCase */
/** @typedef {{readonly kind:'photo',readonly caseId:number}|{readonly kind:'directMatrix',readonly matrixId:number,readonly keyLabel:KeyLabel,readonly actor:Actor,readonly view:ViewId}|{readonly kind:'authProbe'|'preparation'|'dataClear'}|{readonly kind:'cli'|'dataBoundary',readonly slot:number}|{readonly kind:'authCreate'|'authLogin'|'authDelete',readonly label:'A'|'B'|'C'}|{readonly kind:'authGetUser',readonly label:'A'|'B'|'C',readonly slot:1|2}|{readonly kind:'dataOperation',readonly label:'G1'|'G2',readonly slot:1|2|3|4}|{readonly kind:'dataExposure',readonly label:KeyLabel,readonly actor:Actor}|{readonly kind:'storageUpload'|'storageReadback'|'storageWarm'|'storageOwnership'|'storageDelete'|'storageAbsence',readonly label:'G1'|'G2'}} DispatchDescriptor */

export const RUN_CAPS=Object.freeze({directAuth:11,directData:25,directStorage:314,preparation:1,website:24,workerAuth:624,workerData:120,workerStorage:24,cli:41});
export const CLEANUP_CAPS=Object.freeze({directAuth:3,directStorage:6,cli:20});

// Path suffixes are assembled by the transport from journal-bound keys only.
export const DIRECT_VIEWS=Object.freeze([
  {id:'object',method:'GET',path:'object',body:null},
  {id:'authenticated',method:'GET',path:'object/authenticated',body:null},
  {id:'public',method:'GET',path:'object/public',body:null},
  {id:'render-auth',method:'GET',path:'render/image/authenticated',body:null},
  {id:'render-public',method:'GET',path:'render/image/public',body:null},
  {id:'sign',method:'POST',path:'object/sign',body:'sign-60'},
  {id:'list',method:'POST',path:'object/list',body:'owner-list'},
].map(Object.freeze));

// One absence matrix, two publication/warm matrices, then four paired G1/G2 replays.
export const MATRIX_KEYS=Object.freeze(['absence','G1','G2','G1','G2','G1','G2','G1','G2','G1','G2']);

const rows=[
  ['A','G1','g1-published'],['A','G1','g1-published'],['B','G1','g1-published'],['B','G1','g1-published'],['C',404,'g1-published'],['N',401,'g1-published'],
  ['A','G1','g1-published','range'],['A','G1','g1-published','if-none-match'],['A','G1','g1-published','if-modified-since'],['A','G1','g1-published','expired-session'],
  ['A','G1','g2-prepared'],['B','G1','g2-prepared'],
  ['A','G2','g2-published'],['B','G2','g2-published'],['C',404,'g2-published'],['N',401,'g2-published'],
  ['B',404,'friend-rejected'],['B',404,'friend-rejected'],['A','G2','friend-rejected'],['B','G2','friend-restored'],
  ['A',404,'cleared'],['B',404,'cleared'],['C',404,'cleared'],['N',401,'cleared'],
];
export const PHOTO_CASES=Object.freeze(rows.map(([actor,expected,condition,requestHeader],i)=>Object.freeze({id:i+1,actor,expected,condition,requestHeader:requestHeader??null})));

/** Return the 28 fixed actor/view requests for one journal-bound key. */
export function directMatrix(keyLabel){
  if(!['absence','G1','G2'].includes(keyLabel))throw Error('matrix_key');
  return Object.freeze(['A','B','C','N'].flatMap(actor=>DIRECT_VIEWS.map(({id})=>Object.freeze({keyLabel,actor,view:id}))));
}

/** Reserve all possible Worker subrequests before this one website dispatch. */
export function photoEnvelope(caseId){
  if(!Number.isInteger(caseId)||caseId<1||caseId>PHOTO_CASES.length)throw Error('photo_case');
  return Object.freeze({website:1,workerAuth:26,workerData:5,workerStorage:1});
}
