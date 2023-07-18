import { Account, Call } from '@core/types/phone';
import { Log, CallInfo, GlobalEventNames } from '@core/types/events';

type Events = GlobalEventNames | 'widgetReady';

const log = (...args: any[]) => console.log('widget-client', ...args);

// @ts-ignore
const client = ZAFClient.init();

// client.on('app.activated', (data: any) => console.log('app.activated', { data }));

client.on('app.registered', (data: any) => {
  // console.log('app.registered', { data });

  let host: string, port: string, url: string;

  const form = document.getElementById('widget-placeholder')! as HTMLFormElement;
  const hostEl = form.elements.namedItem('host')! as HTMLInputElement;
  const portEl = form.elements.namedItem('port')! as HTMLInputElement;

  hostEl.addEventListener('change', () => host = hostEl.value);
  portEl.addEventListener('change', () => port = portEl.value);

  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!host || !port) return;

    url = `https://${host}:${port}/pbx/etc/widget/zendesk/index.html`;

    (document.getElementById('widget-container') as HTMLIFrameElement).src = url;
  });

  let widgetWindow: Window;

  const messageName = (name: Events) => `brekeke:${name}`;

  const sendMessage = <T>(name: Events, data?: T) => {
    if (!widgetWindow) return;
    try {
      widgetWindow.postMessage(JSON.stringify({ name: messageName(name), data }), '*');
    } catch (e) {
      log('send message error', name, e);
    }
  };

  window.addEventListener('message', ev => {
    try {
      const { name, data } = JSON.parse(ev.data);
      if (!name || (typeof name == 'string' && !name.startsWith('brekeke:'))) return;

      log(`${name} message received`, ev);
      log(`${name} message data`, data);

      switch (name) {
        case messageName('widgetReady'):
          log('widget ready');
          widgetWindow = ev.source as Window;
          document.getElementById('widget-placeholder')!.remove();
          client.invoke('resize', { width: '400px', height: '520px' });
          break;
      }
    } catch (e) {
      log('message error, invalid json string', e);
    }
  });

  window.addEventListener('messageerror', ev => {
    log('message error', ev);
  });
});

const formatRecordName = (name: string, type: string) => `[${type}] ${name}`;

const formatDate = (date: Date) => {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

const modal = () => {
  client.invoke('instances.create', {
    location: 'modal',
    url: 'https://127.0.0.1:8443/pbx/etc/widget/new/index.html',
    size: {
      width: '400px',
      height: '500px',
    },
  }).then(() => console.log('Modal loaded!'));
};

interface VoiceDialoutEvent {
  number: string;
}
