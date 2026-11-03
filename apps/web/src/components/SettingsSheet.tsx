import { openAdminPanel } from '../lib/session';
import { updateSettings, useSettings } from '../lib/settings';
import { DisplayModeNote, InstallCard } from './InstallCard';
import { Button, Sheet, Toggle } from './ui';

export function SettingsSheet({
  open,
  onClose,
  nickname,
  onSignOut,
  roomCode,
  isDev,
  onLeave,
}: {
  open: boolean;
  onClose: () => void;
  nickname: string;
  onSignOut: () => void;
  /** Set while in a room, so the code can be read (and shared) from here. */
  roomCode?: string;
  /** Developers get a shortcut to the admin panel. */
  isDev?: boolean;
  /** In a lobby: leave the room (the lobby has no back arrow any more). */
  onLeave?: () => void;
}) {
  const settings = useSettings();
  return (
    <Sheet open={open} onClose={onClose} title="Settings" from="top" dim={false} titleClass="mt-3">
      <div className="flex flex-col gap-2 pt-3">
        {roomCode && (
          <div className="flex items-center justify-between py-2" data-testid="settings-room-code">
            <span className="label text-muted">Room</span>
            <span className="text-lg font-bold tracking-[0.2em]">{roomCode}</span>
          </div>
        )}
        {onLeave && (
          <Button variant="danger" onClick={onLeave} data-testid="settings-leave">
            Leave lobby
          </Button>
        )}
        <VolumeSlider
          label="Sound effects"
          testId="sound-slider"
          value={settings.sound}
          onChange={(sound) => updateSettings({ sound })}
        />
        <VolumeSlider
          label="Music"
          testId="music-slider"
          value={settings.music}
          onChange={(music) => updateSettings({ music })}
        />
        <Toggle
          label="Vibration"
          checked={settings.vibration}
          onChange={(vibration) => updateSettings({ vibration })}
        />
        <label className="flex flex-col gap-2 py-2">
          <span className="flex items-center justify-between font-semibold">
            CRT effect
            <span data-testid="crt-value" className="tabular-nums">
              {settings.crt === 0 ? 'Off' : `${settings.crt}%`}
            </span>
          </span>
          <span className="block text-sm font-normal text-muted">
            Scanlines and a dark screen edge
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.crt}
            data-testid="crt-slider"
            aria-label="CRT effect"
            onChange={(e) => updateSettings({ crt: Number(e.target.value) })}
            className="h-8 w-full accent-[#3cb4ff]"
          />
        </label>
        {isDev && (
          <Button variant="secondary" onClick={openAdminPanel} data-testid="settings-admin">
            Admin panel
          </Button>
        )}
        <InstallCard variant="settings" />
        <Button variant="secondary" onClick={onSignOut}>
          Not {nickname}? Switch player
        </Button>
        <DisplayModeNote />
      </div>
    </Sheet>
  );
}

function VolumeSlider({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2 py-2">
      <span className="flex items-center justify-between font-semibold">
        {label}
        <span data-testid={`${testId}-value`} className="tabular-nums">
          {value === 0 ? 'Off' : `${value}%`}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        data-testid={testId}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full accent-[#3cb4ff]"
      />
    </label>
  );
}
