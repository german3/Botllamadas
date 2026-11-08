const db = require('./db');
const aiService = require('./aiService');

class TelephonyService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
  }

  /**
   * Responde a una llamada telefónica entrante de Twilio
   */
  async handleIncomingCall(req, res) {
    const callSid = req.body?.CallSid || `twilio_${Date.now()}`;
    const callerNumber = req.body?.From || 'Desconocido';

    // Obtener el asistente predeterminado
    const assistants = db.getAssistants();
    const assistant = assistants[0] || {
      name: 'Asistente Telefónico',
      firstMessage: 'Hola, gracias por llamar. ¿En qué te puedo ayudar?'
    };

    // Crear registro de llamada en BD
    const callRecord = db.createCall({
      id: callSid,
      assistantId: assistant.id,
      assistantName: assistant.name,
      type: 'telephony',
      startedAt: new Date().toISOString()
    });

    // Registrar mensaje inicial del asistente
    db.addTranscriptTurn(callSid, {
      role: 'assistant',
      content: assistant.firstMessage
    });

    // Construir respuesta TwiML XML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="es-MX" voice="Polly.Mia">${assistant.firstMessage}</Say>
    <Gather input="speech" action="/api/telephony/gather?callId=${callSid}" method="POST" language="es-MX" speechTimeout="auto">
        <Say language="es-MX" voice="Polly.Mia">Te escucho.</Say>
    </Gather>
</Response>`;

    res.type('text/xml');
    res.send(twiml);
  }

  /**
   * Procesa la voz del usuario recibida de Twilio
   */
  async handleGather(req, res) {
    const callId = req.query.callId;
    const speechResult = req.body?.SpeechResult || '';
    const call = db.getCallById(callId);

    if (!call || !speechResult) {
      const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="es-MX">Disculpa, no pude escucharte bien. ¿Podrías repetir?</Say>
    <Gather input="speech" action="/api/telephony/gather?callId=${callId}" method="POST" language="es-MX" speechTimeout="auto" />
</Response>`;
      res.type('text/xml');
      return res.send(fallbackTwiml);
    }

    const assistant = db.getAssistantById(call.assistantId) || { name: 'Asistente' };

    // Registrar lo que dijo el usuario
    db.addTranscriptTurn(callId, {
      role: 'user',
      content: speechResult
    });

    // Generar respuesta con IA
    const botReply = await aiService.generateResponse({
      assistant,
      transcript: call.transcript,
      userMessage: speechResult
    });

    // Registrar turno del bot
    db.addTranscriptTurn(callId, {
      role: 'assistant',
      content: botReply
    });

    // Construir TwiML con la respuesta
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="es-MX" voice="Polly.Mia">${botReply}</Say>
    <Gather input="speech" action="/api/telephony/gather?callId=${callId}" method="POST" language="es-MX" speechTimeout="auto" />
</Response>`;

    res.type('text/xml');
    res.send(twiml);
  }

  /**
   * Llamada telefónica finalizada por Twilio
   */
  async handleCallStatus(req, res) {
    const callSid = req.body?.CallSid;
    const callDuration = parseInt(req.body?.CallDuration || '0', 10);

    const call = db.getCallById(callSid);
    if (call) {
      const assistant = db.getAssistantById(call.assistantId) || { name: 'Asistente' };
      const summary = await aiService.summarizeCall({
        assistant,
        transcript: call.transcript,
        durationSeconds: callDuration || call.durationSeconds
      });

      db.finishCall(callSid, {
        endedAt: new Date().toISOString(),
        status: 'completed',
        summary
      });
    }

    res.status(200).send('OK');
  }
}

module.exports = new TelephonyService();

