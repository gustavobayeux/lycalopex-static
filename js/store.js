/**
 * store.js — Application state management for Lycalopex v3 (On-Demand)
 *
 * Manages:
 *   - Loaded company records (on-demand search)
 *   - Filter state (city, type, score range, anti-corruption)
 *   - Sort order (default: highest vulnerability first)
 *   - Loading/error states
 *   - SessionStorage cache (1h TTL)
 *
 * NEW: On-demand search by city via Brasil.IO + real-time risk analysis
 * NO dependency on pre-cached IBAMA data
 */

'use strict';

import { fetchCNPJ, extractSocios, checkSancoesCNPJ, checkAntiCorrupcaoBR, checkIbamaEmbargos, fetchSociosBrasilIO, checkPessoaJuridica, sequentialQueue } from './api.js';
import { runESGIntelligence } from './esg-intelligence.js';
import { calcResistanceScore, calcVulnerabilityScore, calcEnvScore, getCNAEProfile, maskCPF, hashCPF } from './scoring.js';
import { calcUrbanExploringScore } from './urban-exploring.js';
import { analyzeSecurityGaps } from './gap-analysis.js';
import { runProcurementIntelligence } from './comprasnet.js';
import { searchCompaniesByCity, analyzeLocalRisk, detectGrilhagePattern } from './city-search-ondemand.js';
import { runAlternativeRiskAnalysis } from './risk-analysis-alternative.js';

// ── Cache helpers ─────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'lycalopex_v3_';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* storage full */ }
}

// ── Application state ─────────────────────────────────────────────────────────

export const state = {
  /** @type {CompanyRecord[]} */
  records: [],
  /** @type {CompanyRecord[]} */
  filtered: [],

  // Filters
  filters: {
    city: '',
    type: 'all', // 'all', 'high', 'medium', 'low'
    scoreMin: 0,
    scoreMax: 100,
    antiCorruptionOnly: false,
  },

  // Sort
  sort: 'vulnerabilityDesc', // 'vulnerabilityDesc', 'nameAsc', 'scoreDesc'

  // State
  loading: false,
  loadingMessage: '',
  error: null,
  lastSearchCity: '',

  // Pagination
  pageSize: 10,
  currentPage: 1,
};

// ── Observers ─────────────────────────────────────────────────────────────────

const observers = [];

export function subscribe(callback) {
  observers.push(callback);
  return () => {
    const idx = observers.indexOf(callback);
    if (idx >= 0) observers.splice(idx, 1);
  };
}

function notify() {
  observers.forEach(cb => cb(state));
}

// ── On-Demand City Search ─────────────────────────────────────────────────────

/**
 * Search for companies in a city on-demand
 * Works for ANY city in Brazil, not just pre-cached data
 */
