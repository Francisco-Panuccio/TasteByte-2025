export function b64ToBlob(b64: string, mime = 'image/jpeg'): Blob {
  const pure = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(pure);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}