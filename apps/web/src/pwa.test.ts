import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import manifestRaw from '../public/manifest.webmanifest?raw';
import serviceWorker from '../public/sw.js?raw';

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
const manifest = JSON.parse(manifestRaw) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  icons: Icon[];
};

describe('web app manifest', () => {
  it('opens as a standalone (fullscreen) app from the home screen', () => {
    expect(manifest.name).toBe('POGO');
    expect(manifest.short_name).toBe('POGO');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.orientation).toBe('portrait');
  });

  it('uses brand colours', () => {
    expect(manifest.background_color).toBe('#1f4f8c');
    expect(manifest.theme_color).toBe('#1f4f8c');
  });

  it('ships 192 and 512 icons plus a maskable one', () => {
    const find = (size: string, purpose: string) =>
      manifest.icons.find((i) => i.sizes === size && (i.purpose ?? 'any') === purpose);
    expect(find('192x192', 'any')?.type).toBe('image/png');
    expect(find('512x512', 'any')?.type).toBe('image/png');
    expect(find('512x512', 'maskable')?.src).toBe('/icon-maskable-512.png');
  });
});

describe('index.html', () => {
  it('links the manifest and the iOS home-screen settings', () => {
    expect(indexHtml).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(indexHtml).toContain('name="mobile-web-app-capable" content="yes"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-title" content="POGO"');
    expect(indexHtml).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
  });

  it('draws under the status bar and fills it with the navy scrim', () => {
    expect(indexHtml).toContain('viewport-fit=cover');
    expect(indexHtml).toContain(
      'apple-mobile-web-app-status-bar-style" content="black-translucent"',
    );
    expect(indexHtml).toContain('class="safe-top-scrim"');
  });
});

describe('service worker', () => {
  it('never caches the API or the realtime connection', () => {
    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorker).toContain("url.pathname.startsWith('/socket.io/')");
  });

  it('only handles GET requests from its own origin', () => {
    expect(serviceWorker).toContain("request.method !== 'GET'");
    expect(serviceWorker).toContain('url.origin !== self.location.origin');
  });
});
