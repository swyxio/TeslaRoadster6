import './chat.css';

export type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  text: string;
  time: number;
};

type ConnectionStatus = 'connecting' | 'online' | 'offline';

type ChatPanelOptions = {
  onSend: (text: string) => boolean;
  onOpenChange: (open: boolean) => void;
};

/** A transport-independent view. Callers own the connection and message history. */
export function createChatPanel(options: ChatPanelOptions) {
  const dialog = document.createElement('dialog');
  dialog.className = 'chat-dialog';
  dialog.setAttribute('aria-labelledby', 'chat-title');

  const header = document.createElement('header');
  header.className = 'chat-header';
  const heading = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.className = 'chat-kicker';
  kicker.textContent = 'POLY AV / EVERY ROOM';
  const title = document.createElement('h2');
  title.id = 'chat-title';
  title.textContent = 'Global chat';
  heading.append(kicker, title);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'chat-close';
  closeButton.setAttribute('aria-label', 'Close global chat');
  closeButton.textContent = '✕';
  header.append(heading, closeButton);

  const connection = document.createElement('div');
  connection.className = 'chat-connection';
  connection.setAttribute('role', 'status');
  const statusDot = document.createElement('span');
  statusDot.className = 'chat-status-dot';
  statusDot.setAttribute('aria-hidden', 'true');
  const statusText = document.createElement('span');
  connection.append(statusDot, statusText);

  const identity = document.createElement('p');
  identity.className = 'chat-identity';
  const history = document.createElement('div');
  history.className = 'chat-history';
  const empty = document.createElement('p');
  empty.className = 'chat-empty';
  empty.textContent = 'No messages yet. Say hello to the Bay!';
  const messages = document.createElement('ol');
  messages.className = 'chat-messages';
  messages.setAttribute('role', 'log');
  messages.setAttribute('aria-label', 'Global chat messages');
  messages.setAttribute('aria-live', 'polite');
  messages.setAttribute('aria-relevant', 'additions');
  history.append(empty, messages);

  const newer = document.createElement('button');
  newer.type = 'button';
  newer.className = 'chat-newer';
  newer.hidden = true;
  newer.textContent = 'New messages ↓';

  const form = document.createElement('form');
  form.className = 'chat-compose';
  const label = document.createElement('label');
  label.className = 'chat-visually-hidden';
  label.htmlFor = 'chat-input';
  label.textContent = 'Message everyone';
  const input = document.createElement('input');
  input.id = 'chat-input';
  input.type = 'text';
  input.maxLength = 240;
  input.placeholder = 'Message everyone…';
  input.autocomplete = 'off';
  const send = document.createElement('button');
  send.type = 'submit';
  send.textContent = 'Send';
  const feedback = document.createElement('p');
  feedback.className = 'chat-feedback';
  feedback.setAttribute('role', 'status');
  feedback.textContent = 'Up to 240 characters.';
  form.append(label, input, send);
  dialog.append(header, connection, identity, history, newer, form, feedback);

  let status: ConnectionStatus = 'offline';
  let ownId = '';
  let notifiedOpen = false;
  const messageIds = new Set<string>();

  function clearFeedback() {
    if (feedback.textContent !== 'Up to 240 characters.') feedback.textContent = 'Up to 240 characters.';
  }
  function updateSend() {
    send.disabled = status !== 'online' || !input.value.trim();
    input.disabled = status !== 'online';
  }
  function scrollToLatest() {
    history.scrollTop = history.scrollHeight;
    newer.hidden = true;
  }
  function renderMessage(message: ChatMessage) {
    const row = document.createElement('li');
    row.className = 'chat-message';
    row.dataset.playerId = message.playerId;
    row.dataset.messageId = message.id;
    row.classList.toggle('chat-mine', !!ownId && message.playerId === ownId);
    const meta = document.createElement('div');
    meta.className = 'chat-message-meta';
    const sender = document.createElement('strong');
    sender.textContent = message.name;
    const playerId = document.createElement('span');
    playerId.className = 'chat-player-id';
    playerId.textContent = `#${message.playerId.slice(0, 8)}`;
    playerId.title = message.playerId;
    const time = document.createElement('time');
    const date = new Date(message.time);
    if (Number.isFinite(date.getTime())) {
      time.dateTime = date.toISOString();
      time.textContent = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    const body = document.createElement('p');
    body.textContent = message.text;
    meta.append(sender, playerId, time);
    row.append(meta, body);
    return row;
  }
  function append(message: ChatMessage) {
    if (messageIds.has(message.id)) return;
    const follow = history.scrollHeight - history.scrollTop - history.clientHeight < 48;
    messageIds.add(message.id);
    messages.append(renderMessage(message));
    while (messages.childElementCount > 100) {
      const oldest = messages.firstElementChild as HTMLElement;
      messageIds.delete(oldest.dataset.messageId!);
      oldest.remove();
    }
    empty.hidden = true;
    if (follow || !dialog.open) scrollToLatest();
    else newer.hidden = false;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (status !== 'online' || !text) return;
    if (options.onSend(text)) {
      input.value = '';
      clearFeedback();
      updateSend();
      input.focus();
    } else {
      feedback.textContent = 'Message not sent. Check your connection and try again.';
    }
  });
  input.addEventListener('input', () => { clearFeedback(); updateSend(); });
  newer.addEventListener('click', scrollToLatest);
  history.addEventListener('scroll', () => {
    if (history.scrollHeight - history.scrollTop - history.clientHeight < 48) newer.hidden = true;
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (notifiedOpen && !dialog.open) {
      notifiedOpen = false;
      options.onOpenChange(false);
    }
  });

  const panel = {
    element: dialog,
    open() {
      if (dialog.open) return;
      dialog.showModal();
      notifiedOpen = true;
      options.onOpenChange(true);
      scrollToLatest();
      // Avoid opening a touch keyboard just by viewing chat.
      if (matchMedia('(pointer: fine)').matches && !input.disabled) input.focus();
      else closeButton.focus();
    },
    close() { if (dialog.open) dialog.close(); },
    setConnection(next: ConnectionStatus, detail?: string) {
      status = next;
      connection.dataset.status = next;
      const label = next === 'online' ? 'Connected' : next === 'connecting' ? 'Connecting…' : 'Offline';
      const text = detail ? `${label} · ${detail}` : label;
      if (statusText.textContent !== text) statusText.textContent = text;
      updateSend();
    },
    setIdentity(id: string, name: string) {
      ownId = id;
      identity.textContent = id ? `You’re ${name} · #${id.slice(0, 8)}` : '';
      identity.title = id;
      for (const row of messages.querySelectorAll<HTMLElement>('.chat-message')) {
        row.classList.toggle('chat-mine', !!id && row.dataset.playerId === id);
      }
    },
    setMessages(next: ChatMessage[]) {
      messageIds.clear();
      messages.replaceChildren();
      empty.hidden = next.length > 0;
      for (const message of next.slice(-100)) {
        if (messageIds.has(message.id)) continue;
        messageIds.add(message.id);
        messages.append(renderMessage(message));
      }
      scrollToLatest();
    },
    append,
  };
  panel.setConnection('offline');
  return panel;
}
