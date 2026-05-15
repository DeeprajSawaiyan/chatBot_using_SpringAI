# Spring AI Chatbot

Documentation for this repository: what it does, what changed recently, how it is structured, which technologies it uses, how requests flow through the system, and how to run it locally or with Docker.

---

## Abstract

This project is a **full-stack chat assistant** demo. A **React** web UI collects user messages and sends them to a **Spring Boot** backend. The backend uses **Spring AI** with an **OpenAI-compatible** HTTP API; by default it targets **Groq** (see `application.yaml`). The repository is split into two applications (`spring-boot-ai-chatbot` and `chatbot-ui`) and can be orchestrated with **Docker Compose** so the API and the static UI run in containers on a shared network.

---

## What's new (recent updates)

These updates extend the original template: Groq-oriented configuration, safer secrets handling, a smoother dev experience, and clearer errors.

| Area | What was added or changed |
|------|---------------------------|
| **Groq** | `application.yaml` sets `spring.ai.openai.base-url` to Groq’s OpenAI-compatible endpoint and `spring.ai.openai.chat.options.model` to **`llama-3.1-8b-instant`**. `spring.application.name` is **`demo`**. Debug logging is enabled for **`org.springframework.ai`**. |
| **Secrets** | No API keys in git. `groq.api.key: ${GROQ_API_KEY:}` feeds `spring.ai.openai.api-key`. Create a key in the [Groq Console](https://console.groq.com/) → **API keys**, then `export GROQ_API_KEY="gsk_..."` before starting the backend (Compose passes the same variable). |
| **Chat API** | `GET /ai/chat/string` returns **plain text** via `OpenAiChatModel.call(Prompt)` (fits axios). If the key is missing → **503** with an explicit message; Groq/upstream failures → **502** with a short reason (shown in the UI). Streaming `GET /ai/chat` is unchanged. |
| **CORS** | `WebConfig` uses **`allowedOriginPatterns`** for `http://localhost:*` and `http://127.0.0.1:*`, allows **OPTIONS**, and supports credentials when browsers send them. |
| **Frontend** | **Functional** `setMessages` updates, **`axios` `params`** for query encoding, optional **`REACT_APP_API_BASE_URL`**, **`react-icons`** for send + avatars, **`onKeyDown`** for Enter, disabled send while loading, and **structured error messages** (network vs HTTP status vs configuration). |
| **Dev proxy** | `chatbot-ui/package.json` **`"proxy": "http://localhost:8080"`** — in development the UI calls **`/ai/...`** on the CRA origin and the dev server forwards to Spring Boot (avoids cross-origin issues). Prefer leaving `REACT_APP_API_BASE_URL` unset in dev so the proxy is used. |
| **Docker** | Backend **multi-stage Dockerfile** (Maven build + Eclipse Temurin JRE). **`docker-compose.yaml`** injects **`GROQ_API_KEY`** into the backend container. |
| **Tests / tooling** | `App.test.js` targets the chat placeholder; Jest **`transformIgnorePatterns`** includes **`axios`** so ESM axios runs under `react-scripts` tests. |
| **Examples** | `chatbot-ui/.env.example` documents when to set `REACT_APP_API_BASE_URL` (production / non-default hosts). |

**Note:** Per-client `connection-timeout` / `read-timeout` properties for Groq are **not** part of Spring AI **1.0.0-M1** configuration metadata for this starter; custom timeouts would require a dedicated HTTP client bean if you need them later.

---

## System architecture

At a high level, the browser loads the React app (served by nginx in production/Docker). The UI calls the Spring Boot REST API on port **8080**. Spring Boot uses **Spring AI** (`OpenAiChatModel`) against the configured **base URL** (default: Groq) and returns model output to the client.

```mermaid
flowchart LR
  subgraph Client["Browser"]
    UI["React SPA\n(chatbot-ui)"]
  end

  subgraph Server["Spring Boot\n(spring-boot-ai-chatbot)"]
    API["REST controllers\n(ChatController)"]
    AI["Spring AI\nOpenAiChatModel"]
  end

  subgraph External["External"]
    OAI["Groq API\n(OpenAI-compatible)"]
  end

  UI -->|"HTTP GET\n/ai/chat/string"| API
  API --> AI
  AI --> OAI
```

**Deployment shape (Docker Compose)**

- **springboot-app**: JVM running the packaged Spring Boot JAR, port `8080` published to the host.
- **react-ui**: Multi-stage build (Node builds the app, nginx serves static files), host port `3000` mapped to container port `80`.

**How the UI reaches the API:** In **development**, Create React App **`proxy`** forwards same-origin **`/ai/*`** to `http://localhost:8080`. In **production** (e.g. static build), the UI defaults to **`http://localhost:8080`** unless you set **`REACT_APP_API_BASE_URL`** at build time (see `chatbot-ui/.env.example`). When the UI and API are both on `localhost` with published ports, that default matches a typical local Docker setup.

---

## Tech stack

| Layer | Technology | Notes |
|--------|------------|--------|
| Backend runtime | Java **17** | Required by Spring Boot 3.x parent. |
| Backend framework | **Spring Boot** `3.3.3` | Web stack, auto-configuration. |
| AI integration | **Spring AI** `1.0.0-M1` (`spring-ai-openai-spring-boot-starter`) | Milestone BOM from Spring Milestones repository. |
| LLM provider | **Groq** (default) | OpenAI-compatible API; model **`llama-3.1-8b-instant`** in `application.yaml`. Point `base-url` and model elsewhere to use OpenAI or another compatible host. |
| Backend build | **Maven** | `pom.xml` in `spring-boot-ai-chatbot/`. |
| Frontend | **React** `18`, **Create React App** (`react-scripts` `5.0.1`) | SPA in `chatbot-ui/`. |
| HTTP client (UI) | **axios** | `GET` requests to the backend. |
| Icons (UI) | **react-icons** | Send button, user and assistant avatars. |
| Frontend container | **Node 16** (build) + **nginx alpine** (serve) | See `chatbot-ui/Dockerfile`. |
| Backend container | **Eclipse Temurin 17 JRE** (Alpine) | Multi-stage image: Maven builds the JAR, runtime stage runs **`java -jar`**. |
| Orchestration | **Docker Compose** `3.8` | Root `docker-compose.yaml`. |

---

## Control flow

End-to-end flow when the user sends a message from the UI:

1. **User input** — The user types in the input field and submits (button or Enter) in `Chatbot.js`.
2. **Optimistic UI** — The client appends a **user** message to local React state and clears the input; a loading state may show for the assistant.
3. **HTTP request** — The frontend issues an **axios** `GET` to `/ai/chat/string` with a `message` query parameter (encoded via axios `params`).
4. **CORS** — `WebConfig` allows `http://localhost:*` and `http://127.0.0.1:*` for cross-origin browser calls.
5. **Controller** — `ChatController` handles `/ai/chat/string`, calls `OpenAiChatModel.call(Prompt)` and returns plain text. A separate endpoint `/ai/chat` streams `ChatResponse` from a `Prompt` built with a `UserMessage`.
6. **Spring AI** — The OpenAI-compatible client uses `application.yaml` (`spring.ai.openai.base-url`, model, and API key). This project defaults the base URL to **Groq**; the key is supplied via **`GROQ_API_KEY`** (see `application.yaml`).
7. **Response handling** — The UI assigns `response.data` to an **ai** message in state and renders the thread in the chat panel.

```mermaid
sequenceDiagram
  participant U as User
  participant R as React Chatbot
  participant S as Spring ChatController
  participant M as OpenAiChatModel
  participant O as Groq API

  U->>R: Submit message
  R->>R: Update messages state (user)
  R->>S: GET /ai/chat/string?message=...
  S->>M: call(Prompt)
  M->>O: Chat completions API (Groq / OpenAI-compatible)
  O-->>M: Completion
  M-->>S: ChatResponse
  S-->>R: Plain text body
  R->>R: Append AI message to state
  R->>U: Render updated chat
```

---

## How to run

### Prerequisites

- **Groq API key** (or another key compatible with your `spring.ai.openai.base-url`). This repo wires the key through **`GROQ_API_KEY`** into `spring.ai.openai.api-key` via `application.yaml`.
- **Java 17** and **Maven** (for local backend).
- **Node.js** and **npm** (for local frontend).
- Optional: **Docker** and **Docker Compose** for containerized run.

### Configure the API key

Set **`GROQ_API_KEY`** before starting the backend (never commit the real value to git):

```bash
export GROQ_API_KEY="gsk_..."
```

For Docker Compose, set the variable in `docker-compose.yaml` or use an `.env` file; avoid wrapping the real secret in extra quote characters if your environment already treats the value as a single string.

### Run the backend locally

From the `spring-boot-ai-chatbot` directory:

```bash
cd spring-boot-ai-chatbot
mvn spring-boot:run
```

The API listens on **port 8080** by default.

### Run the frontend locally

From the `chatbot-ui` directory:

```bash
cd chatbot-ui
npm install
npm start
```

The dev server runs on **http://localhost:3000**. In development, `chatbot-ui/package.json` sets **`"proxy": "http://localhost:8080"`** so the UI calls **`/ai/...` on the same origin** and Create React App forwards them to the backend (avoids CORS). Do **not** set `REACT_APP_API_BASE_URL` to `http://localhost:8080` in dev unless you need to; that forces a cross-origin call to port 8080 instead of using the proxy.

### Run with Docker Compose

1. Export your Groq API key in the same shell (Compose substitutes it into the backend service):

   ```bash
   export GROQ_API_KEY="gsk_..."
   ```

2. From the repository root:

   ```bash
   docker compose up --build
   ```

   The backend image uses a **multi-stage Dockerfile** that runs `mvn package` inside the container, so you do not need to build the JAR on the host first.

3. Open the UI at **http://localhost:3000** (mapped to nginx on port 80 inside the `react-ui` container). Ensure the backend is reachable at the URL the UI uses (`localhost:8080` on the host when using published ports).

### Optional checks

- **Backend health**: Open `http://localhost:8080/ai/chat/string?message=Hello` in a browser or use `curl` once the app is up.
- **Tests**: In `chatbot-ui`, run `CI=true npm test -- --watchAll=false`. Jest is configured to transform the ESM `axios` package.

---

## Repository layout

| Path | Purpose |
|------|---------|
| `spring-boot-ai-chatbot/` | Maven project: controllers, CORS config, `application.yaml`, Dockerfile. |
| `chatbot-ui/` | CRA React app: `Chatbot` component, styles, Dockerfile (build + nginx). |
| `chatbot-ui/.env.example` | Optional env template for `REACT_APP_API_BASE_URL` (production / custom API host). |
| `docker-compose.yaml` | Builds and runs both services; passes `GROQ_API_KEY` to the backend. |

---

## License and attribution

See the original project or author notes in source packages (`in.deepraj.ai.chatbot`) for ownership and licensing if applicable.
