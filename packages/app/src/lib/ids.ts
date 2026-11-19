/** Short random id, safe for keys and file names. */
export function newId(prefix = ""): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
  return prefix ? `${prefix}_${id}` : id;
}
