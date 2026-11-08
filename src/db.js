const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'database.json');

// Asistentes predeterminados estilo Vapi
const DEFAULT_ASSISTANTS = [
  {
    id: 'asst_sales_01',
    name: 'Sofía - Ejecutiva de Ventas',
    description: 'Especialista en calificación de prospectos, explicar beneficios y agendar demostraciones.',
    systemPrompt: `Eres Sofía, una ejecutiva de ventas cordial, persuasiva y empática. 
Tu objetivo es saludar al cliente, indagar brevemente sobre las necesidades de su negocio o proyecto, explicar cómo nuestra solución puede ayudarle y proponerle una fecha para una demostración detallada.
Mantén tus respuestas breves, naturales y conversacionales (máximo 2 a 3 oraciones por turno) ya que estás hablando por llamada telefónica.
No uses formato markdown complejo ni listas largas; habla con fluidez y calidez en español.`,
    firstMessage: '¡Hola! Qué gusto saludarte. Soy Sofía, asesora comercial. ¿Cómo te encuentras el día de hoy?',
    model: 'gemini-2.5-flash',
    voice: {
      provider: 'browser',
      voiceName: 'Microsoft Sabina - Spanish (Mexico)',
      lang: 'es-MX',
      pitch: 1.05,
      rate: 1.0
    },
    recordingEnabled: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'asst_support_02',
    name: 'Carlos - Soporte Técnico',
    description: 'Asistente de primer nivel para diagnóstico de incidencias, tickets y resolución rápida.',
    systemPrompt: `Eres Carlos, un especialista de soporte técnico paciente, claro y muy resolutivo.
Tu labor es escuchar el problema que tiene el usuario, hacer preguntas clave para identificar la falla, proporcionar pasos sencillos de solución y, si no se resuelve, confirmar su nombre y correo para levantar un número de ticket.
Habla en tono conversacional y empático, en respuestas cortas y claras (1-3 frases) ideales para voz.`,
    firstMessage: 'Buenas tardes, gracias por comunicarte a soporte técnico. Mi nombre es Carlos, ¿en qué puedo ayudarte hoy?',
    model: 'gemini-2.5-flash',
    voice: {
      provider: 'browser',
      voiceName: 'Microsoft Jorge - Spanish (Mexico)',
      lang: 'es-MX',
      pitch: 0.95,
      rate: 1.02
    },
    recordingEnabled: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'asst_medical_03',
    name: 'Dra. Elena - Agendamiento de Citas',
    description: 'Gestión de citas médicas, confirmación de horarios, recordatorios y preparación del paciente.',
    systemPrompt: `Eres la Dra. Elena, asistente virtual de la clínica médica. Eres amable, profesional y eficiente.
Tu labor es ayudar al paciente a agendar o reagendar una consulta médica. Pregúntale qué especialidad busca (Medicina General, Odontología, Pediatría), cuál es su nombre completo y para qué día y turno (mañana o tarde) prefiere la consulta.
Responde de forma concisa, cálida y directa, como en una llamada real.`,
    firstMessage: 'Hola, te comunicas a la Clínica Médica San Rafael. Soy Elena, ¿te gustaría agendar o consultar una cita?',
    model: 'gemini-2.5-flash',
    voice: {
      provider: 'browser',
      voiceName: 'Microsoft Dalia Online (Natural) - Spanish (Mexico)',
      lang: 'es-MX',
      pitch: 1.0,
      rate: 1.0
    },
    recordingEnabled: true,
    createdAt: new Date().toISOString()
  }
];

