/**
 * ui.js — UI rendering for Lycalopex
 *
 * Renders:
 *   - Filter bar (city search, type dropdown, score range, anti-corruption filter)
 *   - Results table with sortable columns
 *   - Expandable detail panel per row
 *   - Loading/error states
 *   - Summary stats bar
 */

'use strict';

import { state, setFilter, setSort, exportCSV, loadCNPJs, DEMO_CNPJS } from './store.js';

// ── DOM references ────────────────────────────────────────────────────────────

let tableBody, statsBar, filterCity, filterType, filterAntiCorr,
    loadingOverlay, loadingMsg, errorBanner, recordCount, exportBtn,
    cnpjInput, loadBtn;

export function initUI() {
  tableBody     = document.getElementById('table-body');
  statsBar      = document.getElementById('stats-bar');
  filterCity    = document.getElementById('filter-city');
  filterType    = document.getElementById('filter-type');
  filterAntiCorr= document.getElementById('filter-anticorr');
  loadingOverlay= document.getElementById('loading-overlay');
  loadingMsg    = document.getElementById('loading-msg');
  errorBanner   = document.getElementById('error-banner');
  recordCount   = document.getElementById('record-count');
  exportBtn     = document.getElementById('btn-export');
  cnpjInput     = document.getElementById('cnpj-input');
  loadBtn       = document.getElementById('btn-load');

  // Filter events
  filterCity.addEventListener('input', e => setFilter('city', e.target.value));
  filterType.addEventListener('change', e => setFilter('type', e.target.value));
  filterAntiCorr.addEventListener('change', e => setFilter('antiCorruption', e.target.value));

  // Sort headers
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      const currentDir = state.sort.field === field ? state.sort.dir : 'desc';
      const newDir = currentDir === 'desc' ? 'asc' : 'desc';
      setSort(field, newDir);
      updateSortIndicators(field, newDir);
    });
  });

  // Export
  exportBtn.addEventListener('click', () => {
    if (!state.filtered.length) {
      showToast('Nenhum dado para exportar.', 'warn');
      return;
    }
    exportCSV();
    showToast(`${state.filtered.length} registros exportados.`, 'ok');
  });

  // Load CNPJs
  loadBtn.addEventListener('click', handleLoad);
  cnpjInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLoad(); });

  // Demo button
  const demoBtn = document.getElementById('btn-demo');
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      cnpjInput.value = DEMO_CNPJS.join('\n');
      handleLoad();
    });
  }
}

async function handleLoad() {
  const raw = cnpjInput.value.trim();
  if (!raw) {
    showToast('Informe ao menos um CNPJ.', 'warn');
    return;
  }
  // Parse: one per line, or comma/semicolon separated
  const cnpjs = raw
    .split(/[\n,;]+/)
    .map(s => s.replace(/\D/g, ''))
    .filter(s => s.length === 14);

  if (!cnpjs.length) {
    showToast('Nenhum CNPJ válido encontrado (14 dígitos).', 'warn');
    return;
  }

  // Deduplicate
  const unique = [...new Set(cnpjs)];
  await loadCNPJs(unique);
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(s) {
  renderLoading(s);
  renderStats(s);
  renderTypeFilter(s);
  renderTable(s);
}

function renderLoading(s) {
  if (s.loading) {
    loadingOverlay.classList.remove('hidden');
    loadingMsg.textContent = s.loadingMessage || 'Carregando...';
  } else {
    loadingOverlay.classList.add('hidden');
  }
  if (s.error) {
    errorBanner.textContent = s.error;
    errorBanner.classList.remove('hidden');
  } else {
    errorBanner.classList.add('hidden');
  }
}

function renderStats(s) {
  const total = s.records.length;
  const shown = s.filtered.length;
  const critical = s.filtered.filter(r => r.vulnerabilityLabel === 'Crítico').length;
  const alerts   = s.filtered.filter(r => r.antiCorruptionStatus === 'Alerta').length;

  recordCount.textContent = `${shown} de ${total} estruturas`;

  statsBar.innerHTML = `
    <div class="stat-item">
      <span class="stat-value mono">${total}</span>
      <span class="stat-label">Total carregado</span>
    </div>
    <div class="stat-item">
      <span class="stat-value mono">${shown}</span>
      <span class="stat-label">Exibindo</span>
    </div>
    <div class="stat-item stat-critical">
      <span class="stat-value mono">${critical}</span>
      <span class="stat-label">Vulnerabilidade crítica</span>
    </div>
    <div class="stat-item stat-alert">
      <span class="stat-value mono">${alerts}</span>
      <span class="stat-label">Alertas anti-corrupção</span>
    </div>
  `;
}

function renderTypeFilter(s) {
  const current = filterType.value;
  filterType.innerHTML = '<option value="">Todos os tipos</option>';
  s.availableTypes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = capitalize(t);
    if (t === current) opt.selected = true;
    filterType.appendChild(opt);
  });
}

