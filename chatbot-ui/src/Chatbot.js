import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    FaCheck,
    FaCode,
    FaInfo,
    FaLightbulb,
    FaPaperPlane,
    FaPenNib,
    FaPlus,
    FaRegCopy,
} from 'react-icons/fa';
import './Chatbot.css';

const THEME_STORAGE_KEY = 'chatbot-theme';

function getInitialTheme() {
    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function useTheme() {
    const [theme, setTheme] = useState(getInitialTheme);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {}
    }, [theme]);

    const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    return [theme, setTheme, toggleTheme];
}

function ThemeSwitch({ isDark, onToggle, onSelect }) {
    return (
        <div className="theme-switch">
            <span
                className={`theme-switch-label${isDark ? '' : ' active'}`}
                onClick={() => onSelect('light')}
                aria-hidden="true"
            >
                Light
            </span>
            <button
                type="button"
                role="switch"
                aria-checked={isDark}
                aria-label="Dark mode"
                className={`theme-switch-track${isDark ? ' is-dark' : ''}`}
                onClick={onToggle}
            >
                <span className="theme-switch-dot dot-large" />
                <span className="theme-switch-dot dot-small" />
                <span className="theme-switch-knob" />
            </button>
            <span
                className={`theme-switch-label${isDark ? ' active' : ''}`}
                onClick={() => onSelect('dark')}
                aria-hidden="true"
            >
                Dark
            </span>
        </div>
    );
}

// Suggestion pool: one question is picked at random from each group, so the
// intro shows a different mix on every page load and every New chat.
const SUGGESTION_GROUPS = [
    {
        icon: FaInfo,
        colors: ['#4fd1e8', '#2b9fd9'],
        questions: [
            'Explain how the internet works in simple words',
            'What is the difference between RAM and storage?',
            'How does a vaccine train the immune system?',
            'Explain blockchain like I am 10 years old',
            'Why is the sky blue?',
            'How do large language models generate text?',
            'What causes inflation, in simple terms?',
            'How does GPS know where I am?',
        ],
    },
    {
        icon: FaCode,
        colors: ['#a07bff', '#6c4bf0'],
        questions: [
            'Write a Java method that checks if a string is a palindrome',
            'Explain the difference between an interface and an abstract class in Java',
            'Write a SQL query to find the second highest salary',
            'How do I reverse a linked list in Python?',
            'What does @Transactional do in Spring Boot?',
            'Explain Big-O notation with examples',
            'Write a React hook that debounces an input value',
            'How do I handle exceptions globally in Spring Boot?',
        ],
    },
    {
        icon: FaLightbulb,
        colors: ['#6ee7a0', '#2fb86a'],
        questions: [
            'Give me 5 project ideas using Spring AI',
            'Plan a 4-week roadmap to learn Docker',
            'Suggest names for a productivity app',
            'Give me ideas for a final-year computer science project',
            'Help me plan a productive study routine',
            'What are some side-project ideas to build my portfolio?',
            'Brainstorm features for a personal finance tracker',
        ],
    },
    {
        icon: FaPenNib,
        colors: ['#f472c6', '#d63fa3'],
        questions: [
            'Rewrite this sentence to sound more professional: "I can\'t make it to the meeting."',
            'Write a short cover letter for a junior developer role',
            'Write a polite email asking for a deadline extension',
            'Summarise the key points of a good README file',
            'Write a LinkedIn post announcing my new project',
            'Give me a catchy tagline for a coffee shop',
            'Make a comparison table of Java, Python and JavaScript',
        ],
    },
];

function randomItem(items, avoid) {
    const choices = items.length > 1 ? items.filter((item) => item !== avoid) : items;
    return choices[Math.floor(Math.random() * choices.length)];
}

// Picks one random question per group, avoiding the question shown last time
// for that group so a refresh always changes the list.
export function pickSuggestions(previous = []) {
    return SUGGESTION_GROUPS.map(({ icon, colors, questions }, i) => ({
        icon,
        colors,
        text: randomItem(questions, previous[i]?.text),
    }));
}

const MIN_THINKING_MS = 700;

