// Speech Searcher - Frontend Application Logic

const MAX_QUESTION_LENGTH = 2000;

class SpeechSearcher {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.abortController = null;
        this._pendingAutoSubmit = false;

        this.initializeElements();
        this.initializeSpeechRecognition();
        this.attachEventListeners();
        this.checkServerHealth();
        this.loadAvailableModels();
    }

    initializeElements() {
        this.serverStatusEl = document.getElementById('serverStatus');
        this.ollamaStatusEl = document.getElementById('ollamaStatus');
        this.modelSelectEl = document.getElementById('modelSelect');

        this.micButton = document.getElementById('micButton');
        this.listeningIndicator = document.getElementById('listeningIndicator');
        this.questionInput = document.getElementById('questionInput');
        this.charCount = document.getElementById('charCount');
        this.askButton = document.getElementById('askButton');
        this.cancelButton = document.getElementById('cancelButton');

        this.responseSection = document.getElementById('responseSection');
        this.responseText = document.getElementById('responseText');
        this.typingIndicator = document.querySelector('.typing-indicator');

        this.errorSection = document.getElementById('errorSection');
        this.errorMessage = document.getElementById('errorMessage');
    }

    initializeSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('Speech Recognition API not supported in this browser');
            this.micButton.disabled = true;
            this.micButton.querySelector('.mic-text').textContent = 'Not Supported';
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            this.micButton.classList.add('listening');
            this.listeningIndicator.classList.remove('hidden');
            this.micButton.querySelector('.mic-text').textContent = 'Listening...';
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript) {
                this._pendingAutoSubmit = true;
                this.questionInput.value = finalTranscript.trim();
                this.updateCharCount();
            } else if (interimTranscript) {
                this.questionInput.value = interimTranscript.trim();
                this.updateCharCount();
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.micButton.classList.remove('listening');
            this.listeningIndicator.classList.add('hidden');
            this.micButton.querySelector('.mic-text').textContent = 'Click to Speak';

            if (this._pendingAutoSubmit && this.questionInput.value.trim()) {
                this._pendingAutoSubmit = false;
                setTimeout(() => this.askQuestion(), 300);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.isListening = false;
            this._pendingAutoSubmit = false;
            this.micButton.classList.remove('listening');
            this.listeningIndicator.classList.add('hidden');
            this.micButton.querySelector('.mic-text').textContent = 'Click to Speak';

            let errorMsg;
            switch (event.error) {
                case 'no-speech':
                    errorMsg = 'No speech detected. Please try again.';
                    break;
                case 'audio-capture':
                    errorMsg = 'No microphone found. Please ensure your microphone is connected.';
                    break;
                case 'not-allowed':
                    errorMsg = 'Microphone access denied. Please allow microphone access in your browser settings.';
                    break;
                default:
                    errorMsg = `Speech recognition error: ${event.error}`;
            }

            this.showError(errorMsg);
        };
    }

    attachEventListeners() {
        this.micButton.addEventListener('click', () => this.toggleListening());
        this.askButton.addEventListener('click', () => this.askQuestion());
        this.cancelButton.addEventListener('click', () => this.cancelRequest());

        this.questionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.askQuestion();
            }
        });

        this.questionInput.addEventListener('input', () => this.updateCharCount());
    }

    updateCharCount() {
        const len = this.questionInput.value.length;
        this.charCount.textContent = `${len} / ${MAX_QUESTION_LENGTH}`;
        this.charCount.classList.toggle('over-limit', len > MAX_QUESTION_LENGTH);
    }

    toggleListening() {
        if (!this.recognition) {
            this.showError('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
            return;
        }

        if (this.isListening) {
            this.recognition.stop();
        } else {
            try {
                this.hideError();
                this._pendingAutoSubmit = false;
                this.recognition.start();
            } catch (error) {
                console.error('Failed to start speech recognition:', error);
                this.showError('Failed to start speech recognition. Please try again.');
            }
        }
    }

    async checkServerHealth() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();

            this.serverStatusEl.textContent = data.status === 'healthy' ? 'Connected' : 'Disconnected';
            this.serverStatusEl.className = `status-value ${data.status === 'healthy' ? 'healthy' : 'unhealthy'}`;

            this.ollamaStatusEl.textContent = data.ollama === 'connected' ? 'Connected' : 'Disconnected';
            this.ollamaStatusEl.className = `status-value ${data.ollama === 'connected' ? 'healthy' : 'unhealthy'}`;

            if (data.status !== 'healthy' || data.ollama !== 'connected') {
                this.showError('Cannot connect to Ollama. Please ensure Ollama is running on your system.');
            }
        } catch (error) {
            console.error('Health check failed:', error);
            this.serverStatusEl.textContent = 'Error';
            this.serverStatusEl.className = 'status-value unhealthy';
            this.ollamaStatusEl.textContent = 'Unknown';
            this.ollamaStatusEl.className = 'status-value unhealthy';
            this.showError('Cannot connect to server. Please ensure the server is running.');
        }
    }

    async loadAvailableModels() {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();

            if (data.success && data.models && data.models.length > 0) {
                this.modelSelectEl.innerHTML = '';
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = model.name;
                    this.modelSelectEl.appendChild(option);
                });
            } else {
                this.showError('No models found in Ollama. Please pull a model first (e.g. ollama pull llama2).');
            }
        } catch (error) {
            console.error('Failed to load models:', error);
            this.showError('Failed to load available models. Please check Ollama is running.');
        }
    }

    cancelRequest() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    async askQuestion() {
        const question = this.questionInput.value.trim();

        if (!question) {
            this.showError('Please enter or speak a question first.');
            return;
        }

        if (question.length > MAX_QUESTION_LENGTH) {
            this.showError(`Question is too long. Maximum ${MAX_QUESTION_LENGTH} characters.`);
            return;
        }

        // Cancel any in-flight request before starting a new one
        this.cancelRequest();

        this.askButton.disabled = true;
        this.micButton.disabled = true;
        this.questionInput.disabled = true;
        this.cancelButton.classList.remove('hidden');

        this.hideError();
        this.responseSection.classList.remove('hidden');
        this.responseText.textContent = '';
        this.typingIndicator.classList.remove('hidden');

        try {
            await this.streamResponse(question);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error asking question:', error);
                this.showError(`Failed to get response: ${error.message}`);
                this.responseSection.classList.add('hidden');
            }
        } finally {
            this.askButton.disabled = false;
            this.micButton.disabled = false;
            this.questionInput.disabled = false;
            this.cancelButton.classList.add('hidden');
            this.typingIndicator.classList.add('hidden');
            this.abortController = null;
        }
    }

    async streamResponse(question) {
        this.abortController = new AbortController();

        const response = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question,
                model: this.modelSelectEl.value
            }),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            let errMsg = `HTTP error ${response.status}`;
            try {
                const body = await response.json();
                if (body.error) errMsg = body.error;
            } catch (_) { /* ignore */ }
            throw new Error(errMsg);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lineBuffer += decoder.decode(value, { stream: true });

            // Process all complete lines in the buffer
            const lines = lineBuffer.split('\n');
            // Keep the last (possibly incomplete) line in the buffer
            lineBuffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const data = JSON.parse(line.substring(6));
                    if (data.type === 'chunk') {
                        this.responseText.textContent += data.content;
                    } else if (data.type === 'done') {
                        return;
                    } else if (data.type === 'error') {
                        throw new Error(data.error);
                    }
                } catch (e) {
                    if (!(e instanceof SyntaxError)) throw e;
                    console.error('Failed to parse SSE line:', line, e);
                }
            }
        }
    }

    showError(message) {
        this.errorSection.classList.remove('hidden');
        this.errorMessage.textContent = message;
    }

    hideError() {
        this.errorSection.classList.add('hidden');
        this.errorMessage.textContent = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SpeechSearcher();
});