function renderTable(s) {
  if (!s.records.length && !s.loading) {
    tableBody.innerHTML = `
      <tr class="empty-state">
        <td colspan="10">
          <div class="empty-inner">
            <div class="empty-icon">⬡</div>
            <p>Nenhuma estrutura carregada.</p>
            <p class="empty-sub">Informe CNPJs no campo acima ou clique em <strong>Carregar Demo</strong>.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  if (!s.filtered.length && s.records.length) {
    tableBody.innerHTML = `
      <tr class="empty-state">
        <td colspan="10">
          <div class="empty-inner">
            <div class="empty-icon">⬡</div>
            <p>Nenhum resultado para os filtros aplicados.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  tableBody.innerHTML = s.filtered.map((r, idx) => buildRow(r, idx)).join('');

  // Attach expand listeners
  tableBody.querySelectorAll('.row-main').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      const detail = document.getElementById(`detail-${id}`);
      const isOpen = !detail.classList.contains('hidden');
      // Close all
      tableBody.querySelectorAll('.row-detail').forEach(d => d.classList.add('hidden'));
      tableBody.querySelectorAll('.row-main').forEach(r => r.classList.remove('expanded'));
      // Toggle
      if (!isOpen) {
        detail.classList.remove('hidden');
        row.classList.add('expanded');
      }
    });
  });
}

// ── Row builder ───────────────────────────────────────────────────────────────

