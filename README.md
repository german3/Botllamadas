# 🎙️ VoxPulse AI - Gestor de Llamadas y Agentes de Voz (Estilo Vapi.ai)

**VoxPulse AI** es una plataforma completa de agentes conversacionales de voz por inteligencia artificial, diseñada para simular llamadas en tiempo real, transcribir diálogos en vivo, grabar el audio y generar automáticamente **resúmenes ejecutivos, análisis de sentimiento, puntos clave y extracción de tareas / datos**.

---

## 🚀 Inicio Rápido

Para iniciar el servidor y abrir el panel de control:

```bash
npm start
```

Luego abre tu navegador en:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## ✨ Características Principales

### 1. 📞 Simulador de Llamadas en Tiempo Real (Web Call Simulator)
- **Voz Bidireccional Natural**:
  - **Escucha (STT)**: Reconocimiento continuo de voz en tiempo real mediante Web Speech API.
  - **Habla (TTS)**: Síntesis de voz fluida en español con selección de tono y velocidad.
- **Osciloscopio / Visualizador de Ondas de Audio**: Canvas dinámico que reacciona a las frecuencias de tu voz y a la voz del agente.
- **Control de Llamada**: Botón de llamada/colgar, cronómetro en vivo, botón de silenciar micrófono (Mute).
- **Entrada de Texto Opcional**: Para realizar pruebas rápidas directamente con el teclado sin necesidad de micrófono.

### 2. 📝 Registro y Transcripción en Vivo
- Cada turno queda registrado al instante con rol (*Cliente* vs *Agente*), timestamp exacto y texto.
- Grabación de audio completa en formato `.webm` almacenada en la carpeta `/recordings` y lista para escuchar.

### 3. 🧠 Resumen Automático y Analítica Post-Llamada
Al colgar la llamada, el sistema genera de forma instantánea:
- **Resumen Ejecutivo**: Visión general en 2-3 oraciones de lo que se platicó.
- **Análisis de Sentimiento**: Clasificación del cliente (*Positivo*, *Neutral*, *Negativo*) y puntuación de satisfacción.
- **Puntos Clave**: Lista de temas clave, acuerdos o consultas realizadas.
- **Acciones a Seguir (Action Items)**: Compromisos, minutas o tareas derivadas de la llamada.
- **Extracción de Entidades**: Detección automática del nombre del cliente, correo electrónico, fecha y motivo de consulta.
- **Puntuación de Calidad**: Métrica de 1 a 10 sobre la resolución de la llamada.

### 4. 🤖 Gestor de Asistentes de Voz (Assistants Manager)
Incluye 3 agentes preconfigurados listos para usar:
1. **Sofía - Ejecutiva de Ventas**: Calificación de prospectos, explicación de valor y agendamiento de demostraciones comerciales.
2. **Carlos - Soporte Técnico**: Diagnóstico de fallas, resolución de incidencias de primer nivel y apertura de tickets.
3. **Dra. Elena - Agendamiento Médico**: Coordinación de citas, horarios y especialidades médicas.
- **Creador de Bots Personalizados**: Modifica el prompt del sistema, el saludo inicial, la voz preferida y el modelo.

### 5. 📊 Historial y Bitácora de Llamadas (Call Logs & CRM)
- Panel analítico con métricas globales: Total de llamadas, duración promedio, porcentaje de sentimiento positivo y volumen de turnos.
- Filtros por asistente, sentimiento o buscador de texto libre.
- Reproductor de audio integrado para escuchar las llamadas grabadas.
- Exportación del registro completo a formato **CSV**.

### 6. ☎️ Integración con Telefonía Real (Twilio Webhooks)
- Si deseas conectar números telefónicos reales (DID / PSTN), la plataforma incluye endpoints compatibles con Twilio TwiML:
  - `POST /api/telephony/incoming`: Recibe llamadas entrantes y reproduce el saludo inicial.
  - `POST /api/telephony/gather`: Captura la voz del cliente por teléfono, procesa la respuesta con IA y le responde en la llamada.
  - `POST /api/telephony/status`: Detecta cuando el cliente cuelga el teléfono y dispara el resumen automático.

---

## 🛠️ Tecnologías Empleadas

- **Backend**: Node.js 24, Express, WebSocket (`ws`), Multer (grabaciones de audio), Axios.
- **Base de Datos**: Motor persistente en JSON con lectura/escritura atómica en `data/database.json`.
- **Frontend**: Single Page Application con interfaz moderna estilo Vapi.ai (modo oscuro, gradientes, Tailwind CSS, Lucide Icons).
- **Procesamiento de Audio**: Web Audio API (Analizador de frecuencias), Web Speech Recognition y Web Speech Synthesis.
- **Inteligencia Artificial**:
  - Compatible con **Google Gemini** (`gemini-2.5-flash`).
  - Compatible con **OpenAI** (`gpt-4o-mini`).
  - **Motor Inteligente Integrado (Local AI Engine)**: Funciona sin necesidad de configurar ninguna clave de API externa para pruebas y desarrollo inmediato.

---

## ⚙️ Configuración Opcional (`.env`)

En la raíz del proyecto encontrarás el archivo `.env`:

```env
PORT=3000
GEMINI_API_KEY=tu_clave_de_gemini
OPENAI_API_KEY=tu_clave_de_openai
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

*Nota: Si dejas las claves vacías, el sistema utilizará automáticamente su motor heurístico local inteligente.*

