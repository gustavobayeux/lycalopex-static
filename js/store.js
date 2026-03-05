/**
 * store.js — Application state management for Lycalopex
 *
 * Manages:
 *   - Loaded company records
 *   - Filter state (city, type, score range, anti-corruption)
 *   - Sort order (default: highest vulnerability first)
 *   - Loading/error states
 *   - SessionStorage cache (1h TTL)
 */

'use strict';

import { fetchCNPJ, extractSocios, checkSancoesCNPJ, checkAntiCorrupcaoBR, checkIbamaEmbargos, fetchSociosBrasilIO, checkPessoaJuridica, sequentialQueue } from './api.js';
import { runESGIntelligence } from './esg-intelligence.js';
import { calcResistanceScore, calcVulnerabilityScore, calcEnvScore, getCNAEProfile, maskCPF, hashCPF } from './scoring.js';
import { calcUrbanExploringScore } from './urban-exploring.js';
import { analyzeSecurityGaps } from './gap-analysis.js';
import { runProcurementIntelligence } from './comprasnet.js';

// ── Cache helpers ─────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'lycalopex_v2_';
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
  filters: {
    city: '',
    type: '',
    minScore: 0,
    maxScore: 100,
    antiCorruption: '',
    outlawOnly: false,
  },
  sort: {
    field: 'vulnerability',
    dir: 'desc',
  },
  loading: false,
  loadingMessage: '',
  error: null,
  availableCities: [],
  availableTypes: [],
  totalLoaded: 0,
};

// ── Pub/sub ───────────────────────────────────────────────────────────────────

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach(fn => fn(state));
}

// ── Data loading ──────────────────────────────────────────────────────────────

/**
 * Load company data from a list of CNPJs.
 * Processes sequentially to respect API rate limits.
 * @param {string[]} cnpjList
 */
export async function loadCNPJs(cnpjList) {
  state.loading = true;
  state.error = null;
  state.records = [];
  state.totalLoaded = 0;
  state.loadingMessage = 'Iniciando consulta...';
  notify();

  const unique = [...new Set(cnpjList.map(c => c.replace(/\D/g, '')).filter(c => c.length === 14))];

  const tasks = unique.map((cnpj, i) => async () => {
    state.loadingMessage = `Consultando CNPJ ${i + 1}/${unique.length}: ${fmtCNPJ(cnpj)}`;
    notify();

    const cached = cacheGet(`cnpj_${cnpj}`);
    if (cached) {
      state.records.push(cached);
      state.totalLoaded = state.records.length;
      updateAvailableFilters();
      applyFilters();
      notify();
      return cached;
    }

    const raw = await fetchCNPJ(cnpj);
    if (!raw) {
      console.warn(`[Lycalopex] Failed to fetch CNPJ: ${cnpj}`);
      return null;
    }

    const record = await buildRecord(raw, cnpj);
    cacheSet(`cnpj_${cnpj}`, record);
    state.records.push(record);
    state.totalLoaded = state.records.length;
    updateAvailableFilters();
    applyFilters();
    notify();
    return record;
  });

  // 800ms between requests to be polite to public APIs
  await sequentialQueue(tasks, 800);

  state.loading = false;
  state.loadingMessage = '';
  updateAvailableFilters();
  applyFilters();
  notify();
}

/**
 * Build a full CompanyRecord from normalized API data.
 * @param {object} raw - Normalized company data from api.js
 * @param {string} cnpj - Clean 14-digit CNPJ
 * @returns {Promise<CompanyRecord>}
 */
