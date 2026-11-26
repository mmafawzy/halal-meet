import type { DataExport } from '@halal-meet/core';
import { Platform, Share } from 'react-native';

export function exportFilename(data: DataExport): string {
  return `halal-meet-export-${data.exportedAt.slice(0, 10)}.json`;
}

interface WebDom {
  document: {
    createElement(tag: 'a'): { href: string; download: string; click(): void; remove(): void; style: { display: string } };
    body: { appendChild(el: unknown): void };
  };
  URL: { createObjectURL(b: unknown): string; revokeObjectURL(u: string): void };
  Blob: new (parts: string[], opts: { type: string }) => unknown;
}

/**
 * Saves the GET /me/export document: on the web it downloads a .json file; on iOS/Android it opens the
 * system share sheet (save to Files, send to yourself…). Resolves to what happened.
 */
export async function saveDataExport(data: DataExport, title: string): Promise<'downloaded' | 'shared' | 'dismissed'> {
  const json = JSON.stringify(data, null, 2);
  if (Platform.OS === 'web') {
    const w = globalThis as unknown as WebDom;
    const url = w.URL.createObjectURL(new w.Blob([json], { type: 'application/json' }));
    const a = w.document.createElement('a');
    a.href = url;
    a.download = exportFilename(data);
    a.style.display = 'none';
    w.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => w.URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }
  const res = await Share.share({ title, message: json });
  return res.action === Share.sharedAction ? 'shared' : 'dismissed';
}