export async function searchOutlawsByCity(cityName) {
  state.loading = true;
  state.error = null;
  state.loadingMessage = `Buscando empresas em ${cityName}...`;
  state.records = [];
  state.filtered = [];
  state.lastSearchCity = cityName;
  state.currentPage = 1;
  notify();

  try {
    // Parse city and state from input (e.g., "São Paulo, SP" or just "São Paulo")
    const parts = cityName.split(',').map(p => p.trim());
    const city = parts[0];
    let uf = parts[1]?.toUpperCase() || '';

    // If no UF provided, try to infer from city name
    if (!uf) {
      const cityToUF = {
        'são paulo': 'SP',
        'rio de janeiro': 'RJ',
        'belo horizonte': 'MG',
        'brasília': 'DF',
        'curitiba': 'PR',
        'porto alegre': 'RS',
        'salvador': 'BA',
        'fortaleza': 'CE',
        'manaus': 'AM',
        'belém': 'PA',
        'assis chateaubriand': 'PR',
        'cascavel': 'PR',
        'toledo': 'PR',
        'foz do iguaçu': 'PR',
      };
      const normalized = (city || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      uf = cityToUF[normalized] || 'SP'; // Default to SP
    }

    state.loadingMessage = `Consultando Brasil.IO para ${city}/${uf}...`;
    notify();

    // Search for companies on-demand
    const cnpjs = await searchCompaniesByCity(city, uf);

    if (cnpjs.length === 0) {
      state.loading = false;
      state.error = `Nenhuma empresa encontrada para "${city}/${uf}". Verifique o nome do município.`;
      notify();
      return;
    }

    state.loadingMessage = `Encontradas ${cnpjs.length} empresa(s) em ${city}/${uf}. Analisando risco...`;
    notify();

    // Load and analyze companies
    await loadCNPJs(cnpjs, city, uf);

  } catch (e) {
    state.error = `Erro ao buscar empresas: ${e.message}`;
    console.error('[Store] City search error:', e);
  }

  state.loading = false;
  notify();
}

// ── Load and Analyze CNPJs ────────────────────────────────────────────────────

/**
 * Load CNPJ data and run full analysis pipeline
 */
async function loadCNPJs(cnpjs, city = '', uf = '') {
  const results = [];
  const total = cnpjs.length;

  for (let i = 0; i < cnpjs.length; i++) {
    const cnpj = cnpjs[i];
    state.loadingMessage = `Analisando empresa ${i + 1}/${total}...`;
    notify();

    try {
      const record = await analyzeCompany(cnpj, city, uf);
      if (record) results.push(record);
    } catch (e) {
      console.warn(`[Store] Error analyzing ${cnpj}:`, e.message);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  state.records = results;
  applyFilters();
  state.loading = false;
  state.loadingMessage = '';
  notify();
}

/**
 * Analyze a single company
 */
async function analyzeCompany(cnpj, city = '', uf = '') {
  try {
    // Fetch basic company data
    const companyData = await fetchCNPJ(cnpj);
    if (!companyData) return null;

    // Extract socios
    const socios = await extractSocios(cnpj, companyData);

    // Partial record
    const partialRecord = {
      cnpj,
      razaoSocial: companyData.razao_social || '',
      nomeFantasia: companyData.nome_fantasia || '',
      municipio: city || companyData.municipio || '',
      uf: uf || companyData.uf || '',
      cnae: companyData.cnae || '',
      cnaeLabel: companyData.cnae_label || '',
      situacao: companyData.situacao || '',
      abertura: companyData.abertura || '',
      porte: companyData.porte || '',
      capitalSocial: companyData.capital_social || '',
      socios: socios || [],
      logradouro: companyData.logradouro || '',
      numero: companyData.numero || '',
      bairro: companyData.bairro || '',
      telefone: companyData.telefone || '',
      email: companyData.email || '',
    };

    // Run analysis pipeline
    const [
      esgIntelligence,
      procurementIntelligence,
      alternativeRiskAnalysis,
      localRisk,
    ] = await Promise.all([
      runESGIntelligence(partialRecord),
      runProcurementIntelligence(partialRecord, 0),
      runAlternativeRiskAnalysis(partialRecord, city, uf),
      analyzeLocalRisk(partialRecord, city, uf),
    ]);

    // Scoring
    const resistanceScore = calcResistanceScore(partialRecord);
    const vulnerabilityScore = calcVulnerabilityScore(partialRecord);
    const envScore = calcEnvScore(partialRecord);
    const urbanExploringScore = calcUrbanExploringScore(partialRecord);
    const securityGaps = analyzeSecurityGaps(partialRecord);

    // Composite score
    const compositeScore = Math.round(
      (vulnerabilityScore * 0.35) +
      (envScore * 0.25) +
      (alternativeRiskAnalysis.totalRiskScore * 0.25) +
      (localRisk.riskScore * 0.15)
    );

    return {
      ...partialRecord,
      resistanceScore,
      vulnerabilityScore,
      envScore,
      urbanExploringScore,
      compositeScore,
      securityGaps,
      // ESG Intelligence
      cnepStatus: esgIntelligence.cnepResult.status,
      cnepDetail: esgIntelligence.cnepResult.detail,
      shareholderAnalysis: esgIntelligence.shareholderAnalysis,
      esgScore: esgIntelligence.esgIndex.score,
      esgLabel: esgIntelligence.esgIndex.label,
      fieldActionPlan: esgIntelligence.fieldActionPlan,
      // Procurement Intelligence
      procurementRiskScore: procurementIntelligence.procurementRiskScore,
      procurementRiskLabel: procurementIntelligence.procurementRiskLabel,
      // Alternative Risk Analysis
      alternativeRiskScore: alternativeRiskAnalysis.totalRiskScore,
      alternativeRiskLevel: alternativeRiskAnalysis.riskLevel,
      pepAnalysis: alternativeRiskAnalysis.pepAnalysis,
      sanctionAnalysis: alternativeRiskAnalysis.sanctionAnalysis,
      deforestationAnalysis: alternativeRiskAnalysis.deforestationAnalysis,
      // Local Risk
      localRiskScore: localRisk.riskScore,
      localRiskFactors: localRisk.riskFactors,
    };
  } catch (e) {
    console.error(`[Store] Error analyzing ${cnpj}:`, e);
    return null;
  }
}

// ── Filtering and Sorting ─────────────────────────────────────────────────────

export function applyFilters() {
  let filtered = [...state.records];

  // Type filter
  if (state.filters.type === 'high') {
    filtered = filtered.filter(r => r.compositeScore >= 70);
  } else if (state.filters.type === 'medium') {
    filtered = filtered.filter(r => r.compositeScore >= 50 && r.compositeScore < 70);
  } else if (state.filters.type === 'low') {
    filtered = filtered.filter(r => r.compositeScore < 50);
  }

  // Score range filter
  filtered = filtered.filter(r =>
    r.compositeScore >= state.filters.scoreMin &&
    r.compositeScore <= state.filters.scoreMax
  );

  // Anti-corruption filter
  if (state.filters.antiCorruptionOnly) {
    filtered = filtered.filter(r =>
      r.shareholderAnalysis?.pepCount > 0 ||
      r.cnepStatus === 'FOUND' ||
      r.procurementRiskScore >= 60
    );
  }

  // Sort
  if (state.sort === 'vulnerabilityDesc') {
    filtered.sort((a, b) => b.vulnerabilityScore - a.vulnerabilityScore);
  } else if (state.sort === 'nameAsc') {
    filtered.sort((a, b) => (a.razaoSocial || '').localeCompare(b.razaoSocial || ''));
  } else if (state.sort === 'scoreDesc') {
    filtered.sort((a, b) => b.compositeScore - a.compositeScore);
  }

  state.filtered = filtered;
  state.currentPage = 1;
  notify();
}

export function setFilter(key, value) {
  state.filters[key] = value;
  applyFilters();
}

export function setSort(sortKey) {
  state.sort = sortKey;
  applyFilters();
}

// ── Pagination ────────────────────────────────────────────────────────────────

export function getPaginatedRecords() {
  const start = (state.currentPage - 1) * state.pageSize;
  const end = start + state.pageSize;
  return state.filtered.slice(start, end);
}

export function getTotalPages() {
  return Math.ceil(state.filtered.length / state.pageSize);
}

export function setPage(pageNum) {
  state.currentPage = Math.max(1, Math.min(pageNum, getTotalPages()));
  notify();
}

// ── Export helpers ────────────────────────────────────────────────────────────

export function fmtCNPJ(cnpj) {
  const c = (cnpj || '').replace(/\D/g, '');
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return dateStr;
}