async function buildRecord(raw, cnpj) {
  const profile = getCNAEProfile(raw);
  const { score: resistance, breakdown, justification } = calcResistanceScore(raw);
  const { score: vulnerability, label: vulnLabel } = calcVulnerabilityScore(raw);
  const { score: envScore, label: envLabel, indicators: envIndicators } = calcEnvScore(raw);

  // Extract partners from the API response (already embedded in cnpj.ws)
  const sociosRaw = extractSocios(raw);
  const socios = sociosRaw.map(s => ({
    nome: s.nome,
    cpfMasked: maskCPF(s.cpfCnpj),
    cpfHash: hashCPF(s.cpfCnpj),
    qualificacao: s.qualificacao,
    dataEntrada: s.dataEntrada,
    tipo: s.tipo,
  }));

  // Anti-corruption check (CEIS)
  const acResult = await checkSancoesCNPJ(cnpj);

  // Urban exploring susceptibility
  const ueResult = await calcUrbanExploringScore(raw);

  // IBAMA environmental embargoes check
  const ibamaResult = await checkIbamaEmbargos(cnpj);

  // Extended shareholder data from Brasil.IO (supplements cnpj.ws QSA)
  const sociosBrasilIO = await fetchSociosBrasilIO(cnpj);
  // Merge: prefer cnpj.ws data but fill gaps from Brasil.IO
  const sociosMerged = socios.length > 0 ? socios.map((s, i) => ({
    ...s,
    pais: sociosBrasilIO[i]?.pais || 'Brasil',
    nomePaisOrigem: sociosBrasilIO[i]?.nomePaisOrigem || '',
    codigoQualificacao: sociosBrasilIO[i]?.codigoQualificacao || '',
  })) : sociosBrasilIO.map(s => ({
    nome: s.nome,
    cpfMasked: maskCPF(s.cpfCnpj),
    cpfHash: hashCPF(s.cpfCnpj),
    qualificacao: s.qualificacao,
    dataEntrada: formatDate(s.dataEntrada),
    tipo: s.tipo,
    pais: s.pais,
    nomePaisOrigem: s.nomePaisOrigem,
  }));

  const partialRecord = {
    cnpj: fmtCNPJ(cnpj),
    razaoSocial: raw.nome || '—',
    nomeFantasia: raw.fantasia || '',
    situacao: raw.situacao || '—',
    abertura: raw.abertura || '—',
    porte: raw.porte || '—',
    capitalSocial: raw.capital_social || '0',
    logradouro: raw.logradouro || '',
    numero: raw.numero || '',
    complemento: raw.complemento || '',
    bairro: raw.bairro || '',
    municipio: raw.municipio || '',
    uf: raw.uf || '',
    cep: raw.cep || '',
    email: raw.email || '',
    telefone: raw.telefone || '',
    cnaeLabel: profile.label,
    cnaeType: profile.type,
    socios: sociosMerged.length > 0 ? sociosMerged : socios,
    sociosBrasilIO: sociosBrasilIO.length,
    resistanceScore: resistance,
    resistanceBreakdown: breakdown,
    resistanceJustification: justification,
    vulnerabilityScore: vulnerability,
    vulnerabilityLabel: vulnLabel,
    envScore,
    envLabel,
    envIndicators,
    antiCorruptionStatus: acResult.status,
    antiCorruptionDetail: acResult.detail,
    ibamaStatus: ibamaResult.status,
    ibamaDetail: ibamaResult.detail,
    ibamaEntries: ibamaResult.entries,
    urbanExploringScore: ueResult.score,
    urbanExploringLabel: ueResult.label,
    urbanExploringBreakdown: ueResult.breakdown,
    urbanExploringIndicators: ueResult.indicators,
    lastUpdated: new Date().toLocaleDateString('pt-BR'),
  };

  // Security gap analysis
  const securityGaps = analyzeSecurityGaps(partialRecord);

  // ESG Intelligence: PEP detection, shareholder graph, ESG Risk Index, field action plan
  // Uses the merged socios list for PEP checking
  const apiKey = window.__LYCALOPEX_API_KEY__ || '';
  const esgIntelligence = await runESGIntelligence(
    { ...partialRecord, securityGaps },
    (sociosMerged.length > 0 ? sociosMerged : socios),
    apiKey
  );

  // Government procurement intelligence (COMPRASNET + Portal da Transparência)
  const procurementIntelligence = await runProcurementIntelligence(
    partialRecord,
    esgIntelligence.shareholderAnalysis?.pepCount || 0,
    apiKey
  );

  return {
    ...partialRecord,
    securityGaps,
    // ESG Intelligence fields
    cnepStatus: esgIntelligence.cnepResult.status,
    cnepDetail: esgIntelligence.cnepResult.detail,
    cnepEntries: esgIntelligence.cnepResult.entries,
    leniencyStatus: esgIntelligence.leniencyResult.status,
    leniencyDetail: esgIntelligence.leniencyResult.detail,
    shareholderAnalysis: esgIntelligence.shareholderAnalysis,
    esgScore: esgIntelligence.esgIndex.score,
    esgLabel: esgIntelligence.esgIndex.label,
    esgFieldPriority: esgIntelligence.esgIndex.fieldPriority,
    esgComponents: esgIntelligence.esgIndex.components,
    esgActionItems: esgIntelligence.esgIndex.actionItems,
    fieldActionPlan: esgIntelligence.fieldActionPlan,
    // Procurement Intelligence fields
    procurementRiskScore: procurementIntelligence.procurementRiskScore,
    procurementRiskLabel: procurementIntelligence.procurementRiskLabel,
    procurementRiskFactors: procurementIntelligence.riskFactors,
    procurementContractsFound: procurementIntelligence.contractsFound,
    contractCount: procurementIntelligence.contractCount,
    contractTotalValue: procurementIntelligence.contractTotalValue,
    procurementSpendingFound: procurementIntelligence.spendingFound,
    spendingCount: procurementIntelligence.spendingCount,
    spendingTotalValue: procurementIntelligence.spendingTotalValue,
    procurementContractsDetail: procurementIntelligence.contractsDetail,
    procurementSpendingDetail: procurementIntelligence.spendingDetail,
    procurementActionItems: procurementIntelligence.actionItems,
    procurementSummary: procurementIntelligence.summary,
  };
}

