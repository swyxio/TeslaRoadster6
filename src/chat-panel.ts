import './chat.css';
import { MAX_CHAT_LENGTH, normalizeChatText } from '../worker/global-chat-core';
import { MAX_NAME_LENGTH, normalizeName } from '../worker/global-chat-core';
import { limitDriverNameInput } from './driver-name';

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
  onRename: (name: string) => boolean;
  onOpenChange: (open: boolean) => void;
};

/** A transport-independent view. Callers own the connection and message history. */
export function createChatPanel(options: ChatPanelOptions) {
  const dialog = document.createElement('dialog');
  dialog.className = 'chat-dialog';
  dialog.setAttribute('aria-labelledby', 'chat-title');

  const phoneTop = document.createElement('div');
  phoneTop.className = 'chat-phone-top';
  phoneTop.setAttribute('aria-hidden', 'true');
  const speaker = document.createElement('span');
  speaker.className = 'chat-phone-speaker';
  phoneTop.append(speaker);
  const header = document.createElement('header');
  header.className = 'chat-header';
  const heading = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.className = 'chat-kicker';
  kicker.textContent = 'TESLAND MESSAGES';
  const title = document.createElement('h2');
  title.id = 'chat-title';
  title.textContent = 'Everyone';
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

  const identityRow = document.createElement('div');
  identityRow.className = 'chat-identity-row';
  const identity = document.createElement('p');
  identity.className = 'chat-identity';
  const editName = document.createElement('button');
  editName.type = 'button';
  editName.className = 'chat-edit-name';
  editName.textContent = 'Edit name';
  identityRow.append(identity, editName);
  const nameForm = document.createElement('form');
  nameForm.className = 'chat-name-form';
  nameForm.hidden = true;
  const nameLabel = document.createElement('label');
  nameLabel.className = 'chat-visually-hidden';
  nameLabel.htmlFor = 'chat-name-input';
  nameLabel.textContent = 'Your driver name';
  const nameInput = document.createElement('input');
  nameInput.id = 'chat-name-input';
  nameInput.maxLength = MAX_NAME_LENGTH * 2;
  nameInput.setAttribute('autocomplete', 'nickname');
  const saveName = document.createElement('button');
  saveName.type = 'submit';
  saveName.textContent = 'Save';
  const cancelName = document.createElement('button');
  cancelName.type = 'button';
  cancelName.textContent = 'Cancel';
  const nameFeedback = document.createElement('p');
  nameFeedback.className = 'chat-name-feedback';
  nameFeedback.setAttribute('role', 'status');
  nameForm.append(nameLabel, nameInput, saveName, cancelName, nameFeedback);
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
  // HTML maxlength counts UTF-16 units, not the code points used by the hub.
  // Two units per code point leaves room for the full limit of emoji.
  input.maxLength = MAX_CHAT_LENGTH * 2;
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
  const phoneBottom = document.createElement('div');
  phoneBottom.className = 'chat-phone-bottom';
  phoneBottom.setAttribute('aria-hidden', 'true');
  dialog.append(phoneTop, header, connection, identityRow, nameForm, history, newer, form, feedback, phoneBottom);

  let status: ConnectionStatus = 'offline';
  let ownId = '';
  let ownName = '';
  let submittedName: string | undefined;
  let notifiedOpen = false;
  const messageIds = new Set<string>();

  function clearFeedback() {
    if (feedback.textContent !== 'Up to 240 characters.') feedback.textContent = 'Up to 240 characters.';
  }
  function updateSend() {
    send.disabled = status !== 'online' || !input.value.trim();
    input.disabled = status !== 'online';
    editName.disabled = status !== 'online';
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
    if (status !== 'online' || !input.value.trim()) return;
    const text = normalizeChatText(input.value);
    if (!text) {
      feedback.textContent = 'Use visible text, up to 240 characters after normalization.';
      return;
    }
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
  editName.addEventListener('click', () => {
    nameForm.hidden = false;
    nameInput.value = ownName;
    submittedName = undefined;
    nameFeedback.textContent = '';
    nameInput.focus();
  });
  cancelName.addEventListener('click', () => { nameForm.hidden = true; submittedName = undefined; nameFeedback.textContent = ''; editName.focus(); });
  nameInput.addEventListener('input', event => { if (!(event as InputEvent).isComposing) limitDriverNameInput(nameInput); });
  nameInput.addEventListener('compositionend', () => limitDriverNameInput(nameInput));
  nameForm.addEventListener('submit', event => {
    event.preventDefault();
    const name = normalizeName(nameInput.value);
    nameInput.value = name;
    if (options.onRename(name)) {
      submittedName = name;
      saveName.disabled = true;
      nameFeedback.textContent = 'Saving…';
    } else nameFeedback.textContent = 'Could not change your name. Check your connection and try again.';
  });
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
      ownName = name;
      identity.textContent = id ? `You’re ${name} · #${id.slice(0, 8)}` : '';
      identity.title = id;
      for (const row of messages.querySelectorAll<HTMLElement>('.chat-message')) {
        row.classList.toggle('chat-mine', !!id && row.dataset.playerId === id);
      }
    },
    finishRename(message: string, success: boolean) {
      saveName.disabled = false;
      nameFeedback.textContent = message;
      if (success) {
        const hasNewDraft = !nameForm.hidden && (submittedName === undefined || nameInput.value !== submittedName);
        submittedName = undefined;
        if (hasNewDraft) nameFeedback.textContent = 'Name updated. Save your new draft when you’re ready.';
        else { nameForm.hidden = true; if (dialog.open) editName.focus(); }
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
