export enum ModifierKey {
  None = 'none',
  Ctrl = 'ctrl',
  Shift = 'shift',
}

export function isModifierKeyPress(event: KeyboardEvent, modifier: ModifierKey): boolean {
  switch (modifier) {
    case ModifierKey.None:
      return false
    case ModifierKey.Ctrl:
      return event.key === 'Control'
    case ModifierKey.Shift:
      return event.key === 'Shift'
  }
}
