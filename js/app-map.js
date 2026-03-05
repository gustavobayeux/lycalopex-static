/**
 * app-map.js — Map-based search application
 *
 * Flow: Region → State → City → Load all companies for that city
 */

'use strict';

import { state, notify, exportCSV, loadCNPJs } from './store.js';
import { renderTable, showToast, renderStats } from './ui.js';
import {
  getAllRegions,
  getStatesInRegion,
  getCitiesInState,
  getRegionForState,
  buildRegionMap,
  buildStateSelector,
  buildCitySelector,
  STATE_NAMES,
} from './map-search.js';

// DOM elements
const regionMapContainer = document.getElementById('region-map-container');
const stateSelectorContainer = document.getElementById('state-selector-container');
const citySelectorContainer = document.getElementById('city-selector-container');
const resultsContainer = document.getElementById('results-container');
const tableContainer = document.getElementById('table-container');
const tableBody = document.getElementById('table-body');
const statsBar = document.getElementById('stats-bar');
const searchBreadcrumb = document.getElementById('search-breadcrumb');
const breadcrumbRegion = document.getElementById('breadcrumb-region');
const breadcrumbState = document.getElementById('breadcrumb-state');
const breadcrumbCity = document.getElementById('breadcrumb-city');

const filterType = document.getElementById('filter-type');
const filterEsg = document.getElementById('filter-esg');
const sortField = document.getElementById('sort-field');
const exportBtn = document.getElementById('export-csv');

// Current selection state
let selectedRegion = null;
let selectedState = null;
let selectedCity = null;

// ── Initialization ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
  attachEventListeners();
});

async function initializeUI() {
  // Load regional IBAMA data
  try {
    const response = await fetch('data/ibama-demo.json');
    if (response.ok) {
      const data = await response.json();
      // Convert CNPJ-keyed data to city-keyed data
      const cityData = {};
      for (const [cnpj, entries] of Object.entries(data)) {
        for (const entry of entries) {
          const cityKey = entry.municipio + ', ' + entry.uf;
          if (!cityData[cityKey]) cityData[cityKey] = [];
          cityData[cityKey].push({ cnpj: cnpj, municipio: entry.municipio, uf: entry.uf });
        }
      }
      state.regionalIbamaData = cityData;
    }
  } catch (e) {
    console.warn('Erro ao carregar dados IBAMA:', e.message);
  }

  // Render initial region map
  regionMapContainer.innerHTML = buildRegionMap();
  renderTypeFilter();
}

function attachEventListeners() {
  // Region / state / city selection (event delegation on document)
  document.addEventListener('click', (e) => {
    const regionBtn = e.target.closest && e.target.closest('.region-btn');
    if (regionBtn) {
      const region = regionBtn.dataset.region;
      if (region) selectRegion(region);
      return;
    }

    const stateBtn = e.target.closest && e.target.closest('.state-btn');
    if (stateBtn) {
      const state = stateBtn.dataset.state;
      if (state) selectState(state);
      return;
    }

    const cityBtn = e.target.closest && e.target.closest('.city-btn');
    if (cityBtn) {
      const city = cityBtn.dataset.city;
      const state = cityBtn.dataset.state;
      if (city && state) selectCity(city, state);
    }
  });

  // Filter and sort (defensive: only attach if elements exist)
  if (filterType) {
    filterType.addEventListener('change', applyFiltersAndSort);
  }
  if (filterEsg) {
    filterEsg.addEventListener('change', applyFiltersAndSort);
  }
  if (sortField) {
    sortField.addEventListener('change', applyFiltersAndSort);
  }

  // Export
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportCSV();
      showToast('CSV exportado com sucesso!');
    });
  }
}

// ── Region Selection ──────────────────────────────────────────────────────────

function selectRegion(region) {
  selectedRegion = region;
  selectedState = null;
  selectedCity = null;

  // Update UI
  document.querySelectorAll('.region-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.region === region);
  });

  // Show state selector
  stateSelectorContainer.innerHTML = buildStateSelector(region);
  stateSelectorContainer.classList.remove('hidden');
  citySelectorContainer.classList.add('hidden');

  // Clear results
  resultsContainer.innerHTML = '';
  tableContainer.classList.add('hidden');
  searchBreadcrumb.classList.add('hidden');

  // Update breadcrumb
  breadcrumbRegion.textContent = `📍 ${region}`;
  breadcrumbState.textContent = '';
  breadcrumbCity.textContent = '';
}

// ── State Selection ───────────────────────────────────────────────────────────

function selectState(state) {
  selectedState = state;
  selectedCity = null;

  // Update UI
  document.querySelectorAll('.state-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.state === state);
  });

  // Show city selector
  citySelectorContainer.innerHTML = buildCitySelector(state);
  citySelectorContainer.classList.remove('hidden');

  // Clear results
  resultsContainer.innerHTML = '';
  tableContainer.classList.add('hidden');
  searchBreadcrumb.classList.add('hidden');

  // Update breadcrumb
  breadcrumbState.textContent = `${STATE_NAMES[state]}`;
  breadcrumbCity.textContent = '';
}

// ── City Selection & Load ─────────────────────────────────────────────────────

