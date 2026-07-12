import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Catch } from '../../db/types';
import { sharePlainPhoto, shareRenderedCard } from '../../lib/imageExport';
import { ExportCard, type ExportVariant } from './ExportCard';

type Option = { key: 'photo' | ExportVariant; label: string };

const OPTIONS: Option[] = [
  { key: 'photo', label: 'Just the photo' },
  { key: 'length', label: 'Photo + length' },
  { key: 'lengthWeight', label: 'Photo + length & weight' },
  { key: 'card', label: 'Share card (photo + all info)' },
];

type Props = {
  item: Catch;
  visible: boolean;
  onClose: () => void;
};

/**
 * Bottom-sheet of the four image exports. The chosen ExportCard variant is
 * mounted off-screen, captured with view-shot, then handed to the share
 * sheet. 'photo' shares the raw file with no render.
 */
export function ShareSheet({ item, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const cardRef = useRef<RNView>(null);
  const [renderVariant, setRenderVariant] = useState<ExportVariant | null>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (key: Option['key']) => {
    if (busy) return;
    setBusy(true);
    try {
      if (key === 'photo') {
        await sharePlainPhoto(item);
      } else {
        // Mount the off-screen card, let it lay out + load the image, capture.
        setRenderVariant(key);
        await new Promise((r) => setTimeout(r, 350));
        await shareRenderedCard(cardRef);
        setRenderVariant(null);
      }
      onClose();
    } catch {
      // Swallow; the user can retry. (Share cancel also lands here.)
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>Share catch</Text>
        {OPTIONS.map((opt) => (
          <Pressable key={opt.key} style={styles.option} onPress={() => onPick(opt.key)} disabled={busy}>
            <Text style={styles.optionText}>{opt.label}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.cancel} onPress={onClose} disabled={busy}>
          <Text style={styles.cancelText}>{busy ? 'Preparing…' : 'Cancel'}</Text>
        </Pressable>
      </View>

      {/* Off-screen render target for view-shot. */}
      {renderVariant ? (
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={cardRef} collapsable={false}>
            <ExportCard item={item} variant={renderVariant} />
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 12,
  },
  option: {
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  optionText: { color: '#0a84ff', fontSize: 17, textAlign: 'center' },
  cancel: { marginTop: 10, paddingVertical: 15, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12 },
  cancelText: { color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  offscreen: { position: 'absolute', left: -2000, top: 0 },
});