// ── Filters & sort ────────────────────────────────────────────────────────────

export function setFilter(key, value) {
  state.filters[key] = value;
  applyFilters();
  notify();
}

export function setSort(field, dir) {
  state.sort = { field, dir };
  applyFilters();
  notify();
}

export function applyFilters() {
  let result = [...state.records];

  if (state.filters.city) {
    const q = normalize(state.filters.city);
    result = result.filter(r =>
      normalize(r.municipio).includes(q) || normalize(r.uf).includes(q)
    );
  }

  if (state.filters.type) {
    result = result.filter(r => r.cnaeType === state.filters.type);
  }

  result = result.filter(r =>
    r.vulnerabilityScore >= state.filters.minScore &&
    r.vulnerabilityScore <= state.filters.maxScore
  );

  if (state.filters.antiCorruption) {
    result = result.filter(r => {
      if (state.filters.antiCorruption === 'found') return r.antiCorruptionStatus === 'Alerta';
      if (state.filters.antiCorruption === 'clean') return r.antiCorruptionStatus === 'Verificado';
      return true;
    });
  }

  if (state.filters.outlawOnly) {
    result = result.filter(r => r.ibamaStatus === 'Alerta Ambiental' || r.antiCorruptionStatus === 'Alerta');
  }

  // Sort
  result.sort((a, b) => {
    let av, bv;
    switch (state.sort.field) {
      case 'vulnerability': av = a.vulnerabilityScore; bv = b.vulnerabilityScore; break;
      case 'resistance':    av = a.resistanceScore;    bv = b.resistanceScore;    break;
      case 'env':           av = a.envScore;           bv = b.envScore;           break;
      case 'esg':           av = a.esgScore || 0;      bv = b.esgScore || 0;      break;
      case 'razaoSocial':   av = a.razaoSocial;        bv = b.razaoSocial;        break;
      case 'municipio':     av = a.municipio;          bv = b.municipio;          break;
      default:              av = a.vulnerabilityScore; bv = b.vulnerabilityScore;
    }
    if (typeof av === 'string') {
      return state.sort.dir === 'asc'
        ? av.localeCompare(bv, 'pt-BR')
        : bv.localeCompare(av, 'pt-BR');
    }
    return state.sort.dir === 'asc' ? av - bv : bv - av;
  });

  state.filtered = result;
}

