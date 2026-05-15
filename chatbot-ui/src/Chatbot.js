import React, { useState } from 'react';
import axios from 'axios';
import { FaPaperPlane, FaRobot, FaUserCircle } from 'react-icons/fa';
import './Chatbot.css';

function resolveApiBaseUrl() {
    const raw = process.env.REACT_APP_API_BASE_URL;
    if (raw != null && String(raw).trim() !== '') {
        return String(raw).replace(/\/$/, '');
    }
    // Dev server: same-origin + package.json "proxy" → no CORS to :8080
    if (process.env.NODE_ENV === 'development') {
        return '';
    }
    return 'http://localhost:8080';
}

const apiBaseUrl = resolveApiBaseUrl();

function buildChatErrorMessage(error) {
    if (axios.isAxiosError(error)) {
        if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
            return (
                `Cannot reach the backend (${apiBaseUrl || window.location.origin}). ` +
                'Start Spring Boot on port 8080, or set REACT_APP_API_BASE_URL in chatbot-ui/.env. ' +
                'In development, keep the default so the CRA proxy can forward /ai/* to :8080.'
            );
        }
        const status = error.response?.status;
        const data = error.response?.data;
        let serverMsg = '';
        if (typeof data === 'string') {
            serverMsg = data.trim();
        } else if (data && typeof data === 'object') {
            serverMsg = (data.message || data.error || data.detail || '').toString().trim();
        }
        if (status === 401 || status === 403) {
            return 'The API key was rejected (401/403). Set GROQ_API_KEY for the backend and restart.';
        }
        if (status === 503) {
            return serverMsg || 'Service unavailable. Often means GROQ_API_KEY is missing — export it and restart the backend.';
        }
        if (status === 502) {
            return serverMsg || 'Bad gateway: Groq (or upstream) returned an error. Check backend logs and your key.';
        }
        if (status === 500) {
            return (
                (serverMsg ? `Server error: ${serverMsg}` : 'Server error (500).') +
                ' Check backend logs; set GROQ_API_KEY if you use Groq.'
            );
        }
        if (status) {
            return serverMsg ? `Request failed (${status}): ${serverMsg}` : `Request failed (${status}).`;
        }
    }
    return error?.message ? `Error: ${error.message}` : 'An unexpected error occurred.';
}

const Chatbot = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        const text = input.trim();
        if (text === '') return;

        const userMessage = { text, sender: 'user' };
        setInput('');
        setLoading(true);
        setMessages((prev) => [...prev, userMessage]);

        try {
            const path = '/ai/chat/string';
            const url = apiBaseUrl === '' ? path : `${apiBaseUrl}${path}`;
            const response = await axios.get(url, {
                params: { message: text },
            });
            const reply =
                typeof response.data === 'string'
                    ? response.data
                    : String(response.data ?? '');
            const aiMessage = { text: reply, sender: 'ai' };
            setMessages((prev) => [...prev, aiMessage]);
        } catch (error) {
            console.error('Error fetching AI response', error);
            setMessages((prev) => [
                ...prev,
                {
                    text: buildChatErrorMessage(error),
                    sender: 'ai',
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        setInput(e.target.value);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <div className="chatbot-container">
            <div className="chat-header">
                <div className="chat-logo-wrap" aria-hidden="true">
                    <FaRobot className="chat-logo-icon" />
                </div>
                <div className="breadcrumb">Home &gt; Chat</div>
            </div>
            <div className="chatbox">
                {messages.map((message, index) => (
                    <div key={index} className={`message-container ${message.sender}`}>
                        {message.sender === 'user' ? (
                            <FaUserCircle className="avatar avatar-user" title="You" />
                        ) : (
                            <FaRobot className="avatar avatar-ai" title="Assistant" />
                        )}
                        <div className={`message ${message.sender}`}>{message.text}</div>
                    </div>
                ))}
                {loading && (
                    <div className="message-container ai">
                        <FaRobot className="avatar avatar-ai" title="Assistant" />
                        <div className="message ai">...</div>
                    </div>
                )}
            </div>
            <div className="input-container">
                <input
                    type="text"
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message..."
                />
                <button type="button" onClick={handleSend} disabled={loading}>
                    <FaPaperPlane />
                </button>
            </div>
        </div>
    );
};

export default Chatbot;
