import type { Theme } from '../lib/settings';
import { updateSettings, useSettings } from '../lib/settings';
import { InstallCard } from './InstallCard';
import { Button, Sheet, Toggle } from './ui';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Teal' },
  { value: 'dark', label: 'Navy' },
];

export function SettingsSheet({
  open,
  onClose,
  nickname,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  nickname: string;
  onSignOut: () => void;
}) {
  const settings = useSettings();
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-2">
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
        <div className="py-2">
          <div className="label mb-2 text-muted">Theme</div>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                aria-pressed={settings.theme === t.value}
                onClick={() => updateSettings({ theme: t.value })}
                className={`min-h-11 rounded-md border-2 text-sm font-bold uppercase tracking-wider ${
                  settings.theme === t.value
                    ? 'border-accent bg-accent text-accentink'
                    : 'border-edge/40 text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <InstallCard variant="settings" />
        <Button variant="secondary" onClick={onSignOut}>
          Not {nickname}? Switch player
        </Button>
      </div>
    </Sheet>
  );
}
