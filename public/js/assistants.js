/**
 * VoxPulse Assistants Manager
 * Gestión CRUD de agentes de voz estilo Vapi.ai
 */

class AssistantsManager {
  constructor() {
    this.assistants = [];
    this.selectedAssistantId = null;
    this.initVoiceSelector();
    this.loadAssistants();
  }

  async loadAssistants() {
    try {
      const res = await fetch('/api/assistants');
      this.assistants = await res.json();
      this.renderAssistantsGrid();
      this.populateSimulatorSelect();
    } catch (err) {
      console.error('Error cargando asistentes:', err);
    }
  }

  initVoiceSelector() {
    const voiceSelect = document.getElementById('asst-voice-select');
    if (!voiceSelect) return;

    const populateVoices = () => {
      const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      voiceSelect.innerHTML = '';

      // Filtrar y priorizar voces en español
      const spanishVoices = voices.filter(v => v.lang.startsWith('es'));
      const otherVoices = voices.filter(v => !v.lang.startsWith('es'));

      if (spanishVoices.length > 0) {
        const groupEs = document.createElement('optgroup');
        groupEs.label = 'Voces en Español (Recomendadas)';
        spanishVoices.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = `${v.name} (${v.lang})`;
          groupEs.appendChild(opt);
        });
        voiceSelect.appendChild(groupEs);
      }

