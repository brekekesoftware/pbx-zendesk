import { Account, Call } from '@core/types/phone';

// @ts-ignore
const client = ZAFClient.init();

// client.invoke('resize', { width: '400px', height: '520px' });

interface VoiceDialoutEvent {
  number: string;
}

client.on('app.activated', function (data: any) {
  console.log('app.activated', { data });
});

client.on('app.registered', (data: any) => {
  // console.log('app.registered', { data });

  // window.Brekeke.widget.events(events => {
  //
  // });

  window.Brekeke.renderWidget(
    document.getElementById('widget_embed_div')!,
    ({
       fireCallInfoEvent,
       fireConfigEvent,
       fireLogSavedEvent,
       fireMakeCallEvent,
       onCallUpdatedEvent,
       onCallEndedEvent,
       onLoggedOutEvent,
       onLoggedInEvent,
       onCallEvent,
       onLogEvent,
     }) => {
      const autoTicket = false;

      fireConfigEvent({
        enableLog: !autoTicket,
        enableLogDescription: true,
        enableLogResult: false,
        logButtonTitle: 'Create Ticket',
      });

      let dialOut: VoiceDialoutEvent | undefined;
      let currentCall: Call | undefined;
      let agent: any | undefined;
      let pbxAccount: Account | undefined;

      let recentTicketId: number | undefined;

      // add click-to-call listener
      // @ts-ignore
      client.on('voice.dialout', e => {
        console.log('voice.dialout', e);
        dialOut = e;
        fireMakeCallEvent(e.number);
      });

      onLoggedInEvent(account => {
        pbxAccount = account;
        client.request('/api/v2/users/me.json')
          .then((data: any) => {
            console.log('me', { data });
            if (data) {
              agent = data.user;
            }
          })
          .catch((error: any) => {
            console.error(error.toString());
          });
      });

      onLoggedOutEvent(() => {
        currentCall = undefined;
        dialOut = undefined;
        agent = undefined;
        pbxAccount = undefined;
      });

      onCallUpdatedEvent(call => void (currentCall = call));
      onCallEndedEvent(call => {
        if (call.id === currentCall?.id) {
          currentCall = undefined;
        }

        if (dialOut?.number === call.partyNumber) {
          dialOut = undefined;
        }
      });

      onCallEvent(call => {
        console.log('onCallEvent', call);

        // dock the panel
        client.invoke('popover', 'show');

        const phone = call.partyNumber;
        let query = `/api/v2/search.json?query=role:end-user phone:${phone}`;
        // query = encodeURIComponent(query);

        client.request(query)
          .then((data: any) => {
            console.log('search', { data });

            if (data.results.length > 0) {
              const customer = data.results[0];

              fireCallInfoEvent(call, {
                id: customer.id,
                name: customer.name,
              });

              if (!autoTicket) {
                client.invoke('routeTo', 'user', customer.id);
              } else {
                client.request(`/api/v2/users/${customer.id}/tickets/requested.json?sortby=created_at&sort_order=desc`)
                  .then((data: any) => {
                    console.log('tickets', { data });

                    if (data.tickets.length > 0) {
                      recentTicketId = data.tickets[0].id;
                      client.invoke('routeTo', 'ticket', recentTicketId);
                    } else {
                      createTicket(call, customer);
                    }
                  })
                  .catch((error: any) => {
                    console.error('find ticket error', error.toString());
                  });
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
                  console.log('create user', { data });

                  const result = JSON.parse(data.responseText);
                  console.log('create user', { result });
                  if (result.user.id) {
                    const customer = result.user;

                    fireCallInfoEvent(call, {
                      id: customer.id,
                      name: customer.name,
                    });

                    if (autoTicket) {
                      createTicket(call, customer);
                    } else {
                      client.invoke('routeTo', 'user', customer.id);
                    }
                  }
                })
                .catch((err: any) => {
                  console.error('create user error', err);
                });
            }
          })
          .catch((err: any) => {
            console.error('search error', err);
          });
      });

      onLogEvent(log => {
        console.log('logEvent', log);
        const call = log.call;

        const voice_comment = {
          answered_by_id: agent.id,
          call_duration: Math.trunc(log.duration / 1000),
          from: call.incoming ? call.partyNumber : log.user,
          to: call.incoming ? log.user : call.partyNumber,
          recording_url: 'https://samplelib.com/lib/preview/mp3/sample-6s.mp3',
          started_at: new Date(call.answeredAt),
          // location: 'Dublin, Ireland',
          // transcription_text: 'The transcription of the call',
        };

        const ticketData = {
          display_to_agent: agent.id,
          ticket: {
            via_id: call.incoming ? 45 : 46,
            subject: log.subject,
            description: log.description,
            comment: { body: log.comment },
            requester_id: log.recordId,
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
              fireLogSavedEvent(log);
              const id = result.ticket.id;
              console.log('ticket created' + result.ticket);
              client.invoke('routeTo', 'ticket', recentTicketId);

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
                .then((data: any) => {
                  console.log('recording updated', data);
                })
                .catch((error: any) => {
                  console.error('recording update error', error);
                });
            }
          })
          .catch((error: any) => {
            console.error('ticket error', error);
          });
      });

      const createTicket = (call: Call, customer: any) => {
        const ticketData = {
          display_to_agent: agent.id,
          ticket: {
            via_id: call.incoming ? 45 : 46,
            subject: 'New Ticket',
            requester_id: customer.id,
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
              console.log('ticket created' + result.ticket);
              client.invoke('routeTo', 'ticket', recentTicketId);
            }
          })
          .catch((error: any) => {
            console.error('ticket error', error);
          });
      };
    },
  );
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
