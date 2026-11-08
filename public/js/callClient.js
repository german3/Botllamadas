/**
 * VoxPulse Call Client
 * Simulador de llamadas de voz bidireccional en tiempo real con Web Audio,
 * Reconocimiento de Voz (STT), Síntesis de Voz (TTS) y Resumen Automático.
 */

class CallClient {
  constructor() {
    this.callId = null;
    this.assistant = null;
    this.status = 'idle'; // 'idle' | 'connecting' | 'in-call' | 'bot-speaking' | 'user-speaking' | 'ended'
    this.isMuted = false;
    this.startTime = null;
    this.timerInterval = null;
    this.transcript = [];

    // Audio & STT / TTS
    this.recognition = null;
    this.synth = window.speechSynthesis;
    this.currentUtterance = null;
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.animationFrameId = null;

    this.initAudioContext();
    this.initSpeechRecognition();
  }

  initAudioContext() {
    const canvas = document.getElementById('audio-visualizer-canvas');
    if (!canvas) return;
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext('2d');
    this.drawIdleVisualizer();
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Reconocimiento de voz no soportado por este navegador. Puedes usar el chat manual.');
      const feedback = document.getElementById('live-speech-feedback');
      if (feedback) feedback.textContent = 'Nota: Tu navegador no soporta Web Speech API. Puedes escribir tus mensajes abajo.';
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'es-MX';

    let finalTranscript = '';
    let silenceTimeout = null;

    this.recognition.onstart = () => {
      if (this.status === 'in-call' && !this.isMuted) {
        this.updateSpeechFeedback('Escuchando tu voz...');
      }
    };

    this.recognition.onresult = (event) => {
      // Si el bot está hablando, no capturar para evitar eco
      if (this.status === 'bot-speaking') return;

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const activeText = (finalTranscript + ' ' + interim).trim();
      if (activeText.length > 0) {
        this.setCallStatus('user-speaking');
        this.updateSpeechFeedback(`Diciendo: "${activeText}"`);

        // Detección de silencio para enviar el turno
        clearTimeout(silenceTimeout);
        silenceTimeout = setTimeout(() => {
          if (activeText.length > 0 && this.status !== 'bot-speaking') {
            const messageToSend = activeText;
            finalTranscript = '';
            this.sendUserTurn(messageToSend);
          }
        }, 1200);
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech') {
        console.warn('Error en SpeechRecognition:', event.error);
      }
    };

    this.recognition.onend = () => {
      // Si la llamada sigue activa y no es el bot quien habla, reiniciar el reconocimiento
      if (this.status === 'in-call' || this.status === 'user-speaking') {
        try {
          this.recognition.start();
        } catch (e) {}
      }
    };
  }

  /**
   * Inicia la llamada
   */
  async startCall(assistant) {
    if (!assistant) return;
    this.assistant = assistant;
    this.setCallStatus('connecting');
    this.transcript = [];
    this.recordedChunks = [];
    this.renderTranscriptFeed();

    try {
      // 1. Obtener acceso al micrófono para visualizador y grabación
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.setupAudioVisualizer(this.mediaStream);
          this.setupMediaRecorder(this.mediaStream);
        } catch (micErr) {
          console.warn('No se pudo acceder al micrófono:', micErr);
          this.updateSpeechFeedback('Micrófono no disponible. Puedes usar el teclado para chatear.');
        }
      }

