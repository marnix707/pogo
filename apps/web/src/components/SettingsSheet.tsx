import { updateSettings, useSettings } from '../lib/settings';
import { DisplayModeNote, InstallCard } from './InstallCard';
import { Button, Sheet, Toggle } from './ui';

export function SettingsSheet({
  open,
  onClose,
  nickname,
  onSignOut,
  roomCode,
}: {
  open: boolean;
  onClose: () => void;
  nickname: string;
  onSignOut: () => void;
  /** Set while in a room, so the code can be read (and shared) from here. */
  roomCode?: string;
}) {
  const settings = useSettings();
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-2">
        {roomCode && (
          <div className="flex items-center justify-between py-2" data-testid="settings-room-code">
            <span className="label text-muted">Room</span>
            <span className="text-lg font-bold tracking-[0.2em]">{roomCode}</span>
          </div>
        )}
        <Toggle
          label="Sound effects"
          checked={settings.sound}
          onChange={(sound) => updateSettings({ sound })}
        />
        <Toggle
          label="Vibration"
          checked={settings.vibration}
          onChange={(vibration) => updateSettings({ vibration })}
        />
        <Toggle
          label="CRT effect"
          hint="Scanlines and a dark screen edge"
          checked={settings.crt}
          onChange={(crt) => updateSettings({ crt })}
        />
        <InstallCard variant="settings" />
        <DisplayModeNote />
        <Button variant="secondary" onClick={onSignOut}>
          Not {nickname}? Switch player
        </Button>
      </div>
    </Sheet>
  );
}