function updateAvailableFilters() {
  state.availableCities = [...new Set(state.records.map(r => r.municipio).filter(Boolean))].sort();
  state.availableTypes  = [...new Set(state.records.map(r => r.cnaeType).filter(Boolean))].sort();
}

// ── CSV export ────────────────────────────────────────────────────────────────

export function exportCSV() {
  const headers = [
    'CNPJ', 'Razão Social', 'Nome Fantasia', 'Situação', 'Abertura', 'Porte',
    'Capital Social', 'Logradouro', 'Número', 'Bairro', 'Município', 'UF', 'CEP',
    'Atividade Principal (CNAE)', 'Tipo de Estrutura',
    'Score Resistência Física', 'Score Vulnerabilidade Incêndio', 'Nível Vulnerabilidade',
    'Score Risco Ambiental', 'Nível Risco Ambiental',
    'Status Anti-Corrupção (CEIS)', 'Detalhe Anti-Corrupção',
    'Status CNEP', 'Detalhe CNEP',
    'Acordo de Leniência',
    'Status IBAMA', 'Qtd Embargos IBAMA',
    'ESG Risk Index', 'Nível ESG', 'Prioridade de Campo',
    'ESG — Componente Ambiental', 'ESG — Componente Social/Gov', 'ESG — Poder Corporativo',
    'PEPs no Quadro Societário', 'Concentração Societária', 'Influência Societária',
    'Plano de Ação — Ações Imediatas', 'Plano de Ação — Documentos a Solicitar',
    'Plano de Ação — Autoridades a Notificar', 'Plano de Ação — Referências Legais',
    'Risco de Procurement (0-100)', 'Nível de Risco de Procurement',
    'Contratos Federais — Quantidade', 'Contratos Federais — Valor Total',
    'Despesas Federais — Quantidade', 'Despesas Federais — Valor Total',
    'Resumo de Procurement', 'Fatores de Risco de Procurement',
    'Gaps de Segurança',
    'Sócios (mascarados)', 'Justificativa Técnica', 'Última Atualização'
  ];

  const rows = state.filtered.map(r => [
    r.cnpj, r.razaoSocial, r.nomeFantasia, r.situacao, r.abertura, r.porte,
    r.capitalSocial, r.logradouro, r.numero, r.bairro, r.municipio, r.uf, r.cep,
    r.cnaeLabel, r.cnaeType,
    r.resistanceScore, r.vulnerabilityScore, r.vulnerabilityLabel,
    r.envScore, r.envLabel,
    r.antiCorruptionStatus, r.antiCorruptionDetail,
    r.cnepStatus || 'Pendente', r.cnepDetail || '',
    r.leniencyStatus || 'Pendente',
    r.ibamaStatus, (r.ibamaEntries || []).length,
    r.esgScore || 0, r.esgLabel || '—', r.esgFieldPriority || '—',
    r.esgComponents?.environmental || 0,
    r.esgComponents?.socialGovernance || 0,
    r.esgComponents?.corporatePower || 0,
    r.shareholderAnalysis?.pepCount || 0,
    r.shareholderAnalysis?.concentrationScore || 0,
    r.shareholderAnalysis?.influenceScore || 0,
    r.procurementRiskScore || 0,
    r.procurementRiskLabel || '—',
    r.contractCount || 0,
    r.contractTotalValue || 0,
    r.spendingCount || 0,
    r.spendingTotalValue || 0,
    r.procurementSummary || '',
    (r.procurementRiskFactors || []).join(' | '),
    (r.fieldActionPlan?.immediateActions || []).join(' | '),
    (r.fieldActionPlan?.documentsToRequest || []).join(' | '),
    (r.fieldActionPlan?.authoritiesToNotify || []).join(' | '),
    (r.fieldActionPlan?.legalReferences || []).join(' | '),
    (r.securityGaps || []).map(g => `${g.title}: ${g.description}`).join(' | '),
    (r.socios || []).map(s => `${s.nome} (${s.cpfMasked})`).join(' | '),
    r.resistanceJustification,
    r.lastUpdated,
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lycalopex_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Live Outlaw Search ──────────────────────────────────────────────────────────

/**
 * Normalize a string for fuzzy comparison:
 * lowercase, remove accents, collapse spaces.
 * @param {string} str
 * @returns {string}
 */
function normalizeCity(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the best matching city key(s) in the regional data using fuzzy/partial matching.
 * Returns an array of matched keys (uppercase), sorted by match quality.
 * @param {string} query
 * @param {string[]} availableKeys
 * @returns {string[]}
 */
function findMatchingCities(query, availableKeys) {
  const q = normalizeCity(query);
  if (!q) return [];

  const exact = [];
  const startsWith = [];
  const contains = [];

  for (const key of availableKeys) {
    const norm = normalizeCity(key);
    if (norm === q) {
      exact.push(key);
    } else if (norm.startsWith(q) || q.startsWith(norm)) {
      startsWith.push(key);
    } else if (norm.includes(q) || q.includes(norm)) {
      contains.push(key);
    }
  }

  return [...exact, ...startsWith, ...contains];
}

/**
 * Search for 'outlaws' (companies with IBAMA embargoes) in a specific city.
 * Uses fuzzy/partial matching against the regional environmental index.
 * Falls back to nearby/similar city names when no exact match is found.
 */
export async function searchOutlawsByCity(cityName) {
  state.loading = true;
  state.error = null;
  state.loadingMessage = `Buscando infratores em ${cityName}...`;
  state.records = [];
  notify();

  try {
    const response = await fetch('data/ibama-regional.json');
    if (!response.ok) throw new Error('Falha ao carregar base regional');

    const regionalData = await response.json();
    const availableKeys = Object.keys(regionalData);

    // Fuzzy match: exact > starts-with > contains
    const matchedKeys = findMatchingCities(cityName, availableKeys);

    if (matchedKeys.length === 0) {
      state.loading = false;
      state.error = `Nenhum registro de infração ambiental encontrado para "${cityName}" na base do IBAMA (${availableKeys.length} municípios cobertos). Tente um município vizinho.`;
      notify();
      return;
    }

    // Collect all companies from matched cities (up to 15 total)
    const allCompanies = [];
    const matchedNames = [];
    for (const key of matchedKeys) {
      const companies = regionalData[key] || [];
      matchedNames.push(key);
      for (const c of companies) {
        if (allCompanies.length < 15) allCompanies.push(c);
      }
    }

    state.loadingMessage = `Encontrado(s): ${matchedNames.join(', ')} — ${allCompanies.length} empresa(s) com embargo IBAMA`;
    notify();

    const cnpjs = allCompanies.map(c => c.cnpj);
    await loadCNPJs(cnpjs);

  } catch (e) {
    state.error = 'Erro ao carregar base regional IBAMA.';
    console.error(e);
  }

  state.loading = false;
  notify();
}

// CNPJs reais com embargos IBAMA no PR (Cascavel, Toledo, Foz do Iguaçu, Curitiba, Guarapuava)
export const DEMO_CNPJS = [
  '42801774000161', // Cascavel
  '03387382000146', // Cascavel
  '77602613000123', // Toledo
  '02102907000197', // Toledo
  '05210229000174', // Foz do Iguaçu
  '16630764000109', // Foz do Iguaçu
  '27203064000146', // Curitiba
  '29302631000147', // Curitiba
  '04678885000133', // Guarapuava
  '00567480000177', // Guarapuava
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCNPJ(cnpj) {
  const c = cnpj.replace(/\D/g, '');
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function normalize(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return dateStr;
}
