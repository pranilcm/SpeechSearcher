# Speech Searcher

A voice-powered Q&A application. Speak or type a question and get a streaming AI response from a local [Ollama](https://ollama.ai) instance.

## Speech Recognition

Uses the browser's native [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) — no external service or API key required. Audio is processed entirely by the browser/OS built-in engine.

**Supported browsers:** Chrome, Edge, Safari
**Not supported:** Firefox

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- [Ollama](https://ollama.ai) running locally with at least one model pulled

```bash
# Pull a model if you haven't already
ollama pull llama2
```

## Setup

```bash
# Install dependencies
npm install

# Copy the example env file and edit as needed
cp .env.example .env
```

## Running

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API base URL |
| `NODE_ENV` | `development` | Set to `production` to restrict CORS |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serves the web app |
| `GET` | `/api/health` | Server and Ollama connectivity check |
| `GET` | `/api/models` | Lists available Ollama models |
| `POST` | `/api/ask` | Ask a question (streams response via SSE) |

### POST /api/ask

Request body:
```json
{
  "question": "What is the speed of light?",
  "model": "llama2"
}
```

Streams back Server-Sent Events:
```
data: {"type":"chunk","content":"The speed..."}
data: {"type":"done","fullResponse":"The speed of light is..."}
```

## Project Structure

```
SpeechSearcher/
├── public/
│   ├── index.html      # UI
│   ├── app.js          # Frontend logic
│   └── styles.css      # Styles
├── server/
│   ├── index.js        # Express server
│   └── package.json    # Server dependencies
├── .env.example        # Environment variable template
└── package.json        # Root workspace manifest
```

## Usage

1. Click the microphone button and speak your question — it auto-submits when you stop talking
2. Or type a question and press **Ask Question** (or hit Enter)
3. Select a different model from the dropdown if you have multiple pulled
4. Click **Cancel** to stop a streaming response mid-way
