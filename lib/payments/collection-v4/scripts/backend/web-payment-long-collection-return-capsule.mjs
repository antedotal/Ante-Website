// GENERATED finite hold-purpose codec from accepted B0; no card-save purpose, key loader, SQL allocation, HTTP endpoint or provider effect is available.
// Server-only pure byte/MAC codec: node:crypto prevents browser reuse. It accepts
// explicit nonsecret immutable metadata and synthetic/trusted key bytes only;
// it never loads keys, reads SQL/Auth, allocates families or calls providers.
import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { internalId } from "./web-payment-contract.mjs";
import { exact } from "./web-payment-provider-contract.mjs";
export const LONG_COLLECTION_CAPSULE_FIELDS = Object.freeze([
  "family_id",
  "return_admission_id",
  "nonce_base64url",
  "owner_id",
  "original_namespace",
  "original_action",
  "begin_operation_id",
  "begin_operation_revision",
  "commitment_id",
  "provider_intent_id",
  "commitment_revision",
  "customer_id",
  "customer_provider_revision",
  "consent_id",
  "consent_revision",
  "provider_configuration_id",
  "provider_configuration_revision",
  "provider_configuration_hash",
  "collection_configuration_id",
  "collection_configuration_revision",
  "collection_configuration_hash",
  "browser_digest",
  "completion_operation_id",
  "created_at_unix_microseconds",
  "expires_at_unix_microseconds",
  "key_reference_id",
  "key_reference_revision",
]);
const domain = Buffer.from("ante:web-payment:long-collection:return-capsule:v1\0", "ascii");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Unpadded43-character encodings have spare low bits; re-encoding the actual
//32 bytes rejects aliases that the decoder alone would silently accept.
function canonical32(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, "base64url").length === 32 &&
    Buffer.from(value, "base64url").toString("base64url") === value
  );
}
function metadata(value) {
  if (
    Object.getOwnPropertySymbols(value ?? {}).length !== 0 ||
    !exact(value, LONG_COLLECTION_CAPSULE_FIELDS)
  )
    throw new TypeError("invalid_capsule_metadata");
  // SQL metadata is data-only JSON. Refuse accessors before evaluation so
  // validation cannot authorize one value and encode another value afterward.
  for (const field of LONG_COLLECTION_CAPSULE_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value"))
      throw new TypeError("invalid_capsule_metadata");
    const v = descriptor.value;
    let valid;
    if(field==="provider_intent_id")valid=typeof v==="string"&&/^pi_[A-Za-z0-9_]{1,240}$/.test(v);
    else if (field.endsWith("_id")) valid = internalId(v) && v === v.toLowerCase();
    else if (field.endsWith("_revision"))
      valid = Number.isSafeInteger(v) && v >= 1 && v <= 999999999;
    else if (field.endsWith("_hash") || field === "browser_digest")
      valid = typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
    else if (field.endsWith("_microseconds"))
      valid =
        typeof v === "string" &&
        /^[1-9][0-9]{0,18}$/.test(v) &&
        BigInt(v) <= 9223372036854775807n;
    else if (field === "nonce_base64url") valid = canonical32(v);
    else
      valid =
        v ===
        (field === "original_namespace" ? "collection_v1" : "task.long_collection.continue");
    if (!valid) throw new TypeError("invalid_capsule_metadata");
  }
  const duration =
    BigInt(value.expires_at_unix_microseconds) -
    BigInt(value.created_at_unix_microseconds);
  if (duration <= 0n || duration > 300000000n)
    throw new TypeError("invalid_capsule_metadata");
  return value;
}
// Field order is compiled, not object insertion order. PostgreSQL microseconds
// stay decimal strings, so neither Date rounding nor floating-point conversion
// changes original timestamps. All accepted values are canonical ASCII.
export function encodeLongCollectionCapsuleMetadata(value) {
  const m = metadata(value);
  return Buffer.concat([
    domain,
    ...LONG_COLLECTION_CAPSULE_FIELDS.map((field) => {
      const bytes = Buffer.from(String(m[field]), "ascii");
      return Buffer.concat([
        Buffer.from(`${bytes.length}:`, "ascii"),
        bytes,
        Buffer.from(",", "ascii"),
      ]);
    }),
  ]);
}
export function longCollectionCapsuleMetadataHash(value) {
  return hash(encodeLongCollectionCapsuleMetadata(value));
}
// Metadata validation precedes accepting any key bytes. No loader/fallback is
// present: the caller must supply the original key-reference revision's key.
export function createLongCollectionCapsule(value, key) {
  const message = encodeLongCollectionCapsuleMetadata(value);
  if (!(key instanceof Uint8Array)) throw new TypeError("invalid_capsule_key");
  // Count the copied actual bytes, not a caller-shadowed byteLength property.
  const keyBytes = Buffer.from(key);
  if (keyBytes.length !== 32) throw new TypeError("invalid_capsule_key");
  const mac = createHmac("sha256", keyBytes)
    .update(message)
    .digest("base64url");
  const token = `alc1.${value.nonce_base64url}.${mac}`;
  return {
    token,
    token_digest: hash(Buffer.from(token, "ascii")),
    metadata_hash: hash(message),
  };
}
// Parsing and digesting identify a capsule's exact bytes only; they establish
// no owner/context/provider authority and never allocate or consume SQL state.
export function parseLongCollectionCapsule(token) {
  if (
    typeof token !== "string" ||
    token.length !== 92 ||
    !/^alc1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)
  )
    throw new TypeError("invalid_return_capsule");
  const [, nonce, mac] = token.split(".");
  if (!canonical32(nonce) || !canonical32(mac))
    throw new TypeError("invalid_return_capsule");
  return { nonce_base64url: nonce, mac_base64url: mac };
}
export function longCollectionCapsuleDigest(token) {
  parseLongCollectionCapsule(token);
  return hash(Buffer.from(token, "ascii"));
}
// Both encodings have fixed92-byte length; compare nonce and MAC together in
// constant time. Authentication remains separate from owner/family SQL gates.
export function verifyLongCollectionCapsule(value, key, token) {
  parseLongCollectionCapsule(token);
  const expected = createLongCollectionCapsule(value, key);
  return timingSafeEqual(
    Buffer.from(expected.token, "ascii"),
    Buffer.from(token, "ascii"),
  );
}