      if (otherVoices.length > 0) {
        const groupOther = document.createElement('optgroup');
        groupOther.label = 'Otras Voces del Sistema';
        otherVoices.slice(0, 15).forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = `${v.name} (${v.lang})`;
          groupOther.appendChild(opt);
        });
        voiceSelect.appendChild(groupOther);
      }
    };

    if (window.speechSynthesis) {
      populateVoices();
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }
  }

  populateSimulatorSelect() {
    const select = document.getElementById('active-assistant-select');
    if (!select) return;

    select.innerHTML = this.assistants.map(a => `
      <option value="${a.id}">${a.name}</option>
    `).join('');

    if (this.assistants.length > 0) {
      const active = this.assistants[0];
      this.selectedAssistantId = active.id;
      this.updateSimulatorAssistantInfo(active);
    }

    select.onchange = (e) => {
      const chosen = this.assistants.find(a => a.id === e.target.value);
      if (chosen) {
        this.selectedAssistantId = chosen.id;
        this.updateSimulatorAssistantInfo(chosen);
      }
    };
  }

  updateSimulatorAssistantInfo(assistant) {
    if (!assistant) return;
    document.getElementById('call-assistant-name').textContent = assistant.name;
    document.getElementById('call-assistant-desc').textContent = assistant.description || 'Agente de voz interactivo';
    document.getElementById('call-model-badge').textContent = assistant.model || 'gemini-2.5-flash';
    document.getElementById('call-voice-badge').textContent = assistant.voice?.voiceName || 'Español (Natural)';

    // Notificar al callClient si existe
    if (window.callClientInstance) {
      window.callClientInstance.assistant = assistant;
    }
  }

  renderAssistantsGrid() {
    const grid = document.getElementById('assistants-grid');
    if (!grid) return;

    if (this.assistants.length === 0) {
      grid.innerHTML = `
        <div class="col-span-3 text-center p-12 bg-vapi-card rounded-2xl border border-slate-800 text-slate-400">
          <p>No hay agentes de voz creados. Pulsa "Crear Nuevo Agente" para comenzar.</p>
        </div>`;
      return;
    }

    grid.innerHTML = this.assistants.map(a => `
      <div class="bg-vapi-card border border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-xl group">
        <div>
          <!-- Header tarjeta -->
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                <i data-lucide="bot" class="w-6 h-6"></i>
              </div>
              <div>
                <h4 class="font-bold text-white text-base">${a.name}</h4>
                <span class="text-xs text-slate-400 block">${a.description || 'Asistente de Voz'}</span>
              </div>
            </div>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-cyan-400">
              ${a.model || 'gemini'}
            </span>
          </div>

          <!-- Primer mensaje (Saludo inicial) -->
          <div class="mt-4 p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
            <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Primer Mensaje:</span>
            <p class="text-xs text-slate-300 italic">"${a.firstMessage || '¡Hola!'}"</p>
          </div>

          <!-- Prompt Preview -->
          <div class="mt-3">
            <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Instrucciones del Sistema:</span>
            <p class="text-xs text-slate-400 line-clamp-3 leading-relaxed">${a.systemPrompt || ''}</p>
          </div>
        </div>

        <!-- Acciones -->
        <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between">
          <button onclick="testCallAssistant('${a.id}')" class="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center space-x-1.5 transition-all">
            <i data-lucide="phone-call" class="w-3.5 h-3.5"></i>
            <span>Llamar Ahora</span>
          </button>

          <div class="flex items-center space-x-2">
            <button onclick="editAssistant('${a.id}')" class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all" title="Editar">
              <i data-lucide="edit-3" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteAssistant('${a.id}')" class="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all" title="Eliminar">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    lucide.createIcons();
  }
}

// Instancia global
window.assistantsManager = new AssistantsManager();

function openCreateAssistantModal() {
  document.getElementById('asst-id').value = '';
  document.getElementById('asst-name').value = '';
  document.getElementById('asst-desc').value = '';
  document.getElementById('asst-first-message').value = '¡Hola! Es un gusto saludarte. ¿En qué puedo apoyarte hoy?';
  document.getElementById('asst-system-prompt').value = 'Eres un asistente conversacional empático y resolutivo. Responde siempre de forma breve y concisa, en español fluido.';
  document.getElementById('assistant-modal-title').textContent = 'Crear Nuevo Agente de Voz';
  document.getElementById('assistant-modal').classList.remove('hidden');
}

function closeAssistantModal() {
  document.getElementById('assistant-modal').classList.add('hidden');
}

function editAssistant(id) {
  const asst = window.assistantsManager.assistants.find(a => a.id === id);
  if (!asst) return;

  document.getElementById('asst-id').value = asst.id;
  document.getElementById('asst-name').value = asst.name;
  document.getElementById('asst-desc').value = asst.description || '';
  document.getElementById('asst-first-message').value = asst.firstMessage || '';
  document.getElementById('asst-system-prompt').value = asst.systemPrompt || '';
  document.getElementById('asst-model').value = asst.model || 'gemini-2.5-flash';
  if (asst.voice?.voiceName) {
    document.getElementById('asst-voice-select').value = asst.voice.voiceName;
  }

  document.getElementById('assistant-modal-title').textContent = 'Editar Agente de Voz';
  document.getElementById('assistant-modal').classList.remove('hidden');
}

async function saveAssistant(event) {
  event.preventDefault();
  const id = document.getElementById('asst-id').value;
  const name = document.getElementById('asst-name').value;
  const description = document.getElementById('asst-desc').value;
  const firstMessage = document.getElementById('asst-first-message').value;
  const systemPrompt = document.getElementById('asst-system-prompt').value;
  const model = document.getElementById('asst-model').value;
  const voiceName = document.getElementById('asst-voice-select').value;

  const payload = {
    name,
    description,
    firstMessage,
    systemPrompt,
    model,
    voice: {
      provider: 'browser',
      voiceName,
      lang: 'es-MX',
      pitch: 1.0,
      rate: 1.0
    }
  };

  try {
    if (id) {
      await fetch(`/api/assistants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch('/api/assistants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    closeAssistantModal();
    window.assistantsManager.loadAssistants();
  } catch (err) {
    alert('Error al guardar el asistente');
  }
}

async function deleteAssistant(id) {
  if (!confirm('¿Seguro que deseas eliminar este agente de voz?')) return;
  try {
    await fetch(`/api/assistants/${id}`, { method: 'DELETE' });
    window.assistantsManager.loadAssistants();
  } catch (err) {
    alert('Error al eliminar');
  }
}

function testCallAssistant(id) {
  switchTab('simulator');
  const select = document.getElementById('active-assistant-select');
  if (select) {
    select.value = id;
    const asst = window.assistantsManager.assistants.find(a => a.id === id);
    if (asst) {
      window.assistantsManager.updateSimulatorAssistantInfo(asst);
    }
  }
}

