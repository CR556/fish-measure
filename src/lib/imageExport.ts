import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { Catch } from '../db/types';
import { resolveCatchUri } from './files';

/** Shares the untouched catch photo. */
export async function sharePlainPhoto(item: Catch): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(resolveCatchUri(item.photoPath), { mimeType: 'image/jpeg' });
}

/**
 * Captures an off-screen ExportCard view to a JPEG and shares it. The ref
 * must point at a mounted (off-screen) ExportCard for the desired variant.
 */
export async function shareRenderedCard(viewRef: RefObject<View | null>): Promise<void> {
  if (!viewRef.current) return;
  const uri = await captureRef(viewRef, {
    format: 'jpg',
    quality: 0.95,
    result: 'tmpfile',
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
  }
}
