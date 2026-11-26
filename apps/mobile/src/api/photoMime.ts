/** Pure helpers shared by the live photo client and the mock (no react-native imports, so tests can load it). */
import type { PhotoUploadInput } from './types';

const EXT_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };

/** Best-effort MIME type for a picked image (the server checks the real bytes anyway). */
export function guessMime(input: Pick<PhotoUploadInput, 'uri' | 'mimeType' | 'fileName'>): string {
  if (input.mimeType && input.mimeType.startsWith('image/')) return input.mimeType;
  const dataMatch = /^data:(image\/[a-z0-9.+-]+);/i.exec(input.uri);
  if (dataMatch) return dataMatch[1]!.toLowerCase();
  const ext = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(input.fileName ?? input.uri)?.[1]?.toLowerCase();
  return (ext && EXT_MIME[ext]) || 'image/jpeg';
}
