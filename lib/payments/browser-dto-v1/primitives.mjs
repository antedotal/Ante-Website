// Literal pure accepted DTO primitives, with no server hash/provider capability.
export const internalId = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function exact(value, keys) {
  return !!value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}
