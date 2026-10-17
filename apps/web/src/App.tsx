import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { APP_NAME } from '@pogo/shared';
import type { ClientToServerEvents, ServerToClientEvents } from '@pogo/shared';

type Status = 'checking' | 'ok' | 'down';

function StatusRow({ label, status, detail }: { label: string; status: Status; detail?: string }) {
  const color =
    status === 'ok' ? 'bg-emerald-500' : status === 'down' ? 'bg-rose-500' : 'bg-amber-400';
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm dark:bg-slate-900">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      <div className="flex-1">
        <div className="font-semibold">{label}</div>
        {detail && <div className="text-sm text-slate-500 dark:text-slate-400">{detail}</div>}
      </div>
    </div>
  );
}

export function App() {
  const [api, setApi] = useState<Status>('checking');
  const [socketStatus, setSocketStatus] = useState<Status>('checking');
  const [hello, setHello] = useState<string>();

  useEffect(() => {
    fetch('/api/healthz')
      .then((r) => setApi(r.ok ? 'ok' : 'down'))
      .catch(() => setApi('down'));

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
    socket.on('connect', () => setSocketStatus('ok'));
    socket.on('disconnect', () => setSocketStatus('down'));
    socket.on('connect_error', () => setSocketStatus('down'));
    socket.on('hello', (msg) => setHello(msg.message));
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="text-5xl font-black tracking-tight text-violet-600 dark:text-violet-400">
        {APP_NAME}
      </h1>
      <p className="text-slate-600 dark:text-slate-300">Quick games with friends. Coming soon.</p>
      <StatusRow label="Server API" status={api} />
      <StatusRow label="Realtime connection" status={socketStatus} detail={hello} />
    </main>
  );
}