async function selectCity(city, state) {
  selectedCity = city;

  // Update UI
  document.querySelectorAll('.city-btn').forEach(btn => {
    btn.classList.toggle('active',
      btn.dataset.city === city && btn.dataset.state === state);
  });

  // Show loading
  resultsContainer.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Carregando empresas de ${city}, ${state}...</p>
    </div>
  `;
  tableContainer.classList.add('hidden');
  searchBreadcrumb.classList.remove('hidden');

  // Update breadcrumb
  breadcrumbCity.classList.add('active');
  breadcrumbCity.textContent = `${city}`;

  // Load companies for this city
  await loadCompaniesForCity(city, state);

  // Show results
  renderResults();
}

// ── Load Companies ────────────────────────────────────────────────────────────

async function loadCompaniesForCity(city, state) {
  try {
    // Find all CNPJs for this city in our data
    const cnpjsInCity = findCNPJsInCity(city, state);

    if (cnpjsInCity.length === 0) {
      resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #999;">
          <p>Nenhuma empresa encontrada para ${city}, ${state}</p>
          <p style="font-size: 0.9rem; margin-top: 1rem;">
            Nota: Os dados disponíveis cobrem principalmente o Paraná (IBAMA) e algumas cidades de outros estados.
          </p>
        </div>
      `;
      return;
    }

    // Load each CNPJ
    state.loading = true;
    state.loadingMessage = `Carregando ${cnpjsInCity.length} empresa(s)...`;
    notify();

    // Use loadCNPJs to load all companies
    await loadCNPJs(cnpjsInCity);

    state.loading = false;
    state.filtered = [...state.records];
    notify();

  } catch (e) {
    console.error('Erro ao carregar cidades:', e);
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #e53e3e;">
        <p>Erro ao carregar dados: ${e.message}</p>
      </div>
    `;
  }
}

/**
 * Find all CNPJs for a given city
 * This searches across all available data sources
 */
function findCNPJsInCity(city, state) {
  const cnpjs = [];

  // Search in regional IBAMA data
  const regionalData = state.regionalIbamaData || {};
  const cityKey = `${city}, ${state}`;

  if (regionalData[cityKey]) {
    const companies = regionalData[cityKey];
    companies.forEach(c => {
      if (!cnpjs.includes(c.cnpj)) {
        cnpjs.push(c.cnpj);
      }
    });
  }

  // Also search by city name alone (case-insensitive)
  const cityLower = city.toLowerCase();
  for (const [key, companies] of Object.entries(regionalData)) {
    if (key.toLowerCase().includes(cityLower)) {
      companies.forEach(c => {
        if (!cnpjs.includes(c.cnpj)) {
          cnpjs.push(c.cnpj);
        }
      });
    }
  }

  return cnpjs;
}

// ── Render Results ────────────────────────────────────────────────────────────

function renderResults() {
  if (state.records.length === 0) {
    resultsContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #999;">
        Nenhuma empresa carregada
      </div>
    `;
    return;
  }

  // Apply filters and sort
  applyFiltersAndSort();

  // Show table
  resultsContainer.innerHTML = '';
  tableContainer.classList.remove('hidden');

  // Render stats
  renderStats(state);
  statsBar.classList.remove('hidden');

  // Render table
  renderTable(state);
}

// ── Filters & Sort ────────────────────────────────────────────────────────────

function applyFiltersAndSort() {
  // Apply filters
  state.filtered = state.records.filter(r => {
    // Type filter
    if (filterType.value && r.cnaeType !== filterType.value) {
      return false;
    }
    // ESG filter
    if (filterEsg.value && r.esgLabel !== filterEsg.value) {
      return false;
    }
    return true;
  });

  // Apply sort
  const sortField_ = sortField.value;
  state.filtered.sort((a, b) => {
    let av, bv;
    switch (sortField_) {
      case 'esg':
        av = a.esgScore || 0;
        bv = b.esgScore || 0;
        return bv - av; // descending
      case 'vulnerability':
        av = a.vulnerabilityScore;
        bv = b.vulnerabilityScore;
        return bv - av;
      case 'resistance':
        av = a.resistanceScore;
        bv = b.resistanceScore;
        return bv - av;
      case 'razaoSocial':
        av = a.razaoSocial;
        bv = b.razaoSocial;
        return av.localeCompare(bv, 'pt-BR');
      default:
        return 0;
    }
  });

  // Re-render
  renderTable(state);
  renderStats(state);
}

function renderTypeFilter() {
  const types = [...new Set(state.records.map(r => r.cnaeType).filter(Boolean))];
  filterType.innerHTML = '<option value="">Todos os tipos</option>';
  types.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    filterType.appendChild(option);
  });
}

// ── Load Regional IBAMA Data ──────────────────────────────────────────────────

async function loadRegionalIbamaData() {
  try {
    const res = await fetch('data/ibama-demo.json');
    const data = await res.json();

    // Organize by city
    const byCity = {};
    data.forEach(record => {
      const city = record.municipio;
      const state = record.uf;
      const key = `${city}, ${state}`;
      if (!byCity[key]) byCity[key] = [];
      byCity[key].push(record);
    });

    state.regionalIbamaData = byCity;
  } catch (e) {
    console.warn('Erro ao carregar dados regionais IBAMA:', e.message);
  }
}

// Load data on startup
loadRegionalIbamaData();
