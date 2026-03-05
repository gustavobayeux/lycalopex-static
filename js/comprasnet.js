/**
 * comprasnet.js — COMPRASNET Integration
 *
 * Integrates with COMPRASNET (Compras Governamentais) to fetch public procurement data
 * showing which companies have contracts with federal/state/municipal governments.
 *
 * This reveals:
 * - Government contracts (value, date, agency)
 * - Contract history (pattern of procurement)
 * - Potential conflicts of interest (PEP connections)
 * - Public spending tracking
 *
 * APIs:
 *   - Portal da Transparência /api-de-dados/contratos (federal contracts)
 *   - Portal da Transparência /api-de-dados/despesas (federal spending)
 *   - COMPRASNET (estado/município) — varies by jurisdiction
 */

'use strict';

// ── Federal Contracts (Portal da Transparência) ──────────────────────────────

/**
 * Fetch federal government contracts for a CNPJ
 * Shows all contracts with federal agencies
 *
 * Endpoint: GET /api-de-dados/contratos/cpf-cnpj?cnpj={cnpj}&pagina=1
 * Auth: Optional free API key
 *
 * @param {string} cnpj - Raw or formatted CNPJ
 * @param {string} [apiKey]
 * @returns {Promise<{found: boolean, contracts: Array, totalValue: number, detail: string}>}
 */
