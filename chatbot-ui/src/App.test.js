import { fireEvent, render, screen, within } from '@testing-library/react';
import { TextDecoder, TextEncoder } from 'util';
import App from './App';
import { buildHistory, describeHttpError, pickSuggestions } from './Chatbot';

// react-markdown and remark-gfm are ESM-only, which CRA's Jest setup cannot load.
jest.mock('react-markdown', () => ({ children }) => children);
jest.mock('remark-gfm', () => () => {});

global.TextDecoder = TextDecoder;
Element.prototype.scrollIntoView = jest.fn();

function streamResponse(text) {
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return {
    ok: true,
    status: 200,
    text: async () => text,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true };
          sent = true;
          return { done: false, value: bytes };
        },
      }),
    },
  };
}

function sentHistory(call) {
  return JSON.parse(global.fetch.mock.calls[call][1].body).messages;
}

async function sendMessage(text) {
  fireEvent.change(screen.getByPlaceholderText(/message chatbotai/i), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /send message/i }));
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

test('buildHistory maps roles, skips errors and keeps the last 20 messages', () => {
  const messages = [
    { sender: 'user', text: 'hi' },
    { sender: 'ai', text: 'Cannot reach the backend', error: true },
    { sender: 'ai', text: 'hello!' },
  ];
  expect(buildHistory(messages, 'next')).toEqual([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello!' },
    { role: 'user', content: 'next' },
  ]);

  const many = Array.from({ length: 30 }, (_, i) => ({ sender: i % 2 ? 'ai' : 'user', text: `m${i}` }));
  const history = buildHistory(many, 'latest');
  expect(history).toHaveLength(20);
  expect(history[history.length - 1]).toEqual({ role: 'user', content: 'latest' });
});

test('HTTP errors are turned into readable messages', () => {
  const spring405 =
    '{"timestamp":"2026-11-20T09:43:32.242+00:00","status":405,"error":"Method Not Allowed","path":"/ai/chat/stream"}';
  expect(describeHttpError(405, spring405)).toMatch(/restart spring boot/i);
  expect(describeHttpError(404, '')).toMatch(/older version/i);
  expect(describeHttpError(503, 'GROQ_API_KEY is not set.')).toBe('GROQ_API_KEY is not set.');
  expect(describeHttpError(500, '{"status":500,"error":"Internal Server Error"}')).toBe('Internal Server Error');
  expect(describeHttpError(502, '')).toBe('Request failed (502). Check the backend logs.');
});

test('follow-up questions are sent with the earlier conversation', async () => {
  global.fetch
    .mockResolvedValueOnce(streamResponse('Nice to meet you, Deep!'))
    .mockResolvedValueOnce(streamResponse('Your name is Deep.'));
  render(<App />);

  await sendMessage('My name is Deep');
  expect(await screen.findByText('Nice to meet you, Deep!')).toBeInTheDocument();
  expect(global.fetch.mock.calls[0][1].method).toBe('POST');
  expect(sentHistory(0)).toEqual([{ role: 'user', content: 'My name is Deep' }]);

  await sendMessage('What is my name?');
  expect(await screen.findByText('Your name is Deep.')).toBeInTheDocument();
  expect(sentHistory(1)).toEqual([
    { role: 'user', content: 'My name is Deep' },
    { role: 'assistant', content: 'Nice to meet you, Deep!' },
    { role: 'user', content: 'What is my name?' },
  ]);
});

test('error replies are shown but not sent back to the AI', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(streamResponse('All good now.'));
  render(<App />);

  await sendMessage('first try');
  expect(await screen.findByText(/cannot reach the backend/i)).toBeInTheDocument();

  await sendMessage('second try');
  expect(await screen.findByText('All good now.')).toBeInTheDocument();
  expect(sentHistory(1)).toEqual([
    { role: 'user', content: 'first try' },
    { role: 'user', content: 'second try' },
  ]);
});