function buildRow(r, idx) {
  const id = r.cnpj.replace(/\D/g, '');
  const vulnClass = vulnColorClass(r.vulnerabilityLabel);
  const envClass  = envColorClass(r.envLabel);
  const acClass   = acColorClass(r.antiCorruptionStatus);

  const address = [r.logradouro, r.numero, r.bairro, r.municipio, r.uf]
    .filter(Boolean).join(', ');

  const socioNames = r.socios.length
    ? r.socios.map(s => s.nome).join(', ')
    : '—';

  return `
    <tr class="row-main" data-id="${id}" title="Clique para expandir detalhes">
      <td class="col-rank">${idx + 1}</td>
      <td class="col-cnpj mono">${r.cnpj}</td>
      <td class="col-name">
        <div class="name-primary">${escHtml(r.razaoSocial)}</div>
        ${r.nomeFantasia ? `<div class="name-fantasy">${escHtml(r.nomeFantasia)}</div>` : ''}
        <div class="name-cnae">${escHtml(r.cnaeLabel)}</div>
      </td>
      <td class="col-city mono">${escHtml(r.municipio)}${r.uf ? `<span class="uf-badge">${r.uf}</span>` : ''}</td>
      <td class="col-vuln">
        <div class="score-cell ${vulnClass}">
          <span class="score-number">${r.vulnerabilityScore}</span>
          <span class="score-label">${r.vulnerabilityLabel}</span>
          <div class="score-bar"><div class="score-bar-fill" style="width:${r.vulnerabilityScore}%;background:${vulnBarColor(r.vulnerabilityLabel)}"></div></div>
        </div>
      </td>
      <td class="col-resist">
        <div class="score-cell">
          <span class="score-number">${r.resistanceScore}</span>
          <div class="score-bar"><div class="score-bar-fill" style="width:${r.resistanceScore}%;background:#38A169"></div></div>
        </div>
      </td>
      <td class="col-env">
        <span class="badge ${envClass}">${r.envLabel}</span>
      </td>
      <td class="col-ac">
        <div class="compliance-badges">
          <span class="badge ${acClass}" title="Anti-Corrupção (CEIS)">${r.antiCorruptionStatus === 'Alerta' ? 'AC' : 'OK'}</span>
          <span class="badge ${r.ibamaStatus === 'Alerta Ambiental' ? 'badge-risk' : 'badge-ok'}" title="Ambiental (IBAMA)">${r.ibamaStatus === 'Alerta Ambiental' ? 'AMB' : 'OK'}</span>
        </div>
      </td>
      <td class="col-ue">
        <div class="score-cell ${ueColorClass(r.urbanExploringLabel)}">
          <span class="score-number">${r.urbanExploringScore}</span>
          <span class="score-label">${r.urbanExploringLabel}</span>
        </div>
      </td>
      <td class="col-expand">
        <span class="expand-icon">▶</span>
      </td>
    </tr>
    <tr class="row-detail hidden" id="detail-${id}">
      <td colspan="10">
        ${buildDetailPanel(r)}
      </td>
    </tr>
  `;
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function buildDetailPanel(r) {
  const address = [
    r.logradouro, r.numero, r.complemento, r.bairro,
    r.municipio, r.uf, r.cep
  ].filter(Boolean).join(', ');

  const sociosHtml = r.socios.length
    ? r.socios.map(s => `
        <div class="socio-item">
          <span class="socio-name">${escHtml(s.nome)}</span>
          <span class="socio-cpf mono">${escHtml(s.cpfMasked)}</span>
          <span class="socio-qual">${escHtml(s.qualificacao)}</span>
          <span class="socio-hash mono" title="Hash do CPF para referência cruzada">ID: ${s.cpfHash}</span>
        </div>`).join('')
    : '<p class="no-data">Sócios não encontrados na base Brasil.IO.</p>';

  const breakdownHtml = Object.entries(r.resistanceBreakdown)
    .map(([k, v]) => `<div class="breakdown-item"><span>${escHtml(k)}</span><span class="mono">${v}</span></div>`)
    .join('');

  const envHtml = r.envIndicators
    .map(i => `<li>${escHtml(i)}</li>`).join('');

  const gapsHtml = r.securityGaps.length
    ? r.securityGaps.map(g => `
        <div class="gap-item gap-severity-${g.severity}">
          <div class="gap-header">
            <span class="gap-icon">${g.severity === 'critical' ? '🔴' : g.severity === 'high' ? '🟠' : '🟡'}</span>
            <span class="gap-title">${escHtml(g.title)}</span>
          </div>
          <p class="gap-desc">${escHtml(g.description)}</p>
          <p class="gap-rec"><strong>Recomendação:</strong> ${escHtml(g.recommendation)}</p>
        </div>`).join('')
    : '<p class="no-data">Nenhum gap crítico detectado automaticamente.</p>';

  const ibamaHtml = r.ibamaEntries.length
    ? r.ibamaEntries.map(e => `
        <div class="ibama-entry">
          <div class="ibama-meta">TAD: ${e.num_tad} | ${e.data}</div>
          <div class="ibama-desc">${escHtml(e.descricao)}</div>
          <div class="ibama-area">Área: ${e.area} ha | ${e.tipo}</div>
        </div>`).join('')
    : '';

  return `
    <div class="detail-panel">
      <div class="detail-grid">

        <!-- Column 1: Identification -->
        <div class="detail-section">
          <h3 class="detail-section-title">Identificação</h3>
          <table class="detail-table">
            <tr><td>CNPJ</td><td class="mono">${r.cnpj}</td></tr>
            <tr><td>Razão Social</td><td>${escHtml(r.razaoSocial)}</td></tr>
            ${r.nomeFantasia ? `<tr><td>Nome Fantasia</td><td>${escHtml(r.nomeFantasia)}</td></tr>` : ''}
            <tr><td>Situação</td><td><span class="badge ${r.situacao === 'ATIVA' ? 'badge-ok' : 'badge-risk'}">${r.situacao}</span></td></tr>
            <tr><td>Abertura</td><td class="mono">${r.abertura}</td></tr>
            <tr><td>Porte</td><td>${r.porte}</td></tr>
            <tr><td>Capital Social</td><td class="mono">R$ ${parseFloat(r.capitalSocial).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Atividade (CNAE)</td><td>${escHtml(r.cnaeLabel)}</td></tr>
            <tr><td>Tipo de Estrutura</td><td>${capitalize(r.cnaeType)}</td></tr>
          </table>

          <h3 class="detail-section-title mt">Endereço</h3>
          <p class="detail-address">${escHtml(address)}</p>
          ${r.telefone ? `<p class="detail-contact">Tel: ${escHtml(r.telefone)}</p>` : ''}
          ${r.email ? `<p class="detail-contact">Email: ${escHtml(r.email)}</p>` : ''}
        </div>

        <!-- Column 2: Scores -->
        <div class="detail-section">
          <h3 class="detail-section-title">Score de Vulnerabilidade a Incêndio</h3>
          <div class="big-score ${vulnColorClass(r.vulnerabilityLabel)}">
            <span class="big-score-number">${r.vulnerabilityScore}</span>
            <span class="big-score-label">${r.vulnerabilityLabel}</span>
          </div>
          <div class="score-bar big-bar">
            <div class="score-bar-fill" style="width:${r.vulnerabilityScore}%;background:${vulnBarColor(r.vulnerabilityLabel)}"></div>
          </div>

          <h3 class="detail-section-title mt">Score de Resistência Física</h3>
          <div class="big-score score-green">
            <span class="big-score-number">${r.resistanceScore}</span>
            <span class="big-score-label">/ 100</span>
          </div>
          <div class="score-bar big-bar">
            <div class="score-bar-fill" style="width:${r.resistanceScore}%;background:#38A169"></div>
          </div>

          <h3 class="detail-section-title mt">Composição do Score</h3>
          <div class="breakdown-list">${breakdownHtml}</div>

          <h3 class="detail-section-title mt">Justificativa Técnica</h3>
          <p class="justification-text">${escHtml(r.resistanceJustification)}</p>
        </div>

        <!-- Column 3: Partners & Compliance -->
        <div class="detail-section">
          <h3 class="detail-section-title">Sócios Administrativos</h3>
          <div class="socios-list">${sociosHtml}</div>
          <p class="data-note">CPFs exibidos apenas com máscara. Hash para referência cruzada sem exposição de dados pessoais.</p>

          <h3 class="detail-section-title mt">Status Anti-Corrupção</h3>
          <div class="ac-status-block">
            <span class="badge badge-lg ${acColorClass(r.antiCorruptionStatus)}">${r.antiCorruptionStatus}</span>
            <p class="ac-detail">${escHtml(r.antiCorruptionDetail)}</p>
            <p class="data-note">Fonte: Portal da Transparência (CEIS/CNEP).</p>
          </div>

          <h3 class="detail-section-title mt">Histórico Ambiental (IBAMA)</h3>
          <div class="ibama-block">
            <span class="badge badge-lg ${r.ibamaStatus === 'Alerta Ambiental' ? 'badge-risk' : 'badge-ok'}">${r.ibamaStatus}</span>
            <p class="ac-detail">${escHtml(r.ibamaDetail)}</p>
            <div class="ibama-entries-list">${ibamaHtml}</div>
            <p class="data-note">Fonte: IBAMA (Dados Abertos).</p>
          </div>

          <h3 class="detail-section-title mt">Risco Ambiental (Estimado)</h3>
          <div class="env-block">
            <div class="big-score ${envColorClass(r.envLabel)}">
              <span class="big-score-number">${r.envScore}</span>
              <span class="big-score-label">${r.envLabel}</span>
            </div>
            <ul class="env-indicators">${envHtml}</ul>
          </div>

          <h3 class="detail-section-title mt">Análise de Gaps de Segurança (Vendor Report)</h3>
          <div class="gaps-block">
            <div class="gaps-list">${gapsHtml}</div>
            <button class="btn btn-export btn-small mt" onclick="window.print()">
              ⎙ Imprimir Relatório de Gaps
            </button>
          </div>

          <h3 class="detail-section-title mt">Suscetibilidade a Acesso Não-Autorizado</h3>
          <div class="ue-block">
            <div class="big-score ${ueColorClass(r.urbanExploringLabel)}">
              <span class="big-score-number">${r.urbanExploringScore}</span>
              <span class="big-score-label">${r.urbanExploringLabel}</span>
            </div>
            <div class="score-bar big-bar">
              <div class="score-bar-fill" style="width:${r.urbanExploringScore}%;background:${ueBarColor(r.urbanExploringLabel)}"></div>
            </div>
            <div class="breakdown-list">${Object.entries(r.urbanExploringBreakdown).map(([k, v]) => `<div class="breakdown-item"><span>${escHtml(k)}</span><span class="mono">${v}</span></div>`).join('')}</div>
            <ul class="ue-indicators">${r.urbanExploringIndicators.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>
            <p class="data-note">Score baseado em análise de OpenStreetMap.</p>
          </div>

          <div class="detail-footer">
            <span class="data-note">Fontes: Receita Federal, Brasil.IO, Portal da Transparência, IBGE CNAE, OpenStreetMap.</span>
            <span class="data-note">Última atualização: ${r.lastUpdated}</span>
          </div>
        </div>

      </div>
    </div>
  `;
}

// ── Sort indicators ───────────────────────────────────────────────────────────

function updateSortIndicators(field, dir) {
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === field) {
      th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast toast-${type} visible`;
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function vulnColorClass(label) {
  switch (label) {
    case 'Crítico':  return 'score-critical';
    case 'Alto':     return 'score-high';
    case 'Moderado': return 'score-moderate';
    default:         return 'score-low';
  }
}

function vulnBarColor(label) {
  switch (label) {
    case 'Crítico':  return '#E53E3E';
    case 'Alto':     return '#F5A623';
    case 'Moderado': return '#D69E2E';
    default:         return '#38A169';
  }
}

function envColorClass(label) {
  switch (label) {
    case 'Elevado':  return 'badge-risk';
    case 'Moderado': return 'badge-warn';
    default:         return 'badge-ok';
  }
}

function acColorClass(status) {
  switch (status) {
    case 'Alerta':        return 'badge-risk';
    case 'Verificado':    return 'badge-ok';
    case 'Não encontrado':return 'badge-unknown';
    default:              return 'badge-pending';
  }
}

function ueColorClass(label) {
  switch (label) {
    case 'Crítico':  return 'score-critical';
    case 'Alto':     return 'score-high';
    case 'Moderado': return 'score-moderate';
    default:         return 'score-low';
  }
}

function ueBarColor(label) {
  switch (label) {
    case 'Crítico':  return '#E53E3E';
    case 'Alto':     return '#F5A623';
    case 'Moderado': return '#D69E2E';
    default:         return '#38A169';
  }
}
