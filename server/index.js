import express from 'express';
import cors from 'cors';
import { Ollama } from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_QUESTION_LENGTH = 2000;

// Restrict CORS to the local server origin in production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? `http://localhost:${PORT}`
    : '*',
  methods: ['GET', 'POST'],
};

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434'
});

// In-flight request tracking for rate limiting (one concurrent /api/ask at a time per this process)
let activeAskCount = 0;
const MAX_CONCURRENT_ASKS = 5;

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', async (_req, res) => {
  try {
    await ollama.list();
    res.json({
      status: 'healthy',
      ollama: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      ollama: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/models', async (_req, res) => {
  try {
    const models = await ollama.list();
    res.json({
      success: true,
      models: models.models.map(m => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at
      }))
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch models from Ollama'
    });
  }
});

app.post('/api/ask', async (req, res) => {
  const { question, model } = req.body;

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Question is required and must be a non-empty string'
    });
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({
      success: false,
      error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer`
    });
  }

  // Validate model against known models
  let validatedModel;
  try {
    const available = await ollama.list();
    const knownNames = available.models.map(m => m.name);
    if (!model || !knownNames.includes(model)) {
      validatedModel = knownNames[0];
      if (!validatedModel) {
        return res.status(400).json({
          success: false,
          error: 'No models available in Ollama'
        });
      }
    } else {
      validatedModel = model;
    }
  } catch (error) {
    return res.status(503).json({
      success: false,
      error: 'Could not reach Ollama to validate model'
    });
  }

  if (activeAskCount >= MAX_CONCURRENT_ASKS) {
    return res.status(429).json({
      success: false,
      error: 'Too many concurrent requests. Please try again shortly.'
    });
  }

  activeAskCount++;

  // Set SSE headers before streaming begins
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Abort stream if the SSE response connection closes (client cancel or disconnect)
  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    console.log(`Processing question with model ${validatedModel}:`, question.substring(0, 80));

    const systemPrompt = `You are a helpful AI assistant. Provide concise, accurate, and to-the-point answers.
Keep responses clear and brief unless more detail is specifically requested.
Focus on being informative while respecting the user's time.`;

    const stream = await ollama.chat({
      model: validatedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      stream: true
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      if (aborted) break;

      if (chunk.message && chunk.message.content) {
        const content = chunk.message.content;
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
      }

      if (chunk.done) {
        res.write(`data: ${JSON.stringify({ type: 'done', fullResponse })}\n\n`);
        break;
      }
    }

    res.end();
  } catch (error) {
    console.error('Error processing question:', error);
    if (!res.writableEnded) {
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to get response from Ollama' })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to get response from Ollama'
        });
      }
    }
  } finally {
    activeAskCount--;
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err, _req, res, _next) => {
  console.error('Unexpected error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`\n🎙️  Speech Searcher Server running on http://localhost:${PORT}`);
  console.log(`📡 Ollama host: ${process.env.OLLAMA_HOST || 'http://localhost:11434'}`);
  console.log(`\n📝 Available endpoints:`);
  console.log(`   GET  /              - Main application`);
  console.log(`   GET  /api/health    - Health check`);
  console.log(`   GET  /api/models    - List Ollama models`);
  console.log(`   POST /api/ask       - Ask a question\n`);
});
