/** Save a blob as a file download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Share a file with the OS share sheet when supported. Returns false if not. */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  if (typeof navigator.canShare !== "function" || !navigator.canShare({ files: [file] }))
    return false;
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (err) {
    // The user closing the share sheet is not an error.
    if (err instanceof DOMException && err.name === "AbortError") return true;
    return false;
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** "2026-11-19" style stamp for file names, in a time zone. */
export function fileStamp(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
