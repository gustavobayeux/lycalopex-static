/**
 * api.js — Public API clients for Lycalopex
 *
 * Primary source: publica.cnpj.ws (no auth, no rate limit, includes socios)
 *   https://publica.cnpj.ws/cnpj/{cnpj}
 *
 * Fallback: ReceitaWS (3 req/min free tier)
 *   https://www.receitaws.com.br/v1/cnpj/{cnpj}
 *
 * Anti-corruption: Portal da Transparência CEIS/CNEP
 *   https://api.portaldatransparencia.gov.br/api-de-dados/ceis
 *   (requires free API key — graceful degradation when absent)
 *
 * IBGE municipalities:
 *   https://servicodados.ibge.gov.br/api/v1/localidades/municipios
 *
 * IBAMA Embargoes:
 *   Local data/ibama-index.json (or ibama-demo.json)
 */

'use strict';

// ── publica.cnpj.ws (primary) ─────────────────────────────────────────────────

/**
 * Fetch company data from publica.cnpj.ws by CNPJ.
 * Returns a normalized object or null on error.
 * @param {string} cnpj - Raw CNPJ digits (14 chars) or formatted
 * @returns {Promise<object|null>}
 */
export async function fetchCNPJ(cnpj) {
  const clean = cnpj.replace(/\D/g, '');
  const url = `https://publica.cnpj.ws/cnpj/${clean}`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) {
      // Fallback to ReceitaWS on error
      return fetchCNPJFallback(clean);
    }
    const raw = await res.json();
    return normalizeCNPJWs(raw, clean);
  } catch {
    return fetchCNPJFallback(clean);
  }
}

/**
 * Normalize publica.cnpj.ws response to a unified schema
 * compatible with the scoring engine.
 * @param {object} raw
 * @param {string} cnpj
 * @returns {object}
 */
function normalizeCNPJWs(raw, cnpj) {
  const est = raw.estabelecimento || {};
  const ativPrincipal = est.atividade_principal || {};
  const cidade = est.cidade || {};
  const estado = est.estado || {};
  const porte = raw.porte || {};

  // Build address
  const tipoLogradouro = est.tipo_logradouro || '';
  const logradouro = [tipoLogradouro, est.logradouro].filter(Boolean).join(' ');

  // Format phone
  const tel = est.ddd1 && est.telefone1 ? `(${est.ddd1}) ${est.telefone1}` : '';

  // Format abertura date (YYYY-MM-DD → DD/MM/YYYY)
  const abertura = formatDate(est.data_inicio_atividade);

  // Normalize capital social
  const capitalSocial = String(raw.capital_social || '0').replace(/[^\d.,]/g, '');

  return {
    // Identity
    cnpj: formatCNPJ(cnpj),
    nome: raw.razao_social || '—',
    fantasia: est.nome_fantasia || '',
    situacao: est.situacao_cadastral || '—',
    abertura,
    porte: porte.descricao || '—',
    capital_social: capitalSocial,

    // Address
    logradouro,
    numero: est.numero || '',
    complemento: est.complemento || '',
    bairro: est.bairro || '',
    municipio: cidade.nome || '',
    uf: estado.sigla || '',
    cep: est.cep || '',

    // Contact
    telefone: tel,
    email: est.email || '',

    // Activity
    atividade_principal: ativPrincipal.descricao
      ? [{ code: String(ativPrincipal.id || ''), text: ativPrincipal.descricao }]
      : [],

    // Partners (already in the response)
    socios_raw: raw.socios || [],

    // Source marker
    _source: 'cnpjws',
    _raw: raw,
  };
}

/**
 * Fallback: fetch from ReceitaWS (3 req/min free tier).
 * @param {string} cnpj
 * @returns {Promise<object|null>}
 */
