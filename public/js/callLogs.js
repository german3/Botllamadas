/**
 * VoxPulse Call Logs & Analytics Manager
 * Registro histórico de llamadas, reproducción de audio, visor de transcripción y resúmenes
 */

class CallLogsManager {
  constructor() {
    this.calls = [];
    this.filteredCalls = [];
    this.loadLogs();
  }

  async loadLogs() {
    try {
      const res = await fetch('/api/calls');
      this.calls = await res.json();
      this.filteredCalls = [...this.calls];
      this.updateMetrics();
      this.renderTable();
    } catch (err) {
      console.error('Error al cargar historial de llamadas:', err);
    }
  }

  updateMetrics() {
    const total = this.calls.length;
    document.getElementById('metric-total-calls').textContent = total;

    if (total === 0) {
      document.getElementById('metric-avg-duration').textContent = '0s';
      document.getElementById('metric-positive-pct').textContent = '100%';
      document.getElementById('metric-total-turns').textContent = '0';
      return;
    }

    // Duración promedio
    const totalDuration = this.calls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0);
    const avgDuration = Math.round(totalDuration / total);
    const avgMins = Math.floor(avgDuration / 60);
    const avgSecs = avgDuration % 60;
    document.getElementById('metric-avg-duration').textContent = 
      avgMins > 0 ? `${avgMins}m ${avgSecs}s` : `${avgSecs}s`;

    // Porcentaje de Sentimiento Positivo
    const positiveCount = this.calls.filter(c => c.summary?.sentiment === 'Positivo').length;
    const posPct = Math.round((positiveCount / total) * 100);
    document.getElementById('metric-positive-pct').textContent = `${posPct}%`;