export async function fetchFederalContracts(cnpj, apiKey = '') {
  const clean = cnpj.replace(/\D/g, '');
  if (!clean || clean.length !== 14) {
    return { found: false, contracts: [], totalValue: 0, detail: 'CNPJ inválido.' };
  }

  const headers = { 'Accept': 'application/json' };
  if (apiKey) headers['chave-api-dados'] = apiKey;

  if (!apiKey) {
    return {
      found: false,
      contracts: [],
      totalValue: 0,
      detail: 'Consulta de contratos federais pendente. Configure chave do Portal da Transparência.',
      status: 'Pendente',
    };
  }

  try {
    const url = `https://api.portaldatransparencia.gov.br/api-de-dados/contratos/cpf-cnpj?cnpj=${clean}&pagina=1`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const totalValue = data.reduce((sum, c) => {
          const val = parseFloat(String(c.valor || '0').replace(',', '.')) || 0;
          return sum + val;
        }, 0);

        return {
          found: true,
          contracts: data.slice(0, 10), // Top 10 most recent
          totalValue,
          detail: `CNPJ possui ${data.length} contrato(s) federal(is) no valor total de R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          status: 'Consultado',
        };
      }

      return {
        found: false,
        contracts: [],
        totalValue: 0,
        detail: 'Nenhum contrato federal encontrado para este CNPJ.',
        status: 'Verificado',
      };
    }
  } catch (e) {
    console.warn('[COMPRASNET] Federal contracts fetch failed:', e.message);
  }

  return {
    found: false,
    contracts: [],
    totalValue: 0,
    detail: 'Erro ao consultar contratos federais.',
    status: 'Erro',
  };
}

// ── Federal Spending (Despesas) ──────────────────────────────────────────────

/**
 * Fetch federal spending (despesas) for a CNPJ
 * Shows all payments/transfers to this company from federal agencies
 *
 * Endpoint: GET /api-de-dados/despesas/documentos-por-favorecido?cnpj={cnpj}&pagina=1
 * Auth: Optional free API key
 *
 * @param {string} cnpj
 * @param {string} [apiKey]
 * @returns {Promise<{found: boolean, spending: Array, totalSpent: number, detail: string}>}
 */
export async function fetchFederalSpending(cnpj, apiKey = '') {
  const clean = cnpj.replace(/\D/g, '');
  const headers = { 'Accept': 'application/json' };
  if (apiKey) headers['chave-api-dados'] = apiKey;

  if (!apiKey) {
    return {
      found: false,
      spending: [],
      totalSpent: 0,
      detail: 'Consulta de despesas federais pendente.',
      status: 'Pendente',
    };
  }

  try {
    const url = `https://api.portaldatransparencia.gov.br/api-de-dados/despesas/documentos-por-favorecido?cnpj=${clean}&pagina=1`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const totalSpent = data.reduce((sum, d) => {
          const val = parseFloat(String(d.valor || '0').replace(',', '.')) || 0;
          return sum + val;
        }, 0);

        return {
          found: true,
          spending: data.slice(0, 10),
          totalSpent,
          detail: `${data.length} despesa(s) federal(is) no valor total de R$ ${totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          status: 'Consultado',
        };
      }

      return {
        found: false,
        spending: [],
        totalSpent: 0,
        detail: 'Nenhuma despesa federal encontrada.',
        status: 'Verificado',
      };
    }
  } catch (e) {
    console.warn('[COMPRASNET] Federal spending fetch failed:', e.message);
  }

  return {
    found: false,
    spending: [],
    totalSpent: 0,
    detail: 'Erro ao consultar despesas federais.',
    status: 'Erro',
  };
}

// ── Government Procurement Risk Score ────────────────────────────────────────

/**
 * Calculate government procurement risk score (0-100)
 *
 * Factors:
 * - High federal spending → potential dependency on government
 * - Frequent contracts → pattern of procurement
 * - PEP connections → conflict of interest risk
 * - Sector concentration → monopoly risk
 *
 * @param {object} contractsData - Result from fetchFederalContracts()
 * @param {object} spendingData - Result from fetchFederalSpending()
 * @param {number} [pepCount=0] - Number of PEPs in shareholder structure
 * @returns {{ score: number, label: string, riskFactors: string[] }}
 */
export function calcProcurementRiskScore(contractsData, spendingData, pepCount = 0) {
  let score = 0;
  const riskFactors = [];

  // Contract frequency risk
  if (contractsData.contracts && contractsData.contracts.length > 0) {
    const numContracts = contractsData.contracts.length;
    if (numContracts > 20) {
      score += 30;
      riskFactors.push(`Alto volume de contratos federais (${numContracts}+) — possível dependência de governo`);
    } else if (numContracts > 10) {
      score += 20;
      riskFactors.push(`Múltiplos contratos federais (${numContracts}) — padrão de procurement`);
    } else {
      score += 10;
      riskFactors.push(`${numContracts} contrato(s) federal(is) ativo(s)`);
    }
  }

  // Spending volume risk
  const totalSpent = (spendingData?.totalSpent || 0);
  if (totalSpent > 100_000_000) {
    score += 25;
    riskFactors.push(`Muito alto volume de despesas federais (R$ ${(totalSpent / 1_000_000).toFixed(1)}M) — forte dependência de governo`);
  } else if (totalSpent > 10_000_000) {
    score += 15;
    riskFactors.push(`Alto volume de despesas federais (R$ ${(totalSpent / 1_000_000).toFixed(1)}M)`);
  } else if (totalSpent > 1_000_000) {
    score += 8;
    riskFactors.push(`Despesas federais significativas (R$ ${(totalSpent / 1_000_000).toFixed(1)}M)`);
  }

  // PEP connection risk
  if (pepCount > 0) {
    score += Math.min(20, pepCount * 10);
    riskFactors.push(`${pepCount} PEP(s) no quadro — alto risco de conflito de interesses em contratos públicos`);
  }

  // Concentration risk
  if (contractsData.contracts && contractsData.contracts.length > 0) {
    const agencies = new Set(contractsData.contracts.map(c => c.orgao).filter(Boolean));
    if (agencies.size === 1) {
      score += 15;
      riskFactors.push('Concentração em único órgão — risco de captura regulatória');
    } else if (agencies.size <= 3) {
      score += 8;
      riskFactors.push(`Concentração em poucos órgãos (${agencies.size}) — possível captura setorial`);
    }
  }

  score = Math.min(100, score);

  let label;
  if (score >= 70) label = 'Crítico';
  else if (score >= 50) label = 'Alto';
  else if (score >= 30) label = 'Moderado';
  else label = 'Baixo';

  return { score, label, riskFactors };
}

// ── Procurement Intelligence Summary ─────────────────────────────────────────

/**
 * Generate a comprehensive procurement intelligence summary
 *
 * @param {object} record - Full company record
 * @param {object} contractsData
 * @param {object} spendingData
 * @param {number} [pepCount=0]
 * @returns {object}
 */
export function generateProcurementIntelligence(record, contractsData, spendingData, pepCount = 0) {
  const riskScore = calcProcurementRiskScore(contractsData, spendingData, pepCount);

  const intelligence = {
    procurementRiskScore: riskScore.score,
    procurementRiskLabel: riskScore.label,
    riskFactors: riskScore.riskFactors,
    contractsFound: contractsData.found,
    contractCount: contractsData.contracts?.length || 0,
    contractTotalValue: contractsData.totalValue || 0,
    spendingFound: spendingData.found,
    spendingCount: spendingData.spending?.length || 0,
    spendingTotalValue: spendingData.totalSpent || 0,
    contractsDetail: contractsData.detail,
    spendingDetail: spendingData.detail,

    // Action items for field agents
    actionItems: [],

    // Intelligence summary
    summary: '',
  };

  // Build action items
  if (contractsData.found && contractsData.contracts.length > 0) {
    intelligence.actionItems.push(`📋 Verificar ${contractsData.contracts.length} contrato(s) federal(is) no Portal da Transparência`);
    intelligence.actionItems.push(`💰 Valor total de contratos: R$ ${contractsData.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  }

  if (spendingData.found && spendingData.spending.length > 0) {
    intelligence.actionItems.push(`💸 ${spendingData.spending.length} despesa(s) federal(is) registrada(s)`);
    intelligence.actionItems.push(`📊 Total gasto: R$ ${spendingData.totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  }

  if (pepCount > 0) {
    intelligence.actionItems.push(`⚠️ Verificar conflito de interesses: ${pepCount} PEP(s) em contratos com governo`);
  }

  // Build summary
  const parts = [];
  parts.push(`Risco de Procurement: ${riskScore.label} (${riskScore.score}/100)`);
  if (contractsData.found) {
    parts.push(`${contractsData.contracts.length} contrato(s) federal(is)`);
  }
  if (spendingData.found) {
    parts.push(`R$ ${(spendingData.totalSpent / 1_000_000).toFixed(1)}M em despesas federais`);
  }
  intelligence.summary = parts.join(' • ');

  return intelligence;
}

// ── Batch Procurement Check ──────────────────────────────────────────────────

/**
 * Run full procurement intelligence check for a company
 *
 * @param {object} record - Company record
 * @param {number} [pepCount=0]
 * @param {string} [apiKey]
 * @returns {Promise<object>}
 */
export async function runProcurementIntelligence(record, pepCount = 0, apiKey = '') {
  const [contractsData, spendingData] = await Promise.all([
    fetchFederalContracts(record.cnpj, apiKey),
    fetchFederalSpending(record.cnpj, apiKey),
  ]);

  return generateProcurementIntelligence(record, contractsData, spendingData, pepCount);
}
