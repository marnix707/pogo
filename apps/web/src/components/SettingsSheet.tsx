import type { Theme } from '../lib/settings';
import { updateSettings, useSettings } from '../lib/settings';
import { Button, Sheet, Toggle } from './ui';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
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
          <div className="mb-2 font-semibold">Theme</div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            {THEMES.map((t) => (
              <button
                key={t.value}
                aria-pressed={settings.theme === t.value}
                onClick={() => updateSettings({ theme: t.value })}
                className={`min-h-11 rounded-xl text-sm font-bold ${
                  settings.theme === t.value
                    ? 'bg-white shadow dark:bg-slate-950'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <Button variant="secondary" onClick={onSignOut}>
          Not {nickname}? Switch player
        </Button>
      </div>
    </Sheet>
  );
}
