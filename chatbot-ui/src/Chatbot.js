import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FaPaperPlane, FaRobot, FaUserCircle } from 'react-icons/fa';
import './Chatbot.css';

const GREETING_MESSAGE =
    "Hello! 👋 I'm your AI assistant. Ask me anything — I'm here to help.";

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

async function streamChatMessage(message, callbacks) {
    const path = `/ai/chat/stream?message=${encodeURIComponent(message)}`;
    const url = apiBaseUrl === '' ? path : `${apiBaseUrl}${path}`;
    const response = await fetch(url);

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
            errorText.trim() || `Request failed (${response.status}). Check backend logs.`
        );
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

function MessageContent({ message }) {
    if (message.sender === 'ai') {
        return (
            <div className="message-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
            </div>
        );
    }
    return <p className="message-plain">{message.text}</p>;
}

function ThinkingIndicator() {
    return (
        <div className="thinking-block" aria-live="polite" aria-label="Assistant is thinking">
            <span className="thinking-icon">✦</span>
            <span className="thinking-label">Thinking</span>
            <span className="thinking-dots">
                <span />
                <span />
                <span />
            </span>
        </div>
    );
}

function StreamingContent({ text, isStreaming }) {
    return (
        <div className="streaming-content">
            {isStreaming ? (
                <pre className="message-streaming-text">{text}</pre>
            ) : (
                <div className="message-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                </div>
            )}
            {isStreaming && <span className="stream-cursor" aria-hidden="true" />}
        </div>
    );
}

const Chatbot = () => {
    const [messages, setMessages] = useState([
        { text: GREETING_MESSAGE, sender: 'ai' },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeReply, setActiveReply] = useState(null);
    const lastUserMessageRef = useRef(null);
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
        setInput('');
        setLoading(true);
        scrollToUserMessageRef.current = true;
        setMessages((prev) => [...prev, userMessage]);
        setActiveReply({ phase: 'thinking', text: '' });
        streamTextRef.current = '';

        const thinkingStart = Date.now();
        let streamingStarted = false;

        try {
            await streamChatMessage(text, {
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
                            { text: 'No response received. Please try again.', sender: 'ai' },
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
        <div className="chatbot-container">
            <header className="chat-header">
                <FaRobot className="chat-header-icon" aria-hidden="true" />
                <h1 className="chat-title">AI Assistant</h1>
            </header>

            <main className="chat-messages">
                <div className="messages-inner">
                    {messages.map((message, index) => (
                        <div
                            key={index}
                            className={`message-row ${message.sender}`}
                            ref={index === lastUserIndex ? lastUserMessageRef : null}
                        >
                            <div className="message-avatar" aria-hidden="true">
                                {message.sender === 'user' ? (
                                    <FaUserCircle className="avatar-icon avatar-user" />
                                ) : (
                                    <FaRobot className="avatar-icon avatar-ai" />
                                )}
                            </div>
                            <div className={`message-bubble ${message.sender}`}>
                                <MessageContent message={message} />
                            </div>
                        </div>
                    ))}
                    {activeReply && (
                        <div className="message-row ai">
                            <div className="message-avatar" aria-hidden="true">
                                <FaRobot className="avatar-icon avatar-ai" />
                            </div>
                            <div className="message-bubble ai">
                                {activeReply.phase === 'thinking' ? (
                                    <ThinkingIndicator />
                                ) : (
                                    <StreamingContent
                                        text={activeReply.text}
                                        isStreaming={loading}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <footer className="chat-input-bar">
                <div className="input-wrapper">
                    <input
                        type="text"
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Message AI Assistant..."
                        disabled={loading}
                    />
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={loading || input.trim() === ''}
                        aria-label="Send message"
                    >
                        <FaPaperPlane />
                    </button>
                </div>
                <p className="input-hint">AI can make mistakes. Verify important information.</p>
            </footer>
        </div>
    );
};

export default Chatbot;
