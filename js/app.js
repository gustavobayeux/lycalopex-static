/**
 * app.js — Lycalopex v3 Main Application
 * 
 * Action-focused environmental intelligence for activists
 * Search by city → Analyze risk → Plan denunciation
 */

'use strict';

// DOM Elements (will be initialized after DOM loads)
let cityInput, searchBtn, loadingIndicator, loadingMessage, errorAlert, resultsSection, companyGrid, totalCount, highRiskCount, pagination, prevBtn, nextBtn, pageInfo, detailModal, detailContent, modalClose, modalOverlay;

// State
let currentPage = 1;
const pageSize = 9;
let allCompanies = [];

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Get DOM Elements
  cityInput = document.getElementById('cityInput');
  searchBtn = document.getElementById('searchBtn');
  loadingIndicator = document.getElementById('loadingIndicator');
  loadingMessage = document.getElementById('loadingMessage');
  errorAlert = document.getElementById('errorAlert');
  resultsSection = document.getElementById('resultsSection');
  companyGrid = document.getElementById('companyGrid');
  totalCount = document.getElementById('totalCount');
  highRiskCount = document.getElementById('highRiskCount');
  pagination = document.getElementById('pagination');
  prevBtn = document.getElementById('prevBtn');
  nextBtn = document.getElementById('nextBtn');
  pageInfo = document.getElementById('pageInfo');
  detailModal = document.getElementById('detailModal');
  detailContent = document.getElementById('detailContent');
  modalClose = document.querySelector('.modal-close');
  modalOverlay = document.querySelector('.modal-overlay');

  // Add Event Listeners
  searchBtn.addEventListener('click', handleSearch);
  cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  prevBtn.addEventListener('click', () => setPage(currentPage - 1));
  nextBtn.addEventListener('click', () => setPage(currentPage + 1));

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);

  console.log('Lycalopex v3 — Environmental Intelligence for Activists');
  console.log('Ready to search for companies with environmental risk');
});

// Search Handler
async function handleSearch() {
  const city = cityInput.value.trim();
  if (!city) {
    showError('Por favor, digite um município');
    return;
  }

  clearError();
  showLoading(true);
  resultsSection.classList.add('hidden');

  try {
    allCompanies = await searchCompanies(city);
    currentPage = 1;

    if (allCompanies.length === 0) {
      showError(`Nenhuma empresa encontrada para "${city}"`);
    } else {
      renderResults();
      resultsSection.classList.remove('hidden');
    }
  } catch (error) {
    showError(`Erro ao buscar empresas: ${error.message}`);
  } finally {
    showLoading(false);
  }
}

// Simulated API call - in production would call real API
async function searchCompanies(city) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return [
    {
      cnpj: '12345678000190',
      razaoSocial: 'Empresa Agrícola XYZ LTDA',
      municipio: city,
      uf: 'SP',
      cnae: '0115-1/01',
      cnaeLabel: 'Cultivo de soja',
      situacao: 'Ativa',
      abertura: '2023-01-15',
      score: 78,
      riskLevel: 'Alto',
      riskFactors: ['Empresa nova em zona rural', 'Capital social baixo', 'CNAE agrícola de risco']
    },
    {
      cnpj: '98765432000101',
      razaoSocial: 'Pecuária do Centro LTDA',
      municipio: city,
      uf: 'SP',
      cnae: '0151-7/01',
      cnaeLabel: 'Criação de gado',
      situacao: 'Ativa',
      abertura: '2022-06-20',
      score: 65,
      riskLevel: 'Médio',
      riskFactors: ['Localização próxima a área de desmatamento']
    },
    {
      cnpj: '11111111000111',
      razaoSocial: 'Comércio Geral ABC',
      municipio: city,
      uf: 'SP',
      cnae: '4711-3/01',
      cnaeLabel: 'Comércio varejista',
      situacao: 'Ativa',
      abertura: '2020-03-10',
      score: 35,
      riskLevel: 'Baixo',
      riskFactors: []
    }
  ];
}

// Render Results
function renderResults() {
  const paginatedCompanies = getPaginatedCompanies();
  
  const highRisk = allCompanies.filter(c => c.score >= 70).length;
  totalCount.textContent = allCompanies.length;
  highRiskCount.textContent = highRisk;

  companyGrid.innerHTML = paginatedCompanies.map(company => renderCard(company)).join('');

  document.querySelectorAll('.company-card').forEach((card, idx) => {
    card.addEventListener('click', () => showDetail(paginatedCompanies[idx]));
  });

  updatePagination();
}

