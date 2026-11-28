import React, { ReactNode } from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';

type ChatOptionsPopoverProps = {
  visible: boolean;
  onClose: () => void;
  topInset: number;
  children: ReactNode;
};

/** Compact anchored chat menu with a full-screen outside-tap dismiss layer. */
export function ChatOptionsPopover({ visible, onClose, topInset, children }: ChatOptionsPopoverProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0005', alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: topInset + 62, paddingHorizontal: 10 }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close chat menu" activeOpacity={1} onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        {children}
      </View>
    </Modal>
  );
}
