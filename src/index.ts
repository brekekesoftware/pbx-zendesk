import { GlobalEventNames, GlobalEventDetails, Log, CallRecord, Contact } from '@core/types/events';
import { Account, Call } from '@core/types/phone';

/**
 * REFERENCES
 * SET-UP: https://developer.zendesk.com/documentation/apps/getting-started/setting-up-new-apps
 * ZCLI: https://developer.zendesk.com/documentation/apps/getting-started/using-zcli
 * MANIFEST: https://developer.zendesk.com/documentation/apps/app-developer-guide/manifest
 * REQUESTS: https://developer.zendesk.com/documentation/apps/app-developer-guide/making-api-requests-from-a-zendesk-app/
 * Install: https://d3v-esire.zendesk.com/admin/apps-integrations/apps/support-apps
 */

const setting: Setting = {
  widgetURL: undefined,
};

const logName = 'brekeke-widget:zendesk';
const logger = (...args: unknown[]) => {
  const { widgetURL } = setting;
  if (!widgetURL?.host.startsWith('localhost') && !widgetURL?.host.startsWith('127.0.0.1')) return;
  if (typeof args[0] === 'string' && args[0].includes('error')) {
    console.error(logName, ...args);
    return;
  }
  console.log(logName, ...args);
};

// @ts-ignore
const client = ZAFClient.init();

// client.on('app.activated', (data: any) => console.log('app.activated', { data }));

let widgetWindow: Window;

const autoTicket = false;
const calls: string[] = [];
let dialOut: VoiceDialoutEvent | undefined;
let currentCall: Call | undefined;
let agent: any | undefined;
let pbxAccount: Account | undefined;

let recentTicketId: number | undefined;

const messageName = (name: GlobalEventNames | 'widgetReady') => `brekeke:${name}`;

const sendMessage = <T extends GlobalEventNames>(name: T | 'widgetReady', data?: GlobalEventDetails<T>) => {
  if (!widgetWindow) return;
  try {
    widgetWindow.postMessage(JSON.stringify({ name: messageName(name), data }), '*');
  } catch (e) {
    logger('send message error', name, e);
  }
};

window.addEventListener('messageerror', ev => logger('message error', ev));
window.addEventListener('message', ev => {
  try {
    const { name, data } = JSON.parse(ev.data);
    if (!name || (typeof name == 'string' && !name.startsWith('brekeke:'))) return;

    logger(`${name} message received`, ev);
    logger(`${name} message data`, data);

    switch (name) {
      case messageName('widgetReady'):
        logger('widget ready');
        widgetWindow = ev.source as Window;
        client.invoke('resize', { width: '400px', height: '520px' });

        sendMessage('config', {
          enableLog: !autoTicket,
          logButtonTitle: 'Create Ticket',
          logInputs: [
            {
              label: 'Subject',
              name: 'subject',
              type: 'text',
              required: true,
              defaultValue: `Call on #createdAt`,
            },
            {
              label: 'Description',
              name: 'description',
              type: 'text',
              required: true,
            },
            {
              label: 'Comment',
              name: 'comment',
              type: 'textarea',
            },
          ],
        });
        break;
      case messageName('logged-in'):
        pbxAccount = data;
        client.request('/api/v2/users/me.json')
          .then((data: any) => {
            logger('me', { data });
            if (data) agent = data.user;
          })
          .catch((error: any) => logger('get agent error', error));
        break;
      case messageName('logged-out'):
        currentCall = undefined;
        dialOut = undefined;
        agent = undefined;
        pbxAccount = undefined;
        calls.length = 0;
        break;
      case messageName('call'):
        currentCall = data;
        break;
      case messageName('call-updated'):
        const call = data as Call;

        const callId = `${call.pbxRoomId}-${call.id}`;
        if (calls.includes(callId)) return;
        calls.push(callId);

        onCall(call);
        break;
      case messageName('call-ended'):
        onCallEnded(data);
        break;
      case messageName('contact-selected'):
        onContactSelected(data);
        break;
      case messageName('log'):
        onLog(data);
        break;
    }
  } catch (e) {
    logger('message error, invalid json string', e);
  }
});

client.on('app.registered', (data: any) => {
  // log('app.registered', { data });
  const { widgetUrl } = data.metadata.settings;
  setting.widgetURL = new URL(widgetUrl);

  (document.getElementById('widget-container')! as HTMLIFrameElement).src = widgetUrl;
});

// add click-to-call listener
client.on('voice.dialout', (e: any) => {
  logger('voice.dialout', e);
  sendMessage('make-call', e.number);
});

const loadCustomerTicket = (contactId: string, call: Call) => {
  client.request(`/api/v2/users/${contactId}/tickets/requested.json?sortby=created_at&sort_order=desc`)
    .then((data: any) => {
      logger('tickets', { data });

      if (data.tickets.length > 0) {
        recentTicketId = data.tickets[0].id;
        client.invoke('routeTo', 'ticket', recentTicketId);
      } else {
        createTicket(call, contactId);
      }
    })
    .catch((error: any) => logger('find ticket error', error));
};

