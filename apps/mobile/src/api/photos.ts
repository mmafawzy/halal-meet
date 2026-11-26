/**
 * Photos & photo privacy client (`PHOTO_ROUTES` in @halal-meet/core). `live.ts` spreads
 * `createLivePhotoApi(call)` into the HTTP client; the mock lives in `mock/photos.ts`.
 *
 * Photo URLs from the server are absolute and signed for the viewer, so `<Image source={{ uri }}>` works
 * on every platform without an Authorization header.
 */
import type { IncomingPhotoRequest, Photo, PHOTO_ROUTES, PhotoAccessView } from '@halal-meet/core';

import { guessMime } from './photoMime';
import type { HalalMeetApi, PhotoUploadInput } from './types';

export { guessMime };

export type PhotoRouteKey = keyof typeof PHOTO_ROUTES;

export type PhotoCall = <T>(
  route: PhotoRouteKey,
  opts?: { params?: Record<string, string>; body?: unknown; form?: FormData },
) => Promise<T>;

export type PhotoApi = Pick<
  HalalMeetApi,
  'myPhotos' | 'uploadPhoto' | 'deletePhoto' | 'reorderPhotos' | 'requestPhotoAccess' | 'photoAccess' | 'incomingPhotoRequests' | 'decidePhotoRequest'
>;

/** multipart/form-data body with a `file` part (web: the picked blob; native: the file URI). */
export async function photoFormData(input: PhotoUploadInput): Promise<FormData> {
  const type = guessMime(input);
  const name = input.fileName || `photo.${type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1]}`;
  const form = new FormData();
  // No react-native import here, so live.ts stays loadable in node tests: the web build has a DOM.
  const isWeb = typeof document !== 'undefined' && typeof navigator !== 'undefined' && navigator.product !== 'ReactNative';
  if (isWeb) {
    const blob = await (await fetch(input.uri)).blob();
    form.append('file', blob, name);
  } else {
    // React Native's FormData streams the file from its URI.
    form.append('file', { uri: input.uri, name, type } as unknown as Blob);
  }
  if (input.position !== undefined) form.append('position', String(input.position));
  return form;
}

function unwrap<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)[key])) return (data as Record<string, T[]>)[key]!;
  return [];
}

export function createLivePhotoApi(call: PhotoCall): PhotoApi {
  return {
    myPhotos: async () => unwrap<Photo>(await call('myPhotos'), 'photos'),
    uploadPhoto: async (input) => call<Photo>('uploadPhoto', { form: await photoFormData(input) }),
    deletePhoto: async (id) => {
      await call('deletePhoto', { params: { id } });
    },
    reorderPhotos: async (ids) => unwrap<Photo>(await call('reorderPhotos', { body: { ids } }), 'photos'),
    requestPhotoAccess: (ownerId) => call<PhotoAccessView>('requestPhotoAccess', { body: { ownerId } }),
    photoAccess: (ownerId) => call<PhotoAccessView>('photoAccess', { params: { ownerId } }),
    incomingPhotoRequests: async () => unwrap<IncomingPhotoRequest>(await call('incomingPhotoRequests'), 'requests'),
    decidePhotoRequest: async (id, decision) => {
      await call('decidePhotoRequest', { params: { id }, body: { decision } });
    },
  };
}
