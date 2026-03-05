/**
 * esg-intelligence.js — ESG Intelligence Engine for Lycalopex
 *
 * Designed for IBAMA agents and Greenpeace activists operating in the field.
 * Combines real environmental infraction data with corporate power structures
 * to identify who is truly behind climate-damaging operations in Brazil.
 *
 * Modules:
 *   1. PEP Detection     — Identifies Politically Exposed Persons among shareholders
 *   2. Shareholder Graph — Maps corporate ownership chains and economic groups
 *   3. ESG Risk Index    — Composite score: IBAMA + CEIS/CNEP + PEP influence + CNAE
 *   4. Field Action Plan — Actionable intelligence for agents on the ground
 *
 * APIs used (all public, no auth required unless noted):
 *   - Portal da Transparência /api-de-dados/peps       (PEP lookup by name — free key)
 *   - Portal da Transparência /api-de-dados/pessoa-juridica (company contracts/sanctions)
 *   - Portal da Transparência /api-de-dados/cnep       (National Punished Companies)
 *   - Portal da Transparência /api-de-dados/acordos-leniencia (leniency agreements)
 *   - publica.cnpj.ws                                  (QSA — already embedded)
 *   - Brasil.IO socios-brasil                          (extended shareholder data)
 */

'use strict';

// ── PEP Detection ─────────────────────────────────────────────────────────────

/**
 * Check if a person's name appears in the PEP (Pessoas Expostas Politicamente)
 * registry of the Portal da Transparência.
 *
 * The Portal da Transparência PEP endpoint searches by name and returns
 * current/former public officials. We use name-based fuzzy matching since
 * CPFs are never exposed in full.
 *
 * Endpoint: GET /api-de-dados/peps?nome={name}&pagina=1
 * Auth: optional free API key (chave-api-dados header)
 *
 * @param {string} name - Full name of the person to check
 * @param {string} [apiKey] - Optional Portal da Transparência API key
 * @returns {Promise<{isPEP: boolean, entries: Array, confidence: string, detail: string}>}
 */
export async function checkPEP(name, apiKey = '') {
  if (!name || name === '—') {
    return { isPEP: false, entries: [], confidence: 'N/A', detail: 'Nome não disponível.' };
  }

  // Normalize: remove accents, uppercase, trim
  const normalized = name.trim().toUpperCase();
  // Use first + last name for better matching (avoids middle name mismatches)
  const parts = normalized.split(/\s+/);
  const searchName = parts.length >= 2
    ? `${parts[0]} ${parts[parts.length - 1]}`
    : normalized;

  const headers = { 'Accept': 'application/json' };
  if (apiKey) headers['chave-api-dados'] = apiKey;

  try {
    const url = `https://api.portaldatransparencia.gov.br/api-de-dados/peps?nome=${encodeURIComponent(searchName)}&pagina=1`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // Filter for high-confidence matches: compare normalized names
        const matches = data.filter(entry => {
          const entryName = (entry.nome || '').toUpperCase();
          return entryName.includes(parts[0]) && entryName.includes(parts[parts.length - 1]);
        });

        if (matches.length > 0) {
          const top = matches[0];
          return {
            isPEP: true,
            entries: matches.slice(0, 3),
            confidence: matches.length > 0 ? 'Alta' : 'Média',
            detail: `PEP identificado: ${top.nome || name}. Função: ${top.descricaoFuncao || 'não informada'}. Órgão: ${top.orgaoServidorLotacao || 'não informado'}.`,
          };
        }
      }
      return {
        isPEP: false,
        entries: [],
        confidence: 'Verificado',
        detail: 'Nome não encontrado no cadastro de PEPs do Portal da Transparência.',
      };
    }
  } catch (e) {
    console.warn('[ESG] PEP check failed for', name, e.message);
  }

  // Graceful degradation — no API key or network error
  return {
    isPEP: false,
    entries: [],
    confidence: 'Pendente',
    detail: apiKey
      ? 'Verificação PEP indisponível no momento. Tente novamente.'
      : 'Verificação PEP pendente. Configure uma chave gratuita do Portal da Transparência para habilitar.',
  };
}

// ── CNEP — National Punished Companies ───────────────────────────────────────

/**
 * Check if a CNPJ appears in the CNEP (Cadastro Nacional de Empresas Punidas).
 * CNEP lists companies punished under the Anti-Corruption Law (Lei 12.846/2013).
 * This is distinct from CEIS (administrative sanctions) — CNEP covers judicial punishments.
 *
 * Endpoint: GET /api-de-dados/cnep?codigoSancionado={cnpj}&pagina=1
 *
 * @param {string} cnpj - Raw or formatted CNPJ
 * @param {string} [apiKey]
 * @returns {Promise<{found: boolean, entries: Array, status: string, detail: string}>}
 */
