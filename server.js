require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const multer = require('multer');
const fs = require('fs');

const db = require('./src/db');
const aiService = require('./src/aiService');
const telephonyService = require('./src/telephonyService');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Configuración de almacenamiento de grabaciones de audio
const recordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, recordingsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `call_${req.params.id || Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/recordings', express.static(recordingsDir));

// ==========================================
// RUTAS REST - ASISTENTES (BOTS)
// ==========================================
app.get('/api/assistants', (req, res) => {
  res.json(db.getAssistants());
});

app.get('/api/assistants/:id', (req, res) => {
  const assistant = db.getAssistantById(req.params.id);
  if (!assistant) return res.status(404).json({ error: 'Asistente no encontrado' });
  res.json(assistant);
});

app.post('/api/assistants', (req, res) => {
  const { name, systemPrompt, firstMessage, description, voice, model } = req.body;
  if (!name || !systemPrompt) {
    return res.status(400).json({ error: 'El nombre y las instrucciones son requeridos' });
  }
  const created = db.createAssistant({
    name,
    description: description || '',
    systemPrompt,
    firstMessage: firstMessage || 'Hola, ¿en qué puedo ayudarte?',
    voice: voice || { provider: 'browser', lang: 'es-MX', pitch: 1.0, rate: 1.0 },
    model: model || 'gemini-2.5-flash'
  });
  res.status(201).json(created);
});

app.put('/api/assistants/:id', (req, res) => {
  const updated = db.updateAssistant(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Asistente no encontrado' });
  res.json(updated);
});

app.delete('/api/assistants/:id', (req, res) => {
  const ok = db.deleteAssistant(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Asistente no encontrado' });
  res.json({ success: true });
});

// ==========================================
// RUTAS REST - LLAMADAS Y RESÚMENES
// ==========================================
app.get('/api/calls', (req, res) => {
  const { assistantId, sentiment, status, search } = req.query;
  const calls = db.getCalls({ assistantId, sentiment, status, search });
  res.json(calls);
});

app.get('/api/calls/:id', (req, res) => {
  const call = db.getCallById(req.params.id);
  if (!call) return res.status(404).json({ error: 'Llamada no encontrada' });
  res.json(call);
});

// Iniciar una llamada simulada
app.post('/api/calls/start', (req, res) => {
  const { assistantId } = req.body;
  const assistant = db.getAssistantById(assistantId) || db.getAssistants()[0];
  if (!assistant) return res.status(400).json({ error: 'No hay asistentes configurados' });

  const call = db.createCall({
    assistantId: assistant.id,
    assistantName: assistant.name,
    type: 'web',
    startedAt: new Date().toISOString()
  });

  // Agregar turno inicial del bot
  if (assistant.firstMessage) {
    db.addTranscriptTurn(call.id, {
      role: 'assistant',
      content: assistant.firstMessage
    });
  }

  res.status(201).json({
    call,
    assistant,
    firstMessage: assistant.firstMessage
  });
});

// Procesar un turno de la llamada (el usuario habla o envía texto)
app.post('/api/calls/:id/turn', async (req, res) => {
  try {
    const { message } = req.body;
    const callId = req.params.id;
    const call = db.getCallById(callId);

    if (!call) return res.status(404).json({ error: 'Llamada no encontrada' });
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje vacío' });
    }

    const assistant = db.getAssistantById(call.assistantId) || { name: 'Asistente' };

    // 1. Registrar lo que dijo el usuario
    const userTurn = db.addTranscriptTurn(callId, {
      role: 'user',
      content: message.trim()
    });

    // 2. Generar respuesta de voz/texto con IA
    const botReply = await aiService.generateResponse({
      assistant,
      transcript: call.transcript,
      userMessage: message.trim()
    });

    // 3. Registrar la respuesta del bot
    const botTurn = db.addTranscriptTurn(callId, {
      role: 'assistant',
      content: botReply
    });

    res.json({
      userTurn,
      botTurn,
      reply: botReply
    });
  } catch (err) {
    console.error('Error procesando turno:', err);
    res.status(500).json({ error: 'Error procesando turno de llamada' });
  }
});

// Subir grabación de audio de la llamada
app.post('/api/calls/:id/recording', upload.single('audio'), (req, res) => {
  const call = db.getCallById(req.params.id);
  if (!call) return res.status(404).json({ error: 'Llamada no encontrada' });

  if (req.file) {
    const audioUrl = `/recordings/${req.file.filename}`;
    db.finishCall(call.id, { audioUrl });
    return res.json({ success: true, audioUrl });
  }

  res.status(400).json({ error: 'Archivo de audio no recibido' });
});

// Finalizar la llamada y generar automáticamente el resumen estructurado
app.post('/api/calls/:id/end', async (req, res) => {
  try {
    const callId = req.params.id;
    const call = db.getCallById(callId);
    if (!call) return res.status(404).json({ error: 'Llamada no encontrada' });

    const assistant = db.getAssistantById(call.assistantId) || { name: 'Asistente' };

    const endedAt = new Date().toISOString();
    const diffMs = new Date(endedAt) - new Date(call.startedAt);
    const durationSeconds = Math.max(1, Math.round(diffMs / 1000));

    // Generar Resumen Ejecutivo y Analítica
    console.log(`Generando resumen para llamada ${callId}...`);
    const summary = await aiService.summarizeCall({
      assistant,
      transcript: call.transcript,
      durationSeconds
    });

    const finishedCall = db.finishCall(callId, {
      endedAt,
      status: 'completed',
      summary
    });

    res.json({
      success: true,
      call: finishedCall,
      summary
    });
  } catch (err) {
    console.error('Error finalizando llamada:', err);
    res.status(500).json({ error: 'Error finalizando llamada' });
  }
});

app.delete('/api/calls/:id', (req, res) => {
  const ok = db.deleteCall(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Llamada no encontrada' });
  res.json({ success: true });
});

// ==========================================
// CONFIGURACIÓN Y API KEYS
// ==========================================
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.post('/api/settings', (req, res) => {
  const { geminiApiKey, openaiApiKey } = req.body;
  if (geminiApiKey !== undefined) {
    aiService.setGeminiKey(geminiApiKey);
  }
  if (openaiApiKey !== undefined) {
    aiService.setOpenAIKey(openaiApiKey);
  }
  const updated = db.updateSettings({
    geminiApiKey,
    openaiApiKey
  });
  res.json(updated);
});

// ==========================================
// RUTAS TELEFONÍA REAL (TWILIO WEBHOOKS)
// ==========================================
app.post('/api/telephony/incoming', (req, res) => telephonyService.handleIncomingCall(req, res));
app.post('/api/telephony/gather', (req, res) => telephonyService.handleGather(req, res));
app.post('/api/telephony/status', (req, res) => telephonyService.handleCallStatus(req, res));

// ==========================================
// WEBSOCKET SERVER - STREAMING EN VIVO
// ==========================================
wss.on('connection', (ws) => {
  let activeCallId = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'join') {
        activeCallId = data.callId;
        ws.send(JSON.stringify({ type: 'joined', callId: activeCallId }));
      }

      if (data.type === 'user_speech') {
        const { text, callId } = data;
        const call = db.getCallById(callId);
        if (!call) return;

        const assistant = db.getAssistantById(call.assistantId) || { name: 'Asistente' };

        // 1. Guardar turno del usuario
        const userTurn = db.addTranscriptTurn(callId, {
          role: 'user',
          content: text
        });

        // Notificar al cliente que se registró el texto del usuario
        ws.send(JSON.stringify({
          type: 'transcript_turn',
          turn: userTurn
        }));

        // Notificar que el bot está pensando / respondiendo
        ws.send(JSON.stringify({ type: 'bot_thinking' }));

        // 2. Obtener respuesta IA
        const botReply = await aiService.generateResponse({
          assistant,
          transcript: call.transcript,
          userMessage: text
        });

        // 3. Guardar turno del bot
        const botTurn = db.addTranscriptTurn(callId, {
          role: 'assistant',
          content: botReply
        });

        // Enviar respuesta al cliente para que la sintetice a voz
        ws.send(JSON.stringify({
          type: 'bot_response',
          turn: botTurn,
          text: botReply,
          voice: assistant.voice
        }));
      }
    } catch (err) {
      console.error('Error en WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    // Manejar desconexión
  });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 VoxPulse AI (Gestor de Llamadas tipo Vapi.ai)`);
  console.log(`🌐 Servidor iniciado en: http://localhost:${PORT}`);
  console.log(`📊 Panel de Control y Simulador de Llamadas disponible`);
  console.log(`🎙️  Reconocimiento y Síntesis de Voz listos`);
  console.log(`=======================================================`);
});

