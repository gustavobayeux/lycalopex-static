/**
 * app-new.js — Main application controller for Lycalopex v3
 *
 * Handles:
 *   - Search interaction
 *   - Result rendering
 *   - Modal display
 *   - Filter and sort logic
 *   - Action plan generation
 */

'use strict';

import { state, subscribe, searchOutlawsByCity, setFilter, setSort, setPage, getPaginatedRecords, getTotalPages, fmtCNPJ, formatDate } from './store.js';

// ── DOM Elements ──────────────────────────────────────────────────────────────

const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const loadingMessage = document.getElementById('loadingMessage');
const errorAlert = document.getElementById('errorAlert');
const resultsSection = document.getElementById('results');
const companyList = document.getElementById('companyList');
const resultCount = document.getElementById('resultCount');
const highRiskCount = document.getElementById('highRiskCount');
const typeFilter = document.getElementById('typeFilter');
const sortFilter = document.getElementById('sortFilter');
const antiCorruptionFilter = document.getElementById('antiCorruptionFilter');
const pagination = document.getElementById('pagination');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const detailModal = document.getElementById('detailModal');
const detailContent = document.getElementById('detailContent');
const modalClose = document.querySelector('.modal-close');

// ── Event Listeners ───────────────────────────────────────────────────────────

searchBtn.addEventListener('click', handleSearch);
cityInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSearch();
});

typeFilter.addEventListener('change', (e) => setFilter('type', e.target.value));
sortFilter.addEventListener('change', (e) => setSort(e.target.value));
antiCorruptionFilter.addEventListener('change', (e) => setFilter('antiCorruptionOnly', e.target.checked));

prevBtn.addEventListener('click', () => setPage(state.currentPage - 1));
nextBtn.addEventListener('click', () => setPage(state.currentPage + 1));

modalClose.addEventListener('click', () => detailModal.classList.add('hidden'));
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) detailModal.classList.add('hidden');
});

// ── State Subscription ────────────────────────────────────────────────────────

subscribe((newState) => {
  updateUI(newState);
});

// ── Search Handler ────────────────────────────────────────────────────────────

async function handleSearch() {
  const city = cityInput.value.trim();
  if (!city) {
    errorAlert.textContent = 'Por favor, digite um município';
    errorAlert.classList.remove('hidden');
    return;
  }

  errorAlert.classList.add('hidden');
  await searchOutlawsByCity(city);
}

// ── UI Update ─────────────────────────────────────────────────────────────────

function updateUI(newState) {
  // Loading state
  if (newState.loading) {
    loadingIndicator.classList.remove('hidden');
    loadingMessage.textContent = newState.loadingMessage;
    resultsSection.classList.add('hidden');
  } else {
    loadingIndicator.classList.add('hidden');
  }

  // Error state
  if (newState.error) {
    errorAlert.textContent = newState.error;
    errorAlert.classList.remove('hidden');
    resultsSection.classList.add('hidden');
  } else {
    errorAlert.classList.add('hidden');
  }

  // Results state
  if (newState.records.length > 0 && !newState.loading) {
    resultsSection.classList.remove('hidden');
    renderResults(newState);
  } else if (!newState.loading && !newState.error) {
    resultsSection.classList.add('hidden');
  }
}

// ── Render Results ────────────────────────────────────────────────────────────

function renderResults(newState) {
  // Update stats
  resultCount.textContent = `${newState.filtered.length} empresa(s) encontrada(s)`;
  const highRisk = newState.filtered.filter(r => r.compositeScore >= 70).length;
  highRiskCount.textContent = `${highRisk} Alto Risco`;

  // Render company cards
  const records = getPaginatedRecords();
  companyList.innerHTML = records.map(record => renderCompanyCard(record)).join('');

  // Add click handlers to cards
  document.querySelectorAll('.company-card').forEach((card, idx) => {
    card.addEventListener('click', () => showDetail(records[idx]));
  });

  // Update pagination
  const totalPages = getTotalPages();
  if (totalPages > 1) {
    pagination.classList.remove('hidden');
    pageInfo.textContent = `Página ${newState.currentPage} de ${totalPages}`;
    prevBtn.disabled = newState.currentPage === 1;
    nextBtn.disabled = newState.currentPage === totalPages;
  } else {
    pagination.classList.add('hidden');
  }
}

// ── Render Company Card ───────────────────────────────────────────────────────