class Database {
  constructor() {
    this.data = {
      assistants: [],
      calls: [],
      settings: {
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        activeModel: 'gemini-2.5-flash',
        twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID || '',
          authToken: process.env.TWILIO_AUTH_TOKEN || '',
          phoneNumber: process.env.TWILIO_PHONE_NUMBER || ''
        }
      }
    };
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        // Garantizar que existan asistentes
        if (!this.data.assistants || this.data.assistants.length === 0) {
          this.data.assistants = [...DEFAULT_ASSISTANTS];
          this.save();
        }
      } else {
        this.data.assistants = [...DEFAULT_ASSISTANTS];
        this.data.calls = [];
        this.save();
      }
    } catch (err) {
      console.error('Error inicializando base de datos:', err);
      this.data.assistants = [...DEFAULT_ASSISTANTS];
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error guardando base de datos:', err);
    }
  }

  // --- Asistentes ---
  getAssistants() {
    return this.data.assistants || [];
  }

  getAssistantById(id) {
    return (this.data.assistants || []).find(a => a.id === id);
  }

  createAssistant(assistant) {
    const newAssistant = {
      id: `asst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      ...assistant
    };
    this.data.assistants.unshift(newAssistant);
    this.save();
    return newAssistant;
  }

  updateAssistant(id, updates) {
    const index = (this.data.assistants || []).findIndex(a => a.id === id);
    if (index === -1) return null;
    this.data.assistants[index] = {
      ...this.data.assistants[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.data.assistants[index];
  }

  deleteAssistant(id) {
    const index = (this.data.assistants || []).findIndex(a => a.id === id);
    if (index === -1) return false;
    this.data.assistants.splice(index, 1);
    this.save();
    return true;
  }

  // --- Llamadas ---
  getCalls(filters = {}) {
    let calls = [...(this.data.calls || [])];
    
    if (filters.assistantId) {
      calls = calls.filter(c => c.assistantId === filters.assistantId);
    }
    if (filters.sentiment) {
      calls = calls.filter(c => c.summary?.sentiment?.toLowerCase() === filters.sentiment.toLowerCase());
    }
    if (filters.status) {
      calls = calls.filter(c => c.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      calls = calls.filter(c => 
        (c.assistantName && c.assistantName.toLowerCase().includes(q)) ||
        (c.summary?.overview && c.summary.overview.toLowerCase().includes(q)) ||
        (c.transcript && c.transcript.some(t => t.content && t.content.toLowerCase().includes(q)))
      );
    }

    // Ordenar de más reciente a más antigua
    return calls.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  getCallById(id) {
    return (this.data.calls || []).find(c => c.id === id);
  }

  createCall(callData) {
    const newCall = {
      id: callData.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      assistantId: callData.assistantId,
      assistantName: callData.assistantName || 'Asistente',
      startedAt: callData.startedAt || new Date().toISOString(),
      endedAt: null,
      durationSeconds: 0,
      status: 'in-progress', // 'in-progress' | 'completed' | 'failed'
      type: callData.type || 'web', // 'web' | 'telephony'
      transcript: callData.transcript || [],
      summary: null,
      audioUrl: null,
      metrics: {
        totalTurns: 0,
        userTurns: 0,
        botTurns: 0
      }
    };
    this.data.calls.unshift(newCall);
    this.save();
    return newCall;
  }

  addTranscriptTurn(callId, turn) {
    const call = this.getCallById(callId);
    if (!call) return null;

    const formattedTurn = {
      id: `turn_${Date.now()}`,
      role: turn.role, // 'user' | 'assistant'
      content: turn.content,
      timestamp: turn.timestamp || new Date().toISOString(),
      duration: turn.duration || 0
    };

    call.transcript.push(formattedTurn);
    call.metrics.totalTurns = call.transcript.length;
    call.metrics.userTurns = call.transcript.filter(t => t.role === 'user').length;
    call.metrics.botTurns = call.transcript.filter(t => t.role === 'assistant').length;

    this.save();
    return formattedTurn;
  }

  finishCall(callId, finalData = {}) {
    const call = this.getCallById(callId);
    if (!call) return null;

    call.endedAt = finalData.endedAt || new Date().toISOString();
    call.status = finalData.status || 'completed';

    if (call.startedAt && call.endedAt) {
      const diffMs = new Date(call.endedAt) - new Date(call.startedAt);
      call.durationSeconds = Math.max(1, Math.round(diffMs / 1000));
    }

    if (finalData.audioUrl) {
      call.audioUrl = finalData.audioUrl;
    }

    if (finalData.summary) {
      call.summary = finalData.summary;
    }

    this.save();
    return call;
  }

  deleteCall(id) {
    const index = (this.data.calls || []).findIndex(c => c.id === id);
    if (index === -1) return false;
    this.data.calls.splice(index, 1);
    this.save();
    return true;
  }

  // --- Ajustes ---
  getSettings() {
    return {
      geminiApiKeyConfigured: !!(process.env.GEMINI_API_KEY || this.data.settings?.geminiApiKey),
      openaiApiKeyConfigured: !!(process.env.OPENAI_API_KEY || this.data.settings?.openaiApiKey),
      twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      activeModel: this.data.settings?.activeModel || 'gemini-2.5-flash'
    };
  }

  updateSettings(settings) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
    return this.getSettings();
  }
}

module.exports = new Database();

