/**
 * VoxPulse Main Application Controller
 */

// Inicializar instancia de llamada
window.callClientInstance = new CallClient();

// Navegación entre pestañas
function switchTab(tabId) {
  // Ocultar todas las vistas
  document.querySelectorAll('.tab-view').forEach(view => view.classList.add('hidden'));
  
  // Desactivar botones de tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.classList.add('text-slate-400');
  });

  // Mostrar vista seleccionada
  const activeView = document.getElementById(`view-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activeView) activeView.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.classList.remove('text-slate-400');
  }

  // Si se cambia al historial de llamadas, refrescar tabla y métricas
  if (tabId === 'logs' && window.callLogsManager) {
    window.callLogsManager.loadLogs();
  }

  // Si se cambia a asistentes, refrescar lista
  if (tabId === 'assistants' && window.assistantsManager) {
    window.assistantsManager.loadAssistants();
  }

  lucide.createIcons();
}

// Manejador del botón principal de llamada (Iniciar / Colgar)
function handleCallButtonClick() {
  const client = window.callClientInstance;
  if (!client) return;

  if (client.status === 'idle') {
    const activeId = document.getElementById('active-assistant-select')?.value;
    const assistant = window.assistantsManager?.assistants.find(a => a.id === activeId) || 
                      window.assistantsManager?.assistants[0];
    client.startCall(assistant);
  } else {
    client.endCall();
  }
}

// Alternar mute
function toggleMute() {
  if (window.callClientInstance) {
    window.callClientInstance.toggleMute();
  }
}

// Envío de mensaje manual por teclado (ideal para pruebas rápidas sin micrófono)
function sendManualMessage() {
  const input = document.getElementById('manual-text-input');
  const text = input?.value.trim();
  if (!text) return;

  const client = window.callClientInstance;
  if (client.status === 'idle') {
    // Si la llamada no estaba iniciada, iniciarla automáticamente
    const activeId = document.getElementById('active-assistant-select')?.value;
    const assistant = window.assistantsManager?.assistants.find(a => a.id === activeId) || 
                      window.assistantsManager?.assistants[0];
    client.startCall(assistant).then(() => {
      setTimeout(() => {
        client.sendUserTurn(text);
      }, 1000);
    });
  } else {
    client.sendUserTurn(text);
  }

  input.value = '';
}

// Enviar con tecla Enter en el input de texto
document.getElementById('manual-text-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendManualMessage();
  }
});

// Cerrar modal de resumen
function closeSummaryModal() {
  document.getElementById('post-call-summary-modal')?.classList.add('hidden');
}

// Ver en historial desde el modal de resumen
function viewInLogsFromModal() {
  closeSummaryModal();
  switchTab('logs');
}

// Guardar API Keys
async function saveApiKeys() {
  const geminiKey = document.getElementById('input-gemini-key')?.value.trim();
  const openaiKey = document.getElementById('input-openai-key')?.value.trim();

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geminiApiKey: geminiKey,
        openaiApiKey: openaiKey
      })
    });
    const data = await res.json();
    const feedback = document.getElementById('settings-save-feedback');
    if (feedback) {
      feedback.classList.remove('hidden');
      setTimeout(() => feedback.classList.add('hidden'), 3000);
    }
  } catch (err) {
    alert('Error al guardar ajustes');
  }
}

function toggleAudioSettings() {
  alert('Configuración de Audio: El simulador utiliza la Web Speech API de tu navegador con cancelación de eco integrada. Puedes ajustar el volumen de tus bocinas directamente en tu sistema.');
}

// Inicialización de iconos de Lucide al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
});