export async function checkCNEP(cnpj, apiKey = '') {
  const clean = cnpj.replace(/\D/g, '');
  if (!clean || clean.length !== 14) {
    return { found: false, entries: [], status: 'Inválido', detail: 'CNPJ inválido.' };
  }

  const headers = { 'Accept': 'application/json' };
  if (apiKey) headers['chave-api-dados'] = apiKey;

  if (apiKey) {
    try {
      const url = `https://api.portaldatransparencia.gov.br/api-de-dados/cnep?codigoSancionado=${clean}&pagina=1`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return {
            found: true,
            entries: data,
            status: 'Punida (CNEP)',
            detail: `CNPJ punido pela Lei Anticorrupção. ${data.length} registro(s). Último: ${data[0].tipoSancao || 'sanção não especificada'} — ${data[0].orgaoSancionador?.nome || 'órgão não informado'}.`,
          };
        }
        return {
          found: false,
          entries: [],
          status: 'Verificado',
          detail: 'CNPJ não encontrado no CNEP (Cadastro Nacional de Empresas Punidas).',
        };
      }
    } catch { /* fall through */ }
  }

  return {
    found: false,
    entries: [],
    status: 'Pendente',
    detail: 'Verificação CNEP pendente. Configure chave do Portal da Transparência.',
  };
}

// ── Leniency Agreements ───────────────────────────────────────────────────────

/**
 * Check if a CNPJ has signed a leniency agreement (Acordo de Leniência).
 * These are negotiated settlements under the Anti-Corruption Law.
 *
 * Endpoint: GET /api-de-dados/acordos-leniencia?cnpj={cnpj}&pagina=1
 *
 * @param {string} cnpj
 * @param {string} [apiKey]
 * @returns {Promise<{found: boolean, entries: Array, status: string, detail: string}>}
 */
export async function checkLeniencyAgreement(cnpj, apiKey = '') {
  const clean = cnpj.replace(/\D/g, '');
  const headers = { 'Accept': 'application/json' };
  if (apiKey) headers['chave-api-dados'] = apiKey;

  if (apiKey) {
    try {
      const url = `https://api.portaldatransparencia.gov.br/api-de-dados/acordos-leniencia?cnpj=${clean}&pagina=1`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return {
            found: true,
            entries: data,
            status: 'Acordo de Leniência',
            detail: `CNPJ possui ${data.length} acordo(s) de leniência firmado(s) com a CGU/AGU.`,
          };
        }
        return { found: false, entries: [], status: 'Verificado', detail: 'Nenhum acordo de leniência encontrado.' };
      }
    } catch { /* fall through */ }
  }

  return { found: false, entries: [], status: 'Pendente', detail: 'Verificação de acordos de leniência pendente.' };
}

// ── Shareholder Graph & Economic Group Analysis ───────────────────────────────

/**
 * Analyze the shareholder structure to detect economic group patterns,
 * PEP exposure, and corporate concentration.
 *
 * This function takes the already-fetched socios list and enriches it
 * with PEP checks and influence scoring.
 *
 * @param {Array} socios - Normalized shareholder list from extractSocios()
 * @param {string} [apiKey]
 * @returns {Promise<ShareholderAnalysis>}
 */