function resolveApiBaseUrl() {
    const raw = process.env.REACT_APP_API_BASE_URL;
    if (raw != null && String(raw).trim() !== '') {
        return String(raw).replace(/\/$/, '');
    }
    if (process.env.NODE_ENV === 'development') {
        return '';
    }
    return 'http://localhost:8080';
}

const apiBaseUrl = resolveApiBaseUrl();

function buildStreamErrorMessage(error) {
    if (error?.message) {
        if (error.message.includes('Failed to fetch') || error.message === 'Network Error') {
            return (
                `Cannot reach the backend (${apiBaseUrl || window.location.origin}). ` +
                'Start Spring Boot on port 8080 and try again.'
            );
        }
        return error.message;
    }
    return 'An unexpected error occurred.';
}

const MAX_HISTORY_MESSAGES = 20;
const CHAT_STORAGE_KEY = 'chatbot-messages';
const MAX_SAVED_MESSAGES = 100;

function loadSavedMessages() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((m) => m && (m.sender === 'user' || m.sender === 'ai') && typeof m.text === 'string')
            .map(({ text, sender, error }) => (error ? { text, sender, error: true } : { text, sender }));
    } catch {
        return [];
    }
}

function saveMessages(messages) {
    try {
        if (messages.length === 0) {
            localStorage.removeItem(CHAT_STORAGE_KEY);
        } else {
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-MAX_SAVED_MESSAGES)));
        }
    } catch {}
}

export function buildHistory(messages, newUserText) {
    const turns = messages
        .filter((m) => !m.error && typeof m.text === 'string' && m.text.trim() !== '')
        .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
    turns.push({ role: 'user', content: newUserText });
    return turns.slice(-MAX_HISTORY_MESSAGES);
}

export function describeHttpError(status, body) {
    if (status === 404 || status === 405) {
        return (
            'The backend is running an older version that does not support this chat yet. ' +
            'Restart Spring Boot (Ctrl+C, then `mvn spring-boot:run`) and try again.'
        );
    }
    let text = body;
    if (body.startsWith('{')) {
        try {
            const json = JSON.parse(body);
            text = json.message || json.error || '';
        } catch {}
    }
    return text || `Request failed (${status}). Check the backend logs.`;
}

