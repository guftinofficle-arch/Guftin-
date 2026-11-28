import React from 'react';
import { Text, TouchableOpacity, ViewStyle } from 'react-native';

export type CallControlButtonProps = {
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
};

/** Shared call control presentation. Call state and handlers remain owned by CallRoomScreen. */
export function CallControlButton({ label, onPress, active = false, danger = false, disabled = false }: CallControlButtonProps) {
  const style: ViewStyle = {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 70,
    minHeight: 76,
    paddingHorizontal: 7,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 40,
    backgroundColor: danger ? '#e90055' : active ? '#30108a' : '#111b58',
    borderWidth: 1.5,
    borderColor: danger ? '#ff4c9a' : active ? '#c52bff' : '#278cff',
    shadowColor: danger ? '#ff176f' : '#7b36ff',
    shadowOpacity: 0.45,
    shadowRadius: 13,
    elevation: 8,
    opacity: disabled ? 0.45 : 1,
  };
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} activeOpacity={0.82} style={style}>
      <Text numberOfLines={2} style={{ color: '#fff', fontSize: 11, fontWeight: '900', textAlign: 'center' }}>{label}</Text>
    </TouchableOpacity>
  );
}
