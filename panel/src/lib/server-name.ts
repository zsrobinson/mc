/** Lowercase letters, digits and single inner hyphens; starts with a letter. */
const NAME = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9]))*$/;
const RESERVED = new Set(["home"]);
export const MAX_NAME_LENGTH = 24;

export function serverNameError(name: string, taken: string[] = []) {
  if (!name) return "Enter a name";
  if (name.length > MAX_NAME_LENGTH)
    return `${MAX_NAME_LENGTH} characters at most`;
  if (!NAME.test(name))
    return "Start with a letter; use lowercase letters, digits and single hyphens, not at the end";
  if (RESERVED.has(name)) return "This name is reserved";
  if (taken.includes(name)) return "A server with this name exists";
  return null;
}