    // Turnos totales procesados
    const totalTurns = this.calls.reduce((acc, c) => acc + (c.transcript ? c.transcript.length : 0), 0);
    document.getElementById('metric-total-turns').textContent = totalTurns;
  }

  renderTable() {
    const tbody = document.getElementById('calls-table-body');
    if (!tbody) return;

    if (this.filteredCalls.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-slate-500 text-sm">
            No se encontraron llamadas registradas con los filtros actuales.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = this.filteredCalls.map(c => {
      const dateStr = new Date(c.startedAt).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const sentiment = c.summary?.sentiment || 'Neutral';
      let sentBadgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
      if (sentiment === 'Positivo') sentBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      if (sentiment === 'Negativo') sentBadgeClass = 'bg-red-500/10 text-red-400 border-red-500/20';

      const durationStr = `${Math.floor((c.durationSeconds || 0) / 60)}m ${(c.durationSeconds || 0) % 60}s`;
      const overviewSnippet = c.summary?.overview 
        ? (c.summary.overview.length > 70 ? c.summary.overview.substring(0, 70) + '...' : c.summary.overview)
        : 'Sin resumen disponible';

      return `
        <tr class="hover:bg-slate-900/50 transition-colors">
          <td class="px-6 py-4">
            <span class="font-mono text-xs text-slate-400 block">${c.id}</span>
            <span class="text-xs text-slate-500">${dateStr}</span>
          </td>
          <td class="px-6 py-4">
            <div class="flex items-center space-x-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span class="font-medium text-slate-200 text-xs">${c.assistantName || 'Asistente'}</span>
            </div>
            <span class="text-[10px] text-slate-500 capitalize">${c.type || 'Web Call'}</span>
          </td>
          <td class="px-6 py-4 font-mono text-xs text-slate-300">
            ${durationStr}
          </td>
          <td class="px-6 py-4">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold border ${sentBadgeClass}">
              ${sentiment}
            </span>
          </td>
          <td class="px-6 py-4 text-xs text-slate-300 max-w-xs">
            ${overviewSnippet}
          </td>
          <td class="px-6 py-4 text-right">
            <div class="flex items-center justify-end space-x-2">
              <button onclick="openCallDetail('${c.id}')" class="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center space-x-1 transition-all">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                <span>Ver Resumen</span>
              </button>
              <button onclick="deleteCall('${c.id}')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all" title="Eliminar registro">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  }

  filterLogs() {
    const search = document.getElementById('log-search-input')?.value.toLowerCase().trim() || '';
    const sentiment = document.getElementById('log-filter-sentiment')?.value || '';

    this.filteredCalls = this.calls.filter(c => {
      const matchSentiment = !sentiment || (c.summary?.sentiment?.toLowerCase() === sentiment.toLowerCase());
      
      const matchSearch = !search ||
        (c.id && c.id.toLowerCase().includes(search)) ||
        (c.assistantName && c.assistantName.toLowerCase().includes(search)) ||
        (c.summary?.overview && c.summary.overview.toLowerCase().includes(search)) ||
        (c.transcript && c.transcript.some(t => t.content && t.content.toLowerCase().includes(search)));

      return matchSentiment && matchSearch;
    });

    this.renderTable();
  }

  exportCSV() {
    if (this.calls.length === 0) {
      alert('No hay llamadas para exportar.');
      return;
    }

    const headers = ['ID', 'Fecha', 'Asistente', 'Duración (seg)', 'Sentimiento', 'Turnos', 'Resumen', 'Cliente'];
    const rows = this.calls.map(c => [
      c.id,
      new Date(c.startedAt).toISOString(),
      `"${c.assistantName || 'Asistente'}"`,
      c.durationSeconds || 0,
      c.summary?.sentiment || 'N/A',
      c.transcript ? c.transcript.length : 0,
      `"${(c.summary?.overview || '').replace(/"/g, '""')}"`,
      `"${(c.summary?.extractedData?.cliente || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `VoxPulse_Llamadas_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

window.callLogsManager = new CallLogsManager();

function filterCallLogs() {
  window.callLogsManager.filterLogs();
}

function exportLogsCSV() {
  window.callLogsManager.exportCSV();
}

async function deleteCall(id) {
  if (!confirm('¿Deseas eliminar este registro de llamada?')) return;
  try {
    await fetch(`/api/calls/${id}`, { method: 'DELETE' });
    window.callLogsManager.loadLogs();
  } catch (err) {
    alert('Error al eliminar');
  }
}

function openCallDetail(id) {
  const call = window.callLogsManager.calls.find(c => c.id === id);
  if (!call) return;

  document.getElementById('detail-modal-title').textContent = `Llamada con ${call.assistantName || 'Asistente'}`;
  document.getElementById('detail-modal-subtitle').textContent = `ID: ${call.id} • ${new Date(call.startedAt).toLocaleString()}`;

  const summary = call.summary || {};
  const sentiment = summary.sentiment || 'Neutral';
  let sentBadgeColor = 'text-cyan-400';
  if (sentiment === 'Positivo') sentBadgeColor = 'text-emerald-400';
  if (sentiment === 'Negativo') sentBadgeColor = 'text-red-400';

  const mins = Math.floor((call.durationSeconds || 0) / 60).toString().padStart(2, '0');
  const secs = ((call.durationSeconds || 0) % 60).toString().padStart(2, '0');

  const content = document.getElementById('detail-modal-content');
  content.innerHTML = `
    <!-- Ficha de métricas de la llamada -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-400">Sentimiento</span>
        <p class="mt-1 font-bold text-sm ${sentBadgeColor}">${sentiment}</p>
      </div>
      <div class="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-400">Duración</span>
        <p class="mt-1 font-bold text-sm text-slate-200">${mins}:${secs}</p>
      </div>
      <div class="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-400">Turnos Totales</span>
        <p class="mt-1 font-bold text-sm text-slate-200">${call.transcript ? call.transcript.length : 0}</p>
      </div>
      <div class="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-400">Calidad</span>
        <p class="mt-1 font-bold text-sm text-cyan-400">${summary.callQualityScore || 9} / 10</p>
      </div>
    </div>

    <!-- Audio Player si existe grabación -->
    ${call.audioUrl ? `
      <div class="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <span class="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">Reproducción de la Llamada:</span>
        <audio src="${call.audioUrl}" controls class="w-full h-10"></audio>
      </div>
    ` : ''}

    <!-- Resumen Ejecutivo -->
    <div class="space-y-2">
      <h5 class="text-xs uppercase tracking-wider font-semibold text-slate-400">Resumen Ejecutivo</h5>
      <p class="text-sm text-slate-200 bg-slate-900/60 p-4 rounded-xl border border-slate-800 leading-relaxed">
        ${summary.overview || 'Sin resumen disponible.'}
      </p>
    </div>

    <!-- Puntos clave y Acciones -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-2">
        <h5 class="text-xs uppercase tracking-wider font-semibold text-slate-400">Puntos Clave</h5>
        <ul class="space-y-2 text-xs text-slate-300 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          ${(summary.keyPoints || ['Sin puntos destacados']).map(p => `<li>• ${p}</li>`).join('')}
        </ul>
      </div>
      <div class="space-y-2">
        <h5 class="text-xs uppercase tracking-wider font-semibold text-slate-400">Acciones a Seguir</h5>
        <ul class="space-y-2 text-xs text-slate-300 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          ${(summary.actionItems || ['Sin tareas pendientes']).map(a => `<li>→ ${a}</li>`).join('')}
        </ul>
      </div>
    </div>

    <!-- Transcripción Turno por Turno Completa -->
    <div class="space-y-2 pt-2">
      <h5 class="text-xs uppercase tracking-wider font-semibold text-slate-400">Transcripción Completa</h5>
      <div class="space-y-3 max-h-72 overflow-y-auto custom-scrollbar bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        ${(call.transcript || []).map(t => `
          <div class="text-xs ${t.role === 'assistant' ? 'text-emerald-300' : 'text-blue-300'}">
            <span class="font-bold">${t.role === 'assistant' ? call.assistantName : 'Cliente'}:</span>
            <span class="text-slate-300 ml-1 font-normal">${t.content}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('call-detail-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeCallDetailModal() {
  document.getElementById('call-detail-modal').classList.add('hidden');
}