function renderCompanyCard(record) {
  const riskClass = record.compositeScore >= 70 ? 'risk-high' : 
                    record.compositeScore >= 50 ? 'risk-medium' : 'risk-low';
  const riskLabel = record.compositeScore >= 70 ? 'Alto' : 
                    record.compositeScore >= 50 ? 'Médio' : 'Baixo';
  const scoreClass = record.compositeScore >= 70 ? 'high' : 
                     record.compositeScore >= 50 ? 'medium' : 'low';

  const riskFactors = (record.localRiskFactors || []).slice(0, 3);

  return `
    <div class="company-card ${riskClass}">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(record.razaoSocial)}</div>
          <div class="card-cnpj">${fmtCNPJ(record.cnpj)}</div>
        </div>
        <div class="risk-score">
          <div class="risk-score-value ${scoreClass}">${record.compositeScore}</div>
          <div class="risk-score-label">${riskLabel}</div>
        </div>
      </div>

      <div class="card-body">
        <div class="card-field">
          <span class="card-field-label">Município</span>
          <span class="card-field-value">${escapeHtml(record.municipio)}, ${record.uf}</span>
        </div>
        <div class="card-field">
          <span class="card-field-label">Atividade</span>
          <span class="card-field-value">${escapeHtml(record.cnaeLabel || 'N/A')}</span>
        </div>
        <div class="card-field">
          <span class="card-field-label">Situação</span>
          <span class="card-field-value">${escapeHtml(record.situacao || 'N/A')}</span>
        </div>
        <div class="card-field">
          <span class="card-field-label">Risco Ambiental</span>
          <span class="card-field-value">${record.alternativeRiskLevel || 'N/A'}</span>
        </div>
      </div>

      ${riskFactors.length > 0 ? `
        <div class="risk-factors">
          <div class="risk-factors-title">Fatores de Risco Detectados:</div>
          <ul class="risk-factors-list">
            ${riskFactors.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="card-actions">
        <button class="btn btn-primary" onclick="window.showDetail(event)">Ver Detalhes</button>
        <button class="btn btn-danger" onclick="window.showActionPlan(event)">Plano de Ação</button>
      </div>
    </div>
  `;
}

// ── Show Detail Modal ─────────────────────────────────────────────────────────

window.showDetail = function(event) {
  event.stopPropagation();
  const card = event.target.closest('.company-card');
  const cnpj = card.querySelector('.card-cnpj').textContent.replace(/\D/g, '');
  const record = state.records.find(r => r.cnpj.replace(/\D/g, '') === cnpj);
  if (record) showDetailModal(record);
};

function showDetailModal(record) {
  detailContent.innerHTML = renderDetailView(record);
  detailModal.classList.remove('hidden');
}

function renderDetailView(record) {
  const riskLevel = record.compositeScore >= 70 ? 'CRÍTICO' : 
                    record.compositeScore >= 50 ? 'ALTO' : 'MÉDIO';

  return `
    <h2>${escapeHtml(record.razaoSocial)}</h2>
    <p style="color: #666; margin-bottom: 1.5rem;">${fmtCNPJ(record.cnpj)}</p>

    <div class="detail-section">
      <h3>Informações Básicas</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-item-label">CNPJ</span>
          <span class="detail-item-value">${fmtCNPJ(record.cnpj)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Razão Social</span>
          <span class="detail-item-value">${escapeHtml(record.razaoSocial)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Município</span>
          <span class="detail-item-value">${escapeHtml(record.municipio)}, ${record.uf}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Atividade (CNAE)</span>
          <span class="detail-item-value">${escapeHtml(record.cnaeLabel || 'N/A')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Situação Cadastral</span>
          <span class="detail-item-value">${escapeHtml(record.situacao || 'N/A')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Data de Abertura</span>
          <span class="detail-item-value">${formatDate(record.abertura) || 'N/A'}</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3>Análise de Risco</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-item-label">Score Composto</span>
          <span class="detail-item-value" style="font-size: 1.3rem; font-weight: bold; color: ${record.compositeScore >= 70 ? '#d32f2f' : '#f57c00'};">
            ${record.compositeScore}/100
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Nível de Risco</span>
          <span class="detail-item-value" style="font-weight: bold;">${riskLevel}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Risco Ambiental</span>
          <span class="detail-item-value">${record.alternativeRiskLevel || 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Risco de Desmatamento</span>
          <span class="detail-item-value">${record.deforestationAnalysis?.deforestationRisk || 0}/100</span>
        </div>
      </div>
    </div>

    ${record.localRiskFactors && record.localRiskFactors.length > 0 ? `
      <div class="detail-section">
        <h3>Fatores de Risco Local</h3>
        <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem;">
          ${record.localRiskFactors.map(f => `<li style="padding-left: 1.5rem; position: relative;"><span style="position: absolute; left: 0;">⚠</span>${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    ${record.pepAnalysis && record.pepAnalysis.possiblePEPs.length > 0 ? `
      <div class="detail-section">
        <h3>Possíveis PEPs Detectados</h3>
        <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.75rem;">
          ${record.pepAnalysis.possiblePEPs.map(p => `
            <li style="padding: 0.75rem; background: #fff3e0; border-left: 3px solid #f57c00; padding-left: 1rem;">
              <strong>${escapeHtml(p.nome)}</strong><br>
              <small>${escapeHtml(p.qualificacao)}</small>
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''}

    ${renderActionPlanSection(record)}
  `;
}

// ── Action Plan ───────────────────────────────────────────────────────────────

window.showActionPlan = function(event) {
  event.stopPropagation();
  const card = event.target.closest('.company-card');
  const cnpj = card.querySelector('.card-cnpj').textContent.replace(/\D/g, '');
  const record = state.records.find(r => r.cnpj.replace(/\D/g, '') === cnpj);
  if (record) {
    detailContent.innerHTML = renderDetailView(record);
    detailModal.classList.remove('hidden');
    // Scroll to action plan
    setTimeout(() => {
      const actionPlan = detailContent.querySelector('.action-plan');
      if (actionPlan) actionPlan.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }
};

function renderActionPlanSection(record) {
  const riskFactors = (record.localRiskFactors || []);
  const hasGrilhagem = riskFactors.some(f => f.toLowerCase().includes('grilhagem'));
  const hasDesmatamento = (record.deforestationAnalysis?.deforestationRisk || 0) > 30;

  return `
    <div class="detail-section">
      <div class="action-plan">
        <h4>📋 Plano de Ação para Denúncia ao IBAMA</h4>
        <ol>
          <li>
            <strong>Reunir Evidências:</strong>
            <ul style="margin-top: 0.25rem; margin-left: 1rem;">
              <li>Documentar localização exata (GPS, Google Maps)</li>
              <li>Tirar fotos/vídeos de ${hasDesmatamento ? 'desmatamento ou queimadas' : 'atividades suspeitas'}</li>
              <li>Registrar data, hora e condições climáticas</li>
              ${hasGrilhagem ? '<li>Documentar padrões de grilhagem (empresa nova, capital baixo, zona rural)</li>' : ''}
            </ul>
          </li>
          <li>
            <strong>Verificar Informações:</strong>
            <ul style="margin-top: 0.25rem; margin-left: 1rem;">
              <li>Confirmar CNPJ: <code style="background: #f0f0f0; padding: 0.2rem 0.4rem; border-radius: 3px;">${fmtCNPJ(record.cnpj)}</code></li>
              <li>Verificar proprietário do imóvel (SNCR/Cartório)</li>
              <li>Consultar se há embargos anteriores</li>
              <li>Verificar se há licenças ambientais válidas</li>
            </ul>
          </li>
          <li>
            <strong>Fazer a Denúncia:</strong>
            <ul style="margin-top: 0.25rem; margin-left: 1rem;">
              <li><strong>IBAMA:</strong> 0800-61-8080 ou <a href="https://www.ibama.gov.br" target="_blank">ibama.gov.br</a></li>
              <li><strong>Disque Denúncia:</strong> 181 (Polícia Federal)</li>
              <li><strong>Polícia Ambiental ${record.uf}:</strong> Contato estadual</li>
              <li>Enviar documentação por email ou presencialmente</li>
            </ul>
          </li>
          <li>
            <strong>Acompanhamento:</strong>
            <ul style="margin-top: 0.25rem; margin-left: 1rem;">
              <li>Solicitar número do protocolo de denúncia</li>
              <li>Acompanhar via Portal de Transparência do IBAMA</li>
              <li>Apresentar novas evidências se necessário</li>
              <li>Contatar MP se houver demora na investigação</li>
            </ul>
          </li>
        </ol>
      </div>
    </div>
  `;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Initialize ────────────────────────────────────────────────────────────────

console.log('Lycalopex v3 — On-Demand Environmental Intelligence');
console.log('Ready for action-focused environmental denunciation');
