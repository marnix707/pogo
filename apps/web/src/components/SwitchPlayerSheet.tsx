import { useState } from 'react';
import type { PublicUser } from '@pogo/shared';
import { isKeptOnDevice } from '../lib/players';
import { recoveryUrl } from '../lib/session';
import { rememberRecoverySaved } from '../lib/players';
import { Button, Sheet } from './ui';

/**
 * Asks before "Switch player" for a guest. The warning follows what can be recovered: the guest is kept
 * on this device (lib/players.ts), so the dialog is a soft one; when it could not be kept (storage blocked)
 * the loss is real and the dialog says so, offering the recovery link.
 */
export function SwitchPlayerSheet({
  open,
  onClose,
  user,
  token,
  onSwitch,
  onRegister,
}: {
  open: boolean;
  onClose: () => void;
  user: PublicUser;
  token: string;
  onSwitch: () => void;
  onRegister: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const kept = open && isKeptOnDevice(user.id);

  async function copy() {
    const url = recoveryUrl(token);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this private link and keep it safe:', url);
    }
    rememberRecoverySaved(user.id);
    setCopied(true);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Switch player?">
      <div
        className="flex flex-col gap-3"
        data-testid="switch-dialog"
        data-severity={kept ? 'soft' : 'strong'}
      >
        {kept ? (
          <p className="text-sm">
            You are playing as a guest. You can come back to <b>{user.nickname}</b> later with{' '}
            <b>Continue as {user.nickname}</b> on the sign-in screen of this device. Register to
            keep your stats safe on every device.
          </p>
        ) : (
          <p className="rounded-md bg-danger/20 p-2 text-sm font-semibold text-dangertext">
            This player and its stats will be lost for good: this device cannot keep them. Register
            first, or copy the recovery link.
          </p>
        )}
        <Button data-testid="switch-register" onClick={onRegister}>
          Register to keep it
        </Button>
        {!kept && (
          <Button variant="secondary" data-testid="switch-copy" onClick={() => void copy()}>
            {copied ? 'Link copied' : 'Copy recovery link'}
          </Button>
        )}
        <Button
          variant={kept ? 'secondary' : 'danger'}
          data-testid="switch-confirm"
          onClick={onSwitch}
        >
          {kept ? 'Switch player' : 'Switch anyway'}
        </Button>
        <button type="button" className="label text-center text-muted underline" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