test('chat survives a page reload and is used as context', async () => {
  global.fetch
    .mockResolvedValueOnce(streamResponse('Noted: you like Java.'))
    .mockResolvedValueOnce(streamResponse('You said you like Java.'));
  const { unmount } = render(<App />);
  await sendMessage('I like Java');
  expect(await screen.findByText('Noted: you like Java.')).toBeInTheDocument();
  unmount();

  render(<App />);
  expect(screen.getByText('I like Java')).toBeInTheDocument();
  expect(screen.getByText('Noted: you like Java.')).toBeInTheDocument();

  await sendMessage('What do I like?');
  expect(await screen.findByText('You said you like Java.')).toBeInTheDocument();
  expect(sentHistory(1)).toHaveLength(3);
});

test('corrupted saved chat is ignored instead of crashing', () => {
  localStorage.setItem('chatbot-messages', '{not valid json');
  render(<App />);
  expect(screen.getByText(/mmm\.\., i can/i)).toBeInTheDocument();

  localStorage.setItem('chatbot-messages', JSON.stringify([{ sender: 'hacker', text: 1 }, null]));
  render(<App />);
  expect(screen.queryByText('hacker')).not.toBeInTheDocument();
});

test('New chat clears the conversation and the saved copy', async () => {
  global.fetch.mockResolvedValueOnce(streamResponse('Hello there!'));
  render(<App />);
  const newChat = screen.getByRole('button', { name: /new chat/i });
  expect(newChat).toBeDisabled();

  await sendMessage('hi');
  expect(await screen.findByText('Hello there!')).toBeInTheDocument();
  expect(newChat).toBeEnabled();
  expect(JSON.parse(localStorage.getItem('chatbot-messages'))).toHaveLength(2);

  fireEvent.click(newChat);
  expect(screen.queryByText('Hello there!')).not.toBeInTheDocument();
  expect(localStorage.getItem('chatbot-messages')).toBeNull();
  expect(newChat).toBeDisabled();
});

test('renders chat input and brand', () => {
  render(<App />);
  expect(screen.getByPlaceholderText(/message chatbotai/i)).toBeInTheDocument();
  expect(screen.getByText('ChatBotAI')).toBeInTheDocument();
});

test('shows the intro and capability list', () => {
  render(<App />);
  expect(screen.getByText(/mmm\.\., i can/i)).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /.+/ }).length).toBeGreaterThanOrEqual(4);
});

test('clicking a suggestion fills the message box', () => {
  render(<App />);
  const [suggestion] = within(screen.getByRole('list')).getAllByRole('button');
  fireEvent.click(suggestion);
  expect(screen.getByPlaceholderText(/message chatbotai/i)).toHaveValue(suggestion.textContent);
  expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled();
});

test('suggestions are random, one per group, and change every time', () => {
  let previous = pickSuggestions();
  expect(previous).toHaveLength(4);
  for (let i = 0; i < 50; i++) {
    const next = pickSuggestions(previous);
    expect(next).toHaveLength(4);
    for (let g = 0; g < next.length; g++) {
      expect(next[g].text).not.toBe(previous[g].text);
    }
    previous = next;
  }
});

test('New chat shows a fresh set of suggestions', async () => {
  global.fetch.mockResolvedValueOnce(streamResponse('Hi!'));
  render(<App />);
  const texts = () => within(screen.getByRole('list')).getAllByRole('button').map((b) => b.textContent);
  const before = texts();

  await sendMessage('hi');
  expect(await screen.findByText('Hi!')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /new chat/i }));

  const after = texts();
  expect(after).toHaveLength(4);
  after.forEach((t, i) => expect(t).not.toBe(before[i]));
});

test('theme toggle switches between light and dark and remembers the choice', () => {
  localStorage.setItem('chatbot-theme', 'light');
  render(<App />);
  expect(document.documentElement.dataset.theme).toBe('light');

  const toggle = screen.getByRole('switch', { name: /dark mode/i });
  expect(toggle).toHaveAttribute('aria-checked', 'false');

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('chatbot-theme')).toBe('dark');

  fireEvent.click(screen.getByText('Light'));
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(document.documentElement.dataset.theme).toBe('light');
});