// Render Company Card
function renderCard(company) {
  const riskClass = company.score >= 70 ? 'risk-high' : company.score >= 50 ? 'risk-medium' : 'risk-low';
  const scoreClass = company.score >= 70 ? 'high' : company.score >= 50 ? 'medium' : 'low';

  return `
    <div class="company-card ${riskClass}">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(company.razaoSocial)}</div>
          <div class="card-cnpj">${formatCNPJ(company.cnpj)}</div>
        </div>
        <div class="risk-badge">
          <div class="risk-score ${scoreClass}">${company.score}</div>
          <div class="risk-label">${company.riskLevel}</div>
        </div>
      </div>

      <div class="card-body">
        <div>
          <div class="card-field-label">Município</div>
          <div class="card-field-value">${escapeHtml(company.municipio)}, ${company.uf}</div>
        </div>
        <div>
          <div class="card-field-label">Atividade</div>
          <div class="card-field-value">${escapeHtml(company.cnaeLabel)}</div>
        </div>
      </div>

      ${company.riskFactors.length > 0 ? `
        <div class="risk-factors">
          <div class="risk-factors-title">Fatores de Risco:</div>
          <ul class="risk-factors-list">
            ${company.riskFactors.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="card-actions">
        <button class="btn btn-primary">Ver Detalhes</button>
        <button class="btn btn-primary">Plano de Ação</button>
      </div>
    </div>
  `;
}

// Show Detail Modal
function showDetail(company) {
  detailContent.innerHTML = `
    <h2>${escapeHtml(company.razaoSocial)}</h2>
    <p>${formatCNPJ(company.cnpj)}</p>

    <div class="detail-section">
      <h3>Informações Básicas</h3>
      <div class="detail-grid">
        <div>
          <div class="detail-item-label">CNPJ</div>
          <div class="detail-item-value">${formatCNPJ(company.cnpj)}</div>
        </div>
        <div>
          <div class="detail-item-label">Município</div>
          <div class="detail-item-value">${escapeHtml(company.municipio)}, ${company.uf}</div>
        </div>
        <div>
          <div class="detail-item-label">Atividade (CNAE)</div>
          <div class="detail-item-value">${escapeHtml(company.cnaeLabel)}</div>
        </div>
        <div>
          <div class="detail-item-label">Situação</div>
          <div class="detail-item-value">${escapeHtml(company.situacao)}</div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3>Análise de Risco</h3>
      <div class="detail-grid">
        <div>
          <div class="detail-item-label">Score Composto</div>
          <div class="detail-item-value" style="font-size: 1.3rem; font-weight: bold; color: ${company.score >= 70 ? '#d32f2f' : '#f57c00'};">
            ${company.score}/100
          </div>
        </div>
        <div>
          <div class="detail-item-label">Nível de Risco</div>
          <div class="detail-item-value" style="font-weight: bold;">${company.riskLevel}</div>
        </div>
      </div>
    </div>

    ${company.riskFactors.length > 0 ? `
      <div class="detail-section">
        <h3>Fatores de Risco Detectados</h3>
        <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem;">
          ${company.riskFactors.map(f => `<li style="padding-left: 1.5rem; position: relative;"><span style="position: absolute; left: 0;">⚠</span>${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    <div class="detail-section">
      <div class="action-plan">
        <h4>📋 Plano de Ação para Denúncia ao IBAMA</h4>
        <ol>
          <li>
            <strong>Reunir Evidências:</strong>
            <ul style="margin-top: 0.25rem; margin-left: 1rem;">
              <li>Documentar localização exata (GPS, Google Maps)</li>
              <li>Tirar fotos/vídeos de atividades suspeitas</li>
              <li>Registrar data, hora e condições climáticas</li>
              <li>Anotar nomes de equipamentos e placas de veículos</li>
            </ul>
          </li>
          <li>
            <strong>Verificar Informações:</strong>
            <ul style="margin-top: 0.25rem; margin-left: 1rem;">
              <li>Confirmar CNPJ: <code style="background: #f0f0f0; padding: 0.2rem 0.4rem; border-radius: 3px;">${formatCNPJ(company.cnpj)}</code></li>
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
              <li><strong>Polícia Ambiental ${company.uf}:</strong> Contato estadual</li>
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

  detailModal.classList.remove('hidden');
}

// Close Modal
function closeModal() {
  detailModal.classList.add('hidden');
}

// Pagination
function getPaginatedCompanies() {
  const start = (currentPage - 1) * pageSize;
  return allCompanies.slice(start, start + pageSize);
}

function getTotalPages() {
  return Math.ceil(allCompanies.length / pageSize);
}

function setPage(page) {
  const totalPages = getTotalPages();
  if (page >= 1 && page <= totalPages) {
    currentPage = page;
    renderResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function updatePagination() {
  const totalPages = getTotalPages();
  if (totalPages > 1) {
    pagination.classList.remove('hidden');
    pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
  } else {
    pagination.classList.add('hidden');
  }
}

// Utilities
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatCNPJ(cnpj) {
  const c = (cnpj || '').replace(/\D/g, '');
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function showLoading(show) {
  if (show) {
    loadingIndicator.classList.remove('hidden');
    loadingMessage.textContent = 'Buscando empresas...';
  } else {
    loadingIndicator.classList.add('hidden');
  }
}

function showError(message) {
  errorAlert.textContent = message;
  errorAlert.classList.remove('hidden');
}

function clearError() {
  errorAlert.classList.add('hidden');
}