const onCall = (call: Call) => {
  // dock the panel
  client.invoke('popover', 'show');

  const phone = call.partyNumber;
  const query = encodeURIComponent(`role:end-user phone:*${phone}`);

  client.request(`/api/v2/search.json?query=${query}`)
    .then((data: any) => {
      logger('search', { data });

      if (data.results.length > 0) {
        const customer = data.results[0];

        sendMessage('call-info', {
          call,
          info: data.results,
        });

        if (!autoTicket) {
          client.invoke('routeTo', 'user', customer.id);
        } else {
          loadCustomerTicket(customer.id, call);
        }
      } else {
        const newCustomer = {
          user: {
            name: `Caller ${phone}`,
            phone,
          },
        };

        const config = {
          url: '/api/v2/users.json',
          type: 'POST',
          cache: false,
          contentType: 'application/json',
          httpCompleteResponse: true,
          data: JSON.stringify(newCustomer),
        };

        client.request(config)
          .then((data: any) => {
            logger('create user', { data });

            const result = JSON.parse(data.responseText);
            logger('create user', { result });
            if (result.user.id) {
              const customer = result.user;

              sendMessage('call-info', {
                call,
                info: customer,
              });

              if (autoTicket) {
                createTicket(call, customer);
              } else {
                client.invoke('routeTo', 'user', customer.id);
              }
            }
          })
          .catch((err: any) => logger('create user error', err));
      }
    })
    .catch((err: any) => logger('search error', err));
};

const onCallEnded = (call: Call) => {
  if (call.pbxRoomId === currentCall?.pbxRoomId) {
    currentCall = undefined;
  }

  if (dialOut?.number === call.partyNumber) {
    dialOut = undefined;
  }
};

const onContactSelected = ({ call, contact }: { call: Call; contact: Contact }) => {
  if (autoTicket) {
    loadCustomerTicket(contact.id, call);
  } else {
    client.invoke('routeTo', 'user', contact.id);
  }
};

const onLog = (log: Log) => {
  logger('logEvent', log);

  if (!log.contactId) {
    sendMessage('notification', { type: 'error', message: 'This call was not associated with a contact.' });
    return;
  }

  const call = log.call;

  const voice_comment = {
    answered_by_id: agent.id,
    call_duration: Math.trunc(log.duration / 1000),
    from: call.incoming ? call.partyNumber : log.user,
    to: call.incoming ? log.user : call.partyNumber,
    // recording_url: 'https://samplelib.com/lib/preview/mp3/sample-6s.mp3',
    recording_url: log.recording?.url,
    started_at: new Date(call.answeredAt),
    // location: 'Dublin, Ireland',
    // transcription_text: 'The transcription of the call',
  };

  const { subject, description, comment } = log.inputs;

  const ticketData = {
    display_to_agent: agent.id,
    ticket: {
      via_id: call.incoming ? 45 : 46,
      subject,
      description,
      comment: { body: comment ?? description },
      requester_id: log.contactId,
      assignee_id: agent.id,
      // voice_comment, // body comment seems to override this, so I'll PUT this after creating ticket with body comment.
    },
  };

  const config = {
    url: '/api/v2/channels/voice/tickets.json',
    type: 'POST',
    cache: false,
    contentType: 'application/json',
    httpCompleteResponse: true,
    data: JSON.stringify(ticketData),
  };

  client.request(config)
    .then((data: any) => {
      let result = JSON.parse(data.responseText);
      if (result.ticket) {
        sendMessage('log-saved', log);
        const id = result.ticket.id;
        logger('ticket created', result.ticket);
        client.invoke('routeTo', 'ticket', id);

        if (log.recording) {
          const voiceData = { ticket: { voice_comment } };

          const config = {
            url: `/api/v2/tickets/${id}.json`,
            type: 'PUT',
            cache: false,
            contentType: 'application/json',
            httpCompleteResponse: true,
            data: JSON.stringify(voiceData),
          };

          client.request(config)
            .then((data: any) => logger('recording updated', data))
            .catch((error: any) => logger('recording update error', error));
        }
      }
    })
    .catch((error: any) => logger('ticket error', error));
};

const createTicket = (call: Call, customer: any) => {
  const ticketData = {
    display_to_agent: agent.id,
    ticket: {
      via_id: call.incoming ? 45 : 46,
      subject: 'New Ticket',
      requester_id: ['string', 'number'].includes(typeof customer) ? customer : customer.id,
      description: `Call with ${call.partyNumber}`,
      assignee_id: agent.id,
    },
  };

  const config = {
    url: '/api/v2/channels/voice/tickets.json',
    type: 'POST',
    cache: false,
    contentType: 'application/json',
    httpCompleteResponse: true,
    data: JSON.stringify(ticketData),
  };

  client.request(config)
    .then((data: any) => {
      let result = JSON.parse(data.responseText);
      if (result.ticket) {
        recentTicketId = result.ticket.id;
        logger('ticket created' + result.ticket);
        client.invoke('routeTo', 'ticket', recentTicketId);
      }
    })
    .catch((error: any) => logger('ticket error', error));
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

interface Setting {
  widgetURL?: URL;
}