export async function analyzeShareholderGraph(socios, apiKey = '') {
  if (!socios || socios.length === 0) {
    return {
      pepCount: 0,
      pepShareholders: [],
      dominantShareholder: null,
      concentrationScore: 0,
      influenceScore: 0,
      economicGroupIndicators: [],
      summary: 'Quadro societário não disponível.',
    };
  }

  const pepResults = [];
  const economicGroupIndicators = [];

  // Check each shareholder for PEP status (sequential to respect rate limits)
  for (const socio of socios.slice(0, 5)) { // limit to 5 to avoid rate limiting
    if (!socio.nome || socio.nome === '—') continue;

    const pepResult = await checkPEP(socio.nome, apiKey);
    if (pepResult.isPEP) {
      pepResults.push({ ...socio, pepDetail: pepResult.detail, pepEntries: pepResult.entries });
    }

    // Detect economic group patterns from shareholder names/types
    if (socio.tipo === 'JURIDICA' || (socio.qualificacao || '').toLowerCase().includes('administrador')) {
      economicGroupIndicators.push(`Sócio jurídico detectado: ${socio.nome} — possível holding ou grupo econômico`);
    }
    if ((socio.qualificacao || '').toLowerCase().includes('presidente') ||
        (socio.qualificacao || '').toLowerCase().includes('diretor')) {
      economicGroupIndicators.push(`Sócio com cargo executivo: ${socio.nome} (${socio.qualificacao})`);
    }

    // Small delay to respect API rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  // Concentration score: fewer shareholders = higher concentration = higher risk
  const concentrationScore = socios.length <= 2 ? 85
    : socios.length <= 4 ? 65
    : socios.length <= 8 ? 40
    : 20;

  // Influence score: PEPs + executive roles + juridical shareholders
  const pepInfluence = pepResults.length * 30;
  const juridicalInfluence = socios.filter(s => s.tipo === 'JURIDICA').length * 15;
  const influenceScore = Math.min(100, pepInfluence + juridicalInfluence + (concentrationScore * 0.3));

  const dominantShareholder = socios.length > 0 ? socios[0] : null;

  return {
    pepCount: pepResults.length,
    pepShareholders: pepResults,
    dominantShareholder,
    concentrationScore,
    influenceScore: Math.round(influenceScore),
    economicGroupIndicators,
    summary: buildShareholderSummary(socios, pepResults, concentrationScore),
  };
}

function buildShareholderSummary(socios, pepResults, concentrationScore) {
  const parts = [];
  parts.push(`${socios.length} sócio(s) identificado(s).`);
  if (pepResults.length > 0) {
    parts.push(`⚠ ${pepResults.length} PEP(s) detectado(s) no quadro societário.`);
  }
  const juridical = socios.filter(s => s.tipo === 'JURIDICA');
  if (juridical.length > 0) {
    parts.push(`${juridical.length} sócio(s) jurídico(s) — possível estrutura de grupo econômico.`);
  }
  if (concentrationScore >= 70) {
    parts.push('Alta concentração societária — controle centralizado.');
  }
  return parts.join(' ');
}

// ── ESG Risk Index ────────────────────────────────────────────────────────────

/**
 * Calculate the composite ESG Risk Index (0–100) for field agents.
 *
 * This is the primary score for IBAMA agents and Greenpeace activists:
 * it combines real environmental infractions with corporate power structure
 * to identify which companies pose the greatest ESG risk.
 *
 * Components:
 *   - Environmental (E): IBAMA embargoes + CNAE sector risk     (40 pts max)
 *   - Social/Governance (S+G): CEIS + CNEP + PEP influence      (35 pts max)
 *   - Corporate Power (P): Shareholder concentration + size     (25 pts max)
 *
 * @param {object} record - Full company record (post-buildRecord)
 * @param {object} shareholderAnalysis - Result from analyzeShareholderGraph()
 * @param {object} cnepResult - Result from checkCNEP()
 * @param {object} leniencyResult - Result from checkLeniencyAgreement()
 * @returns {{ score: number, label: string, components: object, fieldPriority: string, actionItems: string[] }}
 */
export function calcESGRiskIndex(record, shareholderAnalysis, cnepResult, leniencyResult) {
  let envScore = 0;
  let sgScore = 0;
  let powerScore = 0;
  const actionItems = [];

  // ── Environmental component (E) — max 40 pts ──────────────────────────────

  // Real IBAMA embargoes: most critical signal
  if (record.ibamaStatus === 'Alerta Ambiental') {
    const numEmbargoes = (record.ibamaEntries || []).length;
    envScore += Math.min(25, 15 + numEmbargoes * 3);
    actionItems.push(`🔴 IBAMA: ${numEmbargoes} embargo(s) ativo(s). Verificar situação de regularização in loco.`);
  }

  // CNAE sector environmental risk (normalized to 15 pts max)
  const cnaeEnvNorm = Math.round((record.envScore || 0) * 0.15);
  envScore += cnaeEnvNorm;

  // Large company with high env score = amplified risk
  if ((record.porte || '').toLowerCase().includes('grande') && record.envScore >= 60) {
    envScore = Math.min(40, envScore + 5);
    actionItems.push('🟠 Empresa de grande porte com alto risco ambiental setorial.');
  }

  // ── Social/Governance component (S+G) — max 35 pts ───────────────────────

  // CEIS (administrative sanctions)
  if (record.antiCorruptionStatus === 'Alerta') {
    sgScore += 12;
    actionItems.push('🔴 CEIS: Empresa sancionada administrativamente. Verificar contratos públicos ativos.');
  }

  // CNEP (judicial punishments under Anti-Corruption Law)
  if (cnepResult && cnepResult.found) {
    sgScore += 15;
    actionItems.push('🔴 CNEP: Empresa punida pela Lei Anticorrupção (Lei 12.846/2013).');
  }

  // Leniency agreement (signals past major wrongdoing)
  if (leniencyResult && leniencyResult.found) {
    sgScore += 8;
    actionItems.push('🟠 Acordo de Leniência firmado com CGU/AGU — histórico de irregularidades graves.');
  }

  // PEP shareholders
  if (shareholderAnalysis && shareholderAnalysis.pepCount > 0) {
    sgScore += Math.min(10, shareholderAnalysis.pepCount * 5);
    actionItems.push(`🟠 PEP: ${shareholderAnalysis.pepCount} pessoa(s) politicamente exposta(s) no quadro societário.`);
  }

  sgScore = Math.min(35, sgScore);

  // ── Corporate Power component (P) — max 25 pts ───────────────────────────

  // Company size (large = more impact)
  const porte = (record.porte || '').toLowerCase();
  if (porte.includes('grande') || porte.includes('demais')) powerScore += 10;
  else if (porte.includes('médio') || porte.includes('medio')) powerScore += 6;
  else if (porte.includes('pequeno') || porte.includes('epp')) powerScore += 3;

  // Shareholder concentration
  if (shareholderAnalysis) {
    powerScore += Math.round(shareholderAnalysis.concentrationScore * 0.10);
    if (shareholderAnalysis.influenceScore > 50) {
      powerScore += 5;
      actionItems.push('🟡 Alta influência societária detectada — possível grupo econômico com poder político.');
    }
  }

  // Capital social (proxy for economic power)
  const capital = parseFloat(String(record.capitalSocial || '0').replace(',', '.')) || 0;
  if (capital > 100_000_000) powerScore += 5;
  else if (capital > 10_000_000) powerScore += 3;
  else if (capital > 1_000_000) powerScore += 1;

  powerScore = Math.min(25, powerScore);

  // ── Composite ESG Risk Index ──────────────────────────────────────────────

  const totalScore = Math.min(100, envScore + sgScore + powerScore);

  let label;
  let fieldPriority;
  if (totalScore >= 70) {
    label = 'Crítico';
    fieldPriority = 'PRIORIDADE MÁXIMA — Ação imediata recomendada';
    if (!actionItems.some(a => a.includes('Prioridade'))) {
      actionItems.unshift('🚨 ALERTA DE CAMPO: Esta empresa é alvo prioritário para fiscalização presencial.');
    }
  } else if (totalScore >= 50) {
    label = 'Alto';
    fieldPriority = 'Alta prioridade — Incluir em próxima operação de campo';
  } else if (totalScore >= 30) {
    label = 'Moderado';
    fieldPriority = 'Monitoramento contínuo recomendado';
  } else {
    label = 'Baixo';
    fieldPriority = 'Baixa prioridade — Monitoramento periódico';
  }

  if (actionItems.length === 0) {
    actionItems.push('✅ Nenhuma irregularidade crítica detectada nas fontes consultadas.');
  }

  return {
    score: totalScore,
    label,
    fieldPriority,
    components: {
      environmental: envScore,
      socialGovernance: sgScore,
      corporatePower: powerScore,
    },
    actionItems,
  };
}

// ── Field Action Plan Generator ───────────────────────────────────────────────

/**
 * Generate a structured field action plan for IBAMA agents / Greenpeace activists.
 * This is the primary output for agents on the ground.
 *
 * @param {object} record - Full company record
 * @param {object} esgIndex - Result from calcESGRiskIndex()
 * @param {object} shareholderAnalysis - Result from analyzeShareholderGraph()
 * @returns {FieldActionPlan}
 */
export function generateFieldActionPlan(record, esgIndex, shareholderAnalysis) {
  const plan = {
    priority: esgIndex.fieldPriority,
    targetName: record.razaoSocial,
    targetCNPJ: record.cnpj,
    targetAddress: [record.logradouro, record.numero, record.municipio, record.uf].filter(Boolean).join(', '),
    esgScore: esgIndex.score,
    esgLabel: esgIndex.label,

    // Immediate actions for field agents
    immediateActions: [],

    // Documentation to request on site
    documentsToRequest: [],

    // Authorities to notify
    authoritiesToNotify: [],

    // Legal references
    legalReferences: [],

    // Key contacts
    keyContacts: [],
  };

  // Build immediate actions based on findings
  if (record.ibamaStatus === 'Alerta Ambiental') {
    plan.immediateActions.push('Verificar se o embargo IBAMA ainda está em vigor (consultar TAD no sistema SIFISC)');
    plan.immediateActions.push('Fotografar e georreferenciar a área embargada');
    plan.immediateActions.push('Verificar se há atividade em andamento na área embargada (infração continuada)');
    plan.documentsToRequest.push('Licença Ambiental de Operação (LO) vigente');
    plan.documentsToRequest.push('Plano de Recuperação de Área Degradada (PRAD) se aplicável');
    plan.authoritiesToNotify.push('IBAMA — Sede regional competente');
    plan.legalReferences.push('Lei 9.605/98 (Lei de Crimes Ambientais) — Art. 60, 70');
    plan.legalReferences.push('Decreto 6.514/2008 — Art. 50 (embargo de área)');
  }

  if (record.antiCorruptionStatus === 'Alerta') {
    plan.immediateActions.push('Verificar contratos públicos ativos com esta empresa (Portal da Transparência)');
    plan.authoritiesToNotify.push('CGU — Controladoria-Geral da União');
    plan.authoritiesToNotify.push('MPF — Ministério Público Federal (se houver indício de crime)');
    plan.legalReferences.push('Lei 12.846/2013 (Lei Anticorrupção)');
  }

  if (shareholderAnalysis && shareholderAnalysis.pepCount > 0) {
    plan.immediateActions.push('Mapear relações entre sócios PEP e contratos públicos ambientais');
    plan.documentsToRequest.push('Declaração de bens e conflito de interesses dos sócios PEP');
    plan.authoritiesToNotify.push('CGU — Setor de Conflito de Interesses');
    plan.legalReferences.push('Lei 12.813/2013 (Conflito de Interesses)');
    plan.legalReferences.push('Resolução COAF 36/2021 (PEP e lavagem de dinheiro)');
  }

  if (esgIndex.components.environmental >= 20) {
    plan.documentsToRequest.push('Outorga de uso de recursos hídricos (ANA/SEMA)');
    plan.documentsToRequest.push('Certificado de Regularidade do CAR (Cadastro Ambiental Rural)');
    plan.documentsToRequest.push('Relatório de monitoramento de efluentes (último semestre)');
    plan.legalReferences.push('Lei 12.651/2012 (Código Florestal) — CAR obrigatório');
    plan.legalReferences.push('Lei 9.433/1997 (Política Nacional de Recursos Hídricos)');
  }

  // Always include basic field documentation
  plan.documentsToRequest.push('CNPJ e Contrato Social atualizado');
  plan.documentsToRequest.push('Alvará de funcionamento municipal vigente');

  // Key contacts based on UF
  plan.keyContacts.push(`IBAMA — Superintendência ${record.uf || 'Regional'}: ibama.gov.br/contato`);
  plan.keyContacts.push('IBAMA Disque-Denúncia: 0800-618080');
  plan.keyContacts.push('Portal da Transparência: portaldatransparencia.gov.br');

  return plan;
}

// ── Utility: batch ESG enrichment ─────────────────────────────────────────────

/**
 * Run full ESG Intelligence enrichment for a company record.
 * This is the main entry point called from store.js during buildRecord().
 *
 * @param {object} partialRecord - Record after basic scoring is complete
 * @param {Array} socios - Normalized shareholder list
 * @param {string} [apiKey]
 * @returns {Promise<ESGIntelligenceResult>}
 */
export async function runESGIntelligence(partialRecord, socios, apiKey = '') {
  // Run CNEP and leniency checks in parallel (both need API key)
  const [cnepResult, leniencyResult] = await Promise.all([
    checkCNEP(partialRecord.cnpj, apiKey),
    checkLeniencyAgreement(partialRecord.cnpj, apiKey),
  ]);

  // Shareholder graph analysis (includes PEP checks — sequential)
  const shareholderAnalysis = await analyzeShareholderGraph(socios, apiKey);

  // Composite ESG Risk Index
  const esgIndex = calcESGRiskIndex(partialRecord, shareholderAnalysis, cnepResult, leniencyResult);

  // Field action plan
  const fieldActionPlan = generateFieldActionPlan(partialRecord, esgIndex, shareholderAnalysis);

  return {
    cnepResult,
    leniencyResult,
    shareholderAnalysis,
    esgIndex,
    fieldActionPlan,
  };
}