      // 2. Notificar al backend el inicio de llamada
      const res = await fetch('/api/calls/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId: this.assistant.id })
      });
      const data = await res.json();
      this.callId = data.call.id;

      // Iniciar cronómetro
      this.startTime = Date.now();
      this.timerInterval = setInterval(() => this.updateTimer(), 1000);

      // Estado activo
      this.setCallStatus('in-call');
      document.getElementById('btn-toggle-mic').disabled = false;
      this.updateCallControls(true);

      // 3. Reproducir saludo inicial del bot
      if (data.firstMessage) {
        this.addTranscriptTurn({
          role: 'assistant',
          content: data.firstMessage,
          timestamp: new Date().toLocaleTimeString()
        });
        await this.speakBotMessage(data.firstMessage);
      }

      // 4. Iniciar escucha del micrófono
      if (this.recognition) {
        try { this.recognition.start(); } catch (e) {}
      }

    } catch (err) {
      console.error('Error al iniciar llamada:', err);
      alert('Error iniciando la llamada. Revisa la consola.');
      this.endCall();
    }
  }

  /**
   * Envía el mensaje del usuario al backend y procesa la respuesta
   */
  async sendUserTurn(text) {
    if (!text || !this.callId) return;

    // Pausar reconocimiento mientras el bot piensa y habla
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

    // Agregar turno del usuario
    this.addTranscriptTurn({
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString()
    });

    this.setCallStatus('bot-speaking');
    this.updateSpeechFeedback(`${this.assistant.name} está pensando...`);

    try {
      const res = await fetch(`/api/calls/${this.callId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();

      if (data.reply) {
        this.addTranscriptTurn({
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toLocaleTimeString()
        });
        await this.speakBotMessage(data.reply);
      }
    } catch (err) {
      console.error('Error al procesar turno:', err);
      this.updateSpeechFeedback('Error al procesar respuesta.');
    } finally {
      if (this.status !== 'ended' && this.status !== 'idle') {
        this.setCallStatus('in-call');
        if (this.recognition && !this.isMuted) {
          try { this.recognition.start(); } catch (e) {}
        }
      }
    }
  }

  /**
   * Sintetiza la respuesta del bot con voz humana
   */
  speakBotMessage(text) {
    return new Promise((resolve) => {
      if (!this.synth) {
        resolve();
        return;
      }

      this.synth.cancel(); // Cancelar cualquier audio anterior
      this.setCallStatus('bot-speaking');
      this.updateSpeechFeedback(`${this.assistant.name} está hablando...`);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.assistant.voice?.lang || 'es-MX';
      utterance.rate = this.assistant.voice?.rate || 1.0;
      utterance.pitch = this.assistant.voice?.pitch || 1.0;

      // Buscar voz en español
      const voices = this.synth.getVoices();
      const preferredName = this.assistant.voice?.voiceName;
      let matchedVoice = null;

      if (preferredName) {
        matchedVoice = voices.find(v => v.name === preferredName);
      }
      if (!matchedVoice) {
        matchedVoice = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Sabina') || v.name.includes('Jorge') || v.name.includes('Google'))) ||
                       voices.find(v => v.lang.startsWith('es'));
      }

      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.onend = () => {
        this.setCallStatus('in-call');
        this.updateSpeechFeedback('Te escucho...');
        resolve();
      };

      utterance.onerror = (e) => {
        console.warn('Error en síntesis:', e);
        this.setCallStatus('in-call');
        resolve();
      };

      this.currentUtterance = utterance;
      this.synth.speak(utterance);
    });
  }

  /**
   * Finaliza la llamada y abre el resumen ejecutivo
   */
  async endCall() {
    if (this.status === 'idle') return;
    const endedCallId = this.callId;

    this.setCallStatus('ended');
    clearInterval(this.timerInterval);

    // Detener síntesis y reconocimiento
    if (this.synth) this.synth.cancel();
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

    // Detener grabación de audio y enviar
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
    }

    this.updateCallControls(false);
    this.updateSpeechFeedback('Llamada finalizada. Generando resumen ejecutivo...');

    // Notificar al backend para que genere el Resumen Automático
    try {
      if (endedCallId) {
        const res = await fetch(`/api/calls/${endedCallId}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const result = await res.json();

        if (result.success && result.summary) {
          this.showPostCallSummary(result.call, result.summary);
          // Refrescar el historial de llamadas en segundo plano
          if (window.callLogsManager) {
            window.callLogsManager.loadLogs();
          }
        }
      }
    } catch (err) {
      console.error('Error al finalizar llamada y resumir:', err);
    } finally {
      this.setCallStatus('idle');
      this.updateSpeechFeedback('Listo para iniciar una nueva llamada');
    }
  }

  /**
   * Configuración de la grabación del micrófono
   */
  setupMediaRecorder(stream) {
    try {
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.onstop = async () => {
        if (this.recordedChunks.length > 0 && this.callId) {
          const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', blob, `call_${this.callId}.webm`);
          try {
            await fetch(`/api/calls/${this.callId}/recording`, {
              method: 'POST',
              body: formData
            });
          } catch (e) {
            console.warn('Error subiendo grabación:', e);
          }
        }
      };
      this.mediaRecorder.start();
    } catch (err) {
      console.warn('MediaRecorder error:', err);
    }
  }

  /**
   * Configuración del Visualizador de Audio (Canvas Oscilloscope / Wave)
   */
  setupAudioVisualizer(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);
      this.drawVisualizer();
    } catch (e) {
      console.warn('Visualizer error:', e);
    }
  }

  drawVisualizer() {
    if (!this.canvasCtx || !this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animationFrameId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      const width = this.canvas.width;
      const height = this.canvas.height;
      this.canvasCtx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        // Color dinámico según si habla el usuario o el bot
        if (this.status === 'bot-speaking') {
          this.canvasCtx.fillStyle = `rgb(16, 185, 129)`;
        } else if (this.status === 'user-speaking') {
          this.canvasCtx.fillStyle = `rgb(59, 130, 246)`;
        } else {
          this.canvasCtx.fillStyle = `rgba(100, 116, 139, 0.4)`;
        }

        this.canvasCtx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    };
    draw();
  }

  drawIdleVisualizer() {
    if (!this.canvasCtx) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.canvasCtx.clearRect(0, 0, width, height);
    this.canvasCtx.fillStyle = 'rgba(71, 85, 105, 0.3)';
    // Línea base suave
    this.canvasCtx.fillRect(0, height / 2 - 1, width, 2);
  }

  /**
   * Actualiza el estado visual de la llamada
   */
  setCallStatus(status) {
    this.status = status;
    const badge = document.getElementById('call-status-badge');
    const badgeText = document.getElementById('call-status-text');
    const avatar = document.getElementById('assistant-avatar');
    const pulseRings = document.getElementById('avatar-pulse-rings');

    if (!badge || !badgeText || !avatar) return;

    avatar.classList.remove('bot-speaking', 'user-speaking');
    if (pulseRings) pulseRings.classList.add('hidden');

    switch (status) {
      case 'idle':
        badgeText.textContent = 'Listo para llamar';
        badge.className = 'px-3.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center space-x-2';
        this.drawIdleVisualizer();
        break;
      case 'connecting':
        badgeText.textContent = 'Conectando...';
        badge.className = 'px-3.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center space-x-2';
        break;
      case 'in-call':
        badgeText.textContent = 'En llamada';
        badge.className = 'px-3.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-2';
        break;
      case 'bot-speaking':
        badgeText.textContent = `${this.assistant?.name || 'Agente'} hablando`;
        badge.className = 'px-3.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center space-x-2';
        avatar.classList.add('bot-speaking');
        if (pulseRings) pulseRings.classList.remove('hidden');
        break;
      case 'user-speaking':
        badgeText.textContent = 'Tú hablando...';
        badge.className = 'px-3.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center space-x-2';
        avatar.classList.add('user-speaking');
        break;
      case 'ended':
        badgeText.textContent = 'Llamada finalizada';
        badge.className = 'px-3.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center space-x-2';
        break;
    }
  }

  updateCallControls(isActive) {
    const mainBtn = document.getElementById('btn-main-call');
    const mainText = document.getElementById('main-call-text');
    const mainIcon = document.getElementById('main-call-icon');
    const micBtn = document.getElementById('btn-toggle-mic');

    if (isActive) {
      mainBtn.className = 'px-8 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-semibold text-sm flex items-center space-x-3 shadow-lg shadow-red-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98]';
      mainText.textContent = 'Colgar Llamada';
      if (mainIcon) mainIcon.setAttribute('data-lucide', 'phone-off');
      micBtn.disabled = false;
    } else {
      mainBtn.className = 'px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-semibold text-sm flex items-center space-x-3 shadow-lg shadow-emerald-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98]';
      mainText.textContent = 'Iniciar Llamada';
      if (mainIcon) mainIcon.setAttribute('data-lucide', 'phone');
      micBtn.disabled = true;
      document.getElementById('call-timer').textContent = '00:00';
    }
    lucide.createIcons();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    const micIcon = document.getElementById('mic-icon');
    const micBtn = document.getElementById('btn-toggle-mic');

    if (this.isMuted) {
      micBtn.classList.add('bg-red-500/20', 'text-red-400', 'border-red-500/30');
      micIcon.setAttribute('data-lucide', 'mic-off');
      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) {}
      }
      this.updateSpeechFeedback('Micrófono silenciado');
    } else {
      micBtn.classList.remove('bg-red-500/20', 'text-red-400', 'border-red-500/30');
      micIcon.setAttribute('data-lucide', 'mic');
      if (this.recognition && this.status === 'in-call') {
        try { this.recognition.start(); } catch (e) {}
      }
      this.updateSpeechFeedback('Te escucho...');
    }
    lucide.createIcons();
  }

  updateTimer() {
    if (!this.startTime) return;
    const diff = Math.floor((Date.now() - this.startTime) / 1000);
    const mins = Math.floor(diff / 60).toString().padStart(2, '0');
    const secs = (diff % 60).toString().padStart(2, '0');
    document.getElementById('call-timer').textContent = `${mins}:${secs}`;
  }

  updateSpeechFeedback(msg) {
    const el = document.getElementById('live-speech-feedback');
    if (el) el.textContent = msg;
  }

  addTranscriptTurn(turn) {
    this.transcript.push(turn);
    this.renderTranscriptFeed();
    const countBadge = document.getElementById('turn-count-badge');
    if (countBadge) countBadge.textContent = `${this.transcript.length} turnos`;
  }

  renderTranscriptFeed() {
    const container = document.getElementById('live-transcript-feed');
    if (!container) return;

    if (this.transcript.length === 0) {
      container.innerHTML = `
        <div id="transcript-empty-state" class="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-2">
          <i data-lucide="phone-incoming" class="w-10 h-10 stroke-1 text-slate-600 mb-2"></i>
          <p class="font-medium text-slate-400">No hay llamada activa en este momento</p>
          <p class="text-xs max-w-xs text-slate-500">Inicia una llamada para escuchar al agente en tiempo real y ver la transcripción instantánea turno por turno.</p>
        </div>`;
      lucide.createIcons();
      return;
    }

    container.innerHTML = this.transcript.map(turn => {
      const isBot = turn.role === 'assistant';
      return `
        <div class="flex items-start space-x-3 ${isBot ? '' : 'flex-row-reverse space-x-reverse'}">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${isBot ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}">
            ${isBot ? '<i data-lucide="bot" class="w-3.5 h-3.5"></i>' : '<i data-lucide="user" class="w-3.5 h-3.5"></i>'}
          </div>
          <div class="max-w-[85%] ${isBot ? 'transcript-bubble-assistant' : 'transcript-bubble-user'} p-3.5 rounded-2xl">
            <div class="flex items-center justify-between space-x-3 mb-1">
              <span class="text-[11px] font-bold ${isBot ? 'text-emerald-400' : 'text-blue-400'}">
                ${isBot ? (this.assistant?.name || 'Asistente') : 'Tú (Cliente)'}
              </span>
              <span class="text-[10px] text-slate-500 font-mono">${turn.timestamp || ''}</span>
            </div>
            <p class="text-xs sm:text-sm text-slate-200 leading-relaxed">${turn.content}</p>
          </div>
        </div>
      `;
    }).join('');

    lucide.createIcons();
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Muestra el modal con el Resumen Ejecutivo generado
   */
  showPostCallSummary(call, summary) {
    const modal = document.getElementById('post-call-summary-modal');
    if (!modal) return;

    // Metadatos
    document.getElementById('summary-meta-info').textContent = 
      `Llamada atendida por ${call.assistantName || 'Asistente'} • ${new Date(call.startedAt).toLocaleString()}`;

    // Sentimiento
    const sentiment = summary.sentiment || 'Neutral';
    const sentText = document.getElementById('summary-sentiment-text');
    const sentBadge = document.getElementById('summary-sentiment-badge');
    sentText.textContent = sentiment;
    if (sentiment === 'Positivo') {
      sentBadge.className = 'mt-1 flex items-center space-x-1.5 font-bold text-sm text-emerald-400';
    } else if (sentiment === 'Negativo') {
      sentBadge.className = 'mt-1 flex items-center space-x-1.5 font-bold text-sm text-red-400';
    } else {
      sentBadge.className = 'mt-1 flex items-center space-x-1.5 font-bold text-sm text-cyan-400';
    }

    // Duración y turnos
    const mins = Math.floor((call.durationSeconds || 0) / 60).toString().padStart(2, '0');
    const secs = ((call.durationSeconds || 0) % 60).toString().padStart(2, '0');
    document.getElementById('summary-duration-text').textContent = `${mins}:${secs}`;
    document.getElementById('summary-turns-text').textContent = call.transcript ? call.transcript.length : 0;
    document.getElementById('summary-score-text').textContent = `${summary.callQualityScore || 9} / 10`;

    // Overview
    document.getElementById('summary-overview-content').textContent = summary.overview || 'Sin resumen disponible.';

    // Key points
    const kpList = document.getElementById('summary-keypoints-list');
    kpList.innerHTML = (summary.keyPoints || []).map(p => `
      <li class="flex items-start space-x-2">
        <span class="text-emerald-400 font-bold shrink-0">•</span>
        <span>${p}</span>
      </li>
    `).join('');

    // Actions
    const actList = document.getElementById('summary-actions-list');
    actList.innerHTML = (summary.actionItems || []).map(a => `
      <li class="flex items-start space-x-2">
        <span class="text-cyan-400 font-bold shrink-0">→</span>
        <span>${a}</span>
      </li>
    `).join('');

    // Extracted Data
    const extGrid = document.getElementById('summary-extracted-grid');
    if (summary.extractedData && Object.keys(summary.extractedData).length > 0) {
      extGrid.innerHTML = Object.entries(summary.extractedData).map(([k, v]) => `
        <div class="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
          <span class="text-slate-400 capitalize block font-medium">${k}:</span>
          <span class="text-slate-200 font-semibold">${v || 'N/A'}</span>
        </div>
      `).join('');
    } else {
      extGrid.innerHTML = '<span class="text-slate-500 col-span-3">No se detectaron entidades específicas.</span>';
    }

    // Audio
    const audioSec = document.getElementById('summary-audio-section');
    const audioPlayer = document.getElementById('summary-audio-player');
    if (call.audioUrl) {
      audioSec.classList.remove('hidden');
      audioPlayer.src = call.audioUrl;
    } else {
      audioSec.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    lucide.createIcons();
  }
}

window.CallClient = CallClient;