async function streamChatMessage(history, callbacks) {
    const response = await fetch(`${apiBaseUrl}/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(describeHttpError(response.status, errorText.trim()));
    }
    if (!response.body) {
        throw new Error('Streaming is not supported in this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk.length > 0) {
            callbacks.onChunk(chunk);
        }
    }

    callbacks.onDone();
}

const MASCOT_SRC = `${process.env.PUBLIC_URL}/mascot.png`;

function CopyButton({ text, label = 'Copy', className = '' }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return undefined;
        const timer = setTimeout(() => setCopied(false), 1600);
        return () => clearTimeout(timer);
    }, [copied]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch (e) {
            console.error('Copy failed', e);
        }
    };

    return (
        <button type="button" className={`copy-btn ${className}`} onClick={handleCopy}>
            {copied ? <FaCheck aria-hidden="true" /> : <FaRegCopy aria-hidden="true" />}
            <span>{copied ? 'Copied' : label}</span>
        </button>
    );
}

function CodeBlock({ children }) {
    const code = React.Children.toArray(children)[0];
    const className = code?.props?.className || '';
    const language = /language-([\w+#-]+)/.exec(className)?.[1] || 'code';
    const text = String(code?.props?.children ?? '').replace(/\n$/, '');

    return (
        <div className="code-block">
            <div className="code-block-header">
                <span className="code-block-lang">{language}</span>
                <CopyButton text={text} className="copy-btn-small" />
            </div>
            <pre>{children}</pre>
        </div>
    );
}

const markdownComponents = {
    table: ({ node, ...props }) => (
        <div className="table-wrap">
            <table {...props} />
        </div>
    ),
    a: ({ node, children, ...props }) => (
        <a {...props} target="_blank" rel="noopener noreferrer">
            {children}
        </a>
    ),
    pre: ({ node, children }) => <CodeBlock>{children}</CodeBlock>,
};

function Markdown({ text }) {
    return (
        <div className="message-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {text}
            </ReactMarkdown>
        </div>
    );
}

function AiAvatar() {
    return (
        <div className="ai-avatar" aria-hidden="true">
            <img src={MASCOT_SRC} alt="" />
        </div>
    );
}

function AiAnswer({ text, isStreaming = false, isError = false }) {
    return (
        <div className="msg ai">
            <AiAvatar />
            <div className={`answer${isStreaming ? ' is-streaming' : ''}${isError ? ' is-error' : ''}`}>
                <Markdown text={text} />
                {!isStreaming && !isError && (
                    <div className="answer-actions">
                        <CopyButton text={text} />
                    </div>
                )}
            </div>
        </div>
    );
}

function ThinkingIndicator() {
    return (
        <div className="msg ai">
            <AiAvatar />
            <div className="thinking" role="status" aria-label="Assistant is thinking">
                <span className="spinner" aria-hidden="true" />
                <span className="thinking-text">thinking it through…</span>
            </div>
        </div>
    );
}

function Intro({ suggestions, onPick }) {
    return (
        <div className="intro">
            <div className="msg ai">
                <div className="bubble ai bubble-strong">Mmm.., I can :</div>
            </div>
            <ul className="capabilities">
                {suggestions.map(({ icon: Icon, colors, text }) => (
                    <li key={text}>
                        <button
                            type="button"
                            className="capability"
                            onClick={() => onPick(text)}
                            style={{ '--c1': colors[0], '--c2': colors[1] }}
                        >
                            <span className="capability-icon" aria-hidden="true">
                                <Icon />
                            </span>
                            <span className="capability-text">{text}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const Chatbot = () => {
    const [messages, setMessages] = useState(loadSavedMessages);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeReply, setActiveReply] = useState(null);
    const [suggestions, setSuggestions] = useState(() => pickSuggestions());
    const [theme, setTheme, toggleTheme] = useTheme();
    const isDark = theme === 'dark';
    const lastUserMessageRef = useRef(null);
    const inputRef = useRef(null);
    const chatScrollRef = useRef(null);

    useEffect(() => {
        saveMessages(messages);
    }, [messages]);

    useEffect(() => {
        const el = chatScrollRef.current;
        if (el && el.scrollHeight > el.clientHeight) {
            el.style.scrollBehavior = 'auto';
            el.scrollTop = el.scrollHeight;
            el.style.scrollBehavior = '';
        }
    }, []);
    const scrollToUserMessageRef = useRef(false);
    const streamTextRef = useRef('');
    const thinkingTimerRef = useRef(null);

    useEffect(() => {
        if (scrollToUserMessageRef.current && lastUserMessageRef.current) {
            lastUserMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            scrollToUserMessageRef.current = false;
        }
    }, [messages]);

    useEffect(() => {
        return () => {
            if (thinkingTimerRef.current) {
                clearTimeout(thinkingTimerRef.current);
            }
        };
    }, []);

    const beginStreamingPhase = (thinkingStart) => {
        const elapsed = Date.now() - thinkingStart;
        const delay = Math.max(0, MIN_THINKING_MS - elapsed);

        const showStream = () => {
            setActiveReply({
                phase: 'streaming',
                text: streamTextRef.current,
            });
        };

        if (delay > 0) {
            thinkingTimerRef.current = setTimeout(showStream, delay);
        } else {
            showStream();
        }
    };

    const handleSend = async () => {
        const text = input.trim();
        if (text === '' || loading) return;

        const userMessage = { text, sender: 'user' };
        const history = buildHistory(messages, text);
        setInput('');
        setLoading(true);
        scrollToUserMessageRef.current = true;
        setMessages((prev) => [...prev, userMessage]);
        setActiveReply({ phase: 'thinking', text: '' });
        streamTextRef.current = '';

        const thinkingStart = Date.now();
        let streamingStarted = false;

        try {
            await streamChatMessage(history, {
                onChunk: (chunk) => {
                    streamTextRef.current += chunk;

                    if (!streamingStarted) {
                        streamingStarted = true;
                        beginStreamingPhase(thinkingStart);
                    } else {
                        setActiveReply({
                            phase: 'streaming',
                            text: streamTextRef.current,
                        });
                    }
                },
                onDone: () => {
                    if (thinkingTimerRef.current) {
                        clearTimeout(thinkingTimerRef.current);
                        thinkingTimerRef.current = null;
                    }
                    const finalText = streamTextRef.current.trim();
                    if (finalText) {
                        setMessages((prev) => [
                            ...prev,
                            { text: finalText, sender: 'ai' },
                        ]);
                    } else if (!streamingStarted) {
                        setMessages((prev) => [
                            ...prev,
                            { text: 'No response received. Please try again.', sender: 'ai', error: true },
                        ]);
                    }
                    setActiveReply(null);
                },
            });
        } catch (error) {
            console.error('Error streaming AI response', error);
            setMessages((prev) => [
                ...prev,
                {
                    text: buildStreamErrorMessage(error),
                    sender: 'ai',
                    error: true,
                },
            ]);
            setActiveReply(null);
        } finally {
            setLoading(false);
            streamTextRef.current = '';
        }
    };

    const handleInputChange = (e) => {
        setInput(e.target.value);
    };

    const handleNewChat = () => {
        if (loading) return;
        setMessages([]);
        setInput('');
        setSuggestions((prev) => pickSuggestions(prev));
        inputRef.current?.focus();
    };

    const handlePickCapability = (prompt) => {
        if (loading) return;
        setInput(prompt);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const lastUserIndex = messages.reduce(
        (acc, msg, i) => (msg.sender === 'user' ? i : acc),
        -1
    );

    return (
        <div className="app-shell">
            <header className="topbar">
                <div className="topbar-brand">
                    <span className="topbar-prompt" aria-hidden="true">&gt;_</span>
                    <span>
                        Chat with <strong className="brand-name">ChatBotAI</strong>
                    </span>
                </div>
                <div className="topbar-actions">
                    <button
                        type="button"
                        className="new-chat-btn"
                        onClick={handleNewChat}
                        disabled={loading || messages.length === 0}
                        aria-label="New chat"
                        title="Start a new chat"
                    >
                        <FaPlus aria-hidden="true" />
                        <span className="new-chat-label">New chat</span>
                    </button>
                    <ThemeSwitch isDark={isDark} onToggle={toggleTheme} onSelect={setTheme} />
                </div>
            </header>

            <div className={`layout${messages.length > 0 || activeReply ? ' has-chat' : ''}`}>
                <section className="hero">
                    <div className="mascot" aria-hidden="true">
                        <img src={`${process.env.PUBLIC_URL}/mascot.png`} alt="" />
                    </div>
                    <h1 className="hero-title">
                        Ask anything{' '}
                        <span className="hero-emoji-group">
                            <span className="hero-emoji">💬</span>
                            <span className="hero-emoji">⚡</span>,
                        </span>{' '}
                        <br />
                        Learn &amp; Build
                    </h1>
                    <p className="hero-text">
                        Answers, explanations and ideas for almost anything — code, studies,
                        writing and planning. Powered by Spring AI + Groq 🤖
                    </p>
                </section>

                <section className="chat-panel" aria-label="Chat">
                    <div className="chat-scroll" ref={chatScrollRef}>
                        <Intro suggestions={suggestions} onPick={handlePickCapability} />

                        {messages.map((message, index) =>
                            message.sender === 'user' ? (
                                <div
                                    key={index}
                                    className="msg user"
                                    ref={index === lastUserIndex ? lastUserMessageRef : null}
                                >
                                    <div className="bubble user">
                                        <p className="message-plain">{message.text}</p>
                                    </div>
                                </div>
                            ) : (
                                <AiAnswer key={index} text={message.text} isError={message.error} />
                            )
                        )}

                        {activeReply &&
                            (activeReply.phase === 'thinking' ? (
                                <ThinkingIndicator />
                            ) : (
                                <AiAnswer text={activeReply.text} isStreaming={loading} />
                            ))}
                    </div>

                    <footer className="composer">
                        <div className="composer-box">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder="Message ChatBotAI..."
                                disabled={loading}
                            />
                            <button
                                type="button"
                                className="send-btn"
                                onClick={handleSend}
                                disabled={loading || input.trim() === ''}
                                aria-label="Send message"
                            >
                                <span className="send-label">Send</span>
                                <FaPaperPlane aria-hidden="true" />
                            </button>
                        </div>
                        <p className="composer-hint">AI can make mistakes. Verify important information.</p>
                    </footer>
                </section>
            </div>
        </div>
    );
};

export default Chatbot;
