import * as ImagePicker from 'expo-image-picker';

import type { PhotoUploadInput } from '@/api';

/**
 * Opens the photo library (3:4 crop). Returns the picked image, `'denied'` when permission is refused,
 * or null when cancelled. On the web the URI is a data:/blob: URI that the upload reads as a Blob.
 */
export async function pickPhoto(): Promise<PhotoUploadInput | 'denied' | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  return { uri: asset.uri, mimeType: asset.mimeType ?? null, fileName: asset.fileName ?? null };
}
