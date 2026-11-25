import { Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

/** Save a received image/video to the device gallery after explicit OS permission. */
export async function saveMediaToGallery(item: any, showFeedback = true): Promise<void> {
  if (!item?.attachment_url || !['image', 'video'].includes(item.message_type)) return;
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) throw new Error('Allow photo library permission to save this media.');
    await MediaLibrary.saveToLibraryAsync(item.attachment_url);
    if (showFeedback) Alert.alert('Saved to gallery', 'The photo/video was saved to your device gallery.');
  } catch (error: any) {
    if (showFeedback) Alert.alert('Could not save media', error?.message || 'Try again after allowing gallery permission.');
  }
}