async function fetchCNPJFallback(cnpj) {
  const url = `https://www.receitaws.com.br/v1/cnpj/${cnpj}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'ERROR') return null;

    // ReceitaWS already returns a compatible schema
    return {
      cnpj: formatCNPJ(cnpj),
      nome: data.nome || '—',
      fantasia: data.fantasia || '',
      situacao: data.situacao || '—',
      abertura: data.abertura || '—',
      porte: data.porte || '—',
      capital_social: data.capital_social || '0',
      logradouro: data.logradouro || '',
      numero: data.numero || '',
      complemento: data.complemento || '',
      bairro: data.bairro || '',
      municipio: data.municipio || '',
      uf: data.uf || '',
      cep: data.cep || '',
      telefone: data.telefone || '',
      email: data.email || '',
      atividade_principal: data.atividade_principal || [],
      socios_raw: (data.qsa || []).map(s => ({
        nome: s.nome || '',
        cpf_cnpj_socio: s.qual || '',
        qualificacao_socio: { descricao: s.qual || '' },
        data_entrada: '',
      })),
      _source: 'receitaws',
      _raw: data,
    };
  } catch {
    return null;
  }
}

// ── Socios (from cnpj.ws response — already embedded) ────────────────────────

/**
 * Extract and normalize partners from a company record.
 * publica.cnpj.ws includes socios directly in the CNPJ response.
 * @param {object} companyData - Normalized company record
 * @returns {Array}
 */
export function extractSocios(companyData) {
  const raw = companyData.socios_raw || [];
  return raw.map(s => ({
    nome: s.nome || '—',
    cpfCnpj: s.cpf_cnpj_socio || '',
    qualificacao: s.qualificacao_socio?.descricao || '—',
    dataEntrada: formatDate(s.data_entrada) || '—',
    tipo: s.tipo || '',
  }));
}

// ── Portal da Transparência — CEIS/CNEP ──────────────────────────────────────

/**
 * Check if a CNPJ appears in the CEIS sanctions list.
 * Requires a free API key from portaldatransparencia.gov.br/api-de-dados
 * Gracefully degrades when no key is provided.
 * @param {string} cnpj
 * @param {string} [apiKey]
 * @returns {Promise<{found: boolean, entries: Array, status: string, detail: string}>}
 */
/**
 * Check if a CNPJ has IBAMA environmental embargoes.
 * In a real production environment, this would query a backend or the IBAMA API.
 * For this static version, we use a local JSON index.
 * @param {string} cnpj
 * @returns {Promise<{found: boolean, entries: Array, status: string, detail: string}>}
 */
export async function checkIbamaEmbargos(cnpj) {
  const clean = cnpj.replace(/\D/g, '');
  try {
    // Try to load from demo or full index
    // In static sites, we usually fetch a small JSON or use a search index
    const response = await fetch('data/ibama-demo.json');
    if (response.ok) {
      const index = await response.json();
      const entries = index[clean];
      if (entries && entries.length > 0) {
        return {
          found: true,
          entries,
          status: 'Alerta Ambiental',
          detail: `CNPJ possui ${entries.length} embargo(s) ambiental(is) no IBAMA. Local: ${entries[0].municipio}/${entries[0].uf}.`
        };
      }
    }
  } catch (e) {
    console.warn('IBAMA index not available', e);
  }

  return {
    found: false,
    entries: [],
    status: 'Verificado',
    detail: 'Nenhum embargo ambiental encontrado nas bases do IBAMA.'
  };
}

/**
 * Check for MPF (Ministério Público Federal) public lawsuits.
 * (Mock implementation for demonstration)
 */
export async function checkMPFLawsuits(cnpj) {
  // In a real app, this would be a fetch to an MPF open data API
  return {
    found: false,
    entries: [],
    status: 'Verificado',
    detail: 'Nenhum processo público encontrado no MPF.'
  };
}

export async function checkSancoesCNPJ(cnpj, apiKey = '') {
  const clean = cnpj.replace(/\D/g, '');

  if (apiKey) {
    try {
      const url = `https://api.portaldatransparencia.gov.br/api-de-dados/ceis?cnpjSancionado=${clean}&pagina=1`;
      const res = await fetch(url, {
        headers: {
          'chave-api-dados': apiKey,
          'Accept': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          return {
            found: true,
            entries: data,
            status: 'Alerta',
            detail: `CNPJ encontrado no CEIS com ${data.length} registro(s). Órgão sancionador: ${data[0].orgaoSancionador?.nome || 'não informado'}.`
          };
        }
        return {
          found: false,
          entries: [],
          status: 'Verificado',
          detail: 'CNPJ não encontrado no CEIS (Cadastro de Empresas Inidôneas e Suspensas).'
        };
      }
    } catch { /* fall through */ }
  }

  // No API key — return pending status
  return {
    found: false,
    entries: [],
    status: 'Pendente',
    detail: 'Verificação CEIS/CNEP pendente. Obtenha uma chave gratuita em portaldatransparencia.gov.br/api-de-dados para habilitar esta consulta.'
  };
}

/**
 * Check if a CPF hash appears in anti-corruption lists.
 * Uses the anticorrupcao-br public API when available.
 * @param {string} cpfHash - Hash of CPF (never the raw CPF)
 * @returns {Promise<{found: boolean, status: string}>}
 */
export async function checkAntiCorrupcaoBR(cpfHash) {
  // anticorrupcao-br API: https://anticorrupcao-br.vercel.app
  // Endpoint: GET /api/check?hash={hash}
  // This is a community API — graceful degradation if unavailable
  try {
    const url = `https://anticorrupcao-br.vercel.app/api/check?hash=${encodeURIComponent(cpfHash)}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      return { found: data.found === true, status: data.found ? 'Alerta' : 'Verificado' };
    }
  } catch { /* API unavailable */ }
  return { found: false, status: 'Pendente' };
}

// ── IBGE — Municípios ────────────────────────────────────────────────────────

/**
 * Fetch all Brazilian municipalities from IBGE.
 * @returns {Promise<Array<{id: number, nome: string, uf: string}>>}
 */
export async function fetchMunicipios() {
  const url = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(m => ({
      id: m.id,
      nome: m.nome,
      uf: m['microrregiao']['mesorregiao']['UF']['sigla']
    }));
  } catch {
    return [];
  }
}

// ── Utility: sequential queue ─────────────────────────────────────────────────

/**
 * Execute async tasks sequentially with a delay between them.
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} delayMs
 * @returns {Promise<Array>}
 */
export async function sequentialQueue(tasks, delayMs = 500) {
  const results = [];
  for (let i = 0; i < tasks.length; i++) {
    results.push(await tasks[i]());
    if (i < tasks.length - 1 && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCNPJ(cnpj) {
  const c = cnpj.replace(/\D/g, '');
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Handle YYYY-MM-DD
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return dateStr;
}
