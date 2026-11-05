import { useState } from 'react';
import type { ReactNode } from 'react';
import { openAdminPanel } from '../lib/session';
import { updateSettings, useSettings } from '../lib/settings';
import { DisplayModeNote, InstallCard } from './InstallCard';
import { Sheet } from './ui';

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
  // The row with the little arrow in front of it: the last one touched.
  const [sel, setSel] = useState('music');
  const step = (v: number, d: number) => Math.max(0, Math.min(100, Math.round((v + d) / 10) * 10));
  return (
    <Sheet open={open} onClose={onClose} title="Settings" from="top" dim={false} titleClass="mt-3">
      <div className="retro-menu mt-3" data-testid="settings-menu">
        {roomCode && (
          <Row id="room" sel={sel} setSel={setSel} label="Room" testId="settings-room-code">
            <span className="retro-value">{roomCode}</span>
          </Row>
        )}
        <BarRow
          id="music"
          label="Music"
          testId="music-slider"
          value={settings.music}
          sel={sel}
          setSel={setSel}
          onChange={(music) => updateSettings({ music })}
          step={step}
        />
        <BarRow
          id="sounds"
          label="Sounds"
          testId="sound-slider"
          value={settings.sound}
          sel={sel}
          setSel={setSel}
          onChange={(sound) => updateSettings({ sound })}
          step={step}
        />
        <Row
          id="vibration"
          sel={sel}
          setSel={setSel}
          label="Vibration"
          arrows={() => updateSettings({ vibration: !settings.vibration })}
        >
          <span className="retro-value" role="switch" aria-checked={settings.vibration}>
            {settings.vibration ? 'ON' : 'OFF'}
          </span>
        </Row>
        <BarRow
          id="crt"
          label="CRT"
          testId="crt-slider"
          value={settings.crt}
          sel={sel}
          setSel={setSel}
          onChange={(crt) => updateSettings({ crt })}
          step={step}
          valueTestId="crt-value"
        />
        {onLeave && (
          <Action id="leave" sel={sel} setSel={setSel} onClick={onLeave} testId="settings-leave">
            Leave lobby
          </Action>
        )}
        {isDev && (
          <Action
            id="admin"
            sel={sel}
            setSel={setSel}
            onClick={openAdminPanel}
            testId="settings-admin"
          >
            Admin panel
          </Action>
        )}
        <Action id="switch" sel={sel} setSel={setSel} onClick={onSignOut}>
          Not {nickname}? Switch player
        </Action>
        <Action
          id="default"
          sel={sel}
          setSel={setSel}
          onClick={() => updateSettings({ sound: 100, music: 50, vibration: true, crt: 20 })}
          testId="settings-default"
        >
          Default
        </Action>
        <Action id="exit" sel={sel} setSel={setSel} onClick={onClose} testId="settings-exit">
          Exit
        </Action>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <InstallCard variant="settings" />
        <DisplayModeNote />
      </div>
    </Sheet>
  );
}

/** The little arrow in front of the row that was touched last. */
function Marker({ on }: { on: boolean }) {
  return <span aria-hidden className={`retro-marker ${on ? '' : 'invisible'}`} />;
}

/** A row: arrow, name, dotted line, then (optionally) the value between two arrows. */
function Row({
  id,
  label,
  sel,
  setSel,
  arrows,
  testId,
  children,
}: {
  id: string;
  label: string;
  sel: string;
  setSel: (id: string) => void;
  /** Tap the arrows: step the value (the sign: -1 left, +1 right). */
  arrows?: (dir: -1 | 1) => void;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div className="retro-row" data-testid={testId} onPointerDown={() => setSel(id)}>
      <Marker on={sel === id} />
      <span className="retro-label">{label}</span>
      <span className="retro-dots" aria-hidden />
      {arrows ? (
        <button
          type="button"
          aria-label={`${label} less`}
          className="retro-arrow retro-arrow-left"
          onClick={() => arrows(-1)}
        />
      ) : (
        <span className="retro-arrow-gap" />
      )}
      <span className="retro-slot">{children}</span>
      {arrows ? (
        <button
          type="button"
          aria-label={`${label} more`}
          className="retro-arrow retro-arrow-right"
          onClick={() => arrows(1)}
        />
      ) : (
        <span className="retro-arrow-gap" />
      )}
    </div>
  );
}

/** A volume-like row: ten blocks, tap the arrows or drag the bar. */
function BarRow({
  id,
  label,
  testId,
  valueTestId,
  value,
  sel,
  setSel,
  onChange,
  step,
}: {
  id: string;
  label: string;
  testId: string;
  valueTestId?: string;
  value: number;
  sel: string;
  setSel: (id: string) => void;
  onChange: (value: number) => void;
  step: (value: number, delta: number) => number;
}) {
  return (
    <Row
      id={id}
      sel={sel}
      setSel={setSel}
      label={label}
      arrows={(d) => onChange(step(value, d * 10))}
    >
      <span className="retro-bar">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={value > i * 10 ? 'on' : ''} />
        ))}
        {/* the real control, invisible on top of the blocks: dragging it sets the value */}
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          data-testid={testId}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="retro-range"
        />
      </span>
      <span className="sr-only" data-testid={valueTestId ?? `${testId}-value`}>
        {value === 0 ? 'Off' : `${value}%`}
      </span>
    </Row>
  );
}

/** A plain row that does something when tapped. */
function Action({
  id,
  sel,
  setSel,
  onClick,
  testId,
  children,
}: {
  id: string;
  sel: string;
  setSel: (id: string) => void;
  onClick: () => void;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="retro-row retro-action"
      data-testid={testId}
      onPointerDown={() => setSel(id)}
      onClick={onClick}
    >
      <Marker on={sel === id} />
      <span className="retro-label">{children}</span>
    </button>
  );
}
