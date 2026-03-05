/**
 * city-search-ondemand.js — On-demand city search for Lycalopex
 *
 * Busca empresas em uma cidade/UF específica consultando:
 *   1. CNPJ.ws API para listar empresas por localização
 *   2. Brasil.IO para dados de sócios e histórico
 *   3. Análise de risco local baseada em CNAE + localização
 *   4. Detecção de padrões de risco (grilhagem, desmatamento, etc)
 *
 * Sem dependência do Portal da Transparência — totalmente on-demand
 */

'use strict';

/**
 * Buscar empresas em um município via CNPJ.ws
 * @param {string} municipio - Nome do município (ex: "São Paulo")
 * @param {string} uf - Sigla da UF (ex: "SP")
 * @returns {Promise<Array>} Array de CNPJs encontrados
 */
export async function searchCompaniesByCity(municipio, uf) {
  if (!municipio || !uf) return [];

  try {
    // CNPJ.ws não tem endpoint de busca por município direto
    // Alternativa: usar Brasil.IO que tem dados estruturados por localização
    const url = `https://brasil.io/api/dataset/empresas-brasil/empresa/?municipio=${encodeURIComponent(municipio)}&estado=${uf}&limit=100`;
    
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Lycalopex/2.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[City Search] Brasil.IO search failed for ${municipio}/${uf}`);
      return [];
    }

    const data = await res.json();
    const results = data.results || [];
    
    // Extrair CNPJs únicos
    const cnpjs = [...new Set(results.map(r => r.cnpj).filter(Boolean))];
    console.log(`[City Search] Found ${cnpjs.length} companies in ${municipio}/${uf}`);
    
    return cnpjs;
  } catch (e) {
    console.warn('[City Search] Error:', e.message);
    return [];
  }
}

/**
 * Analisar risco de uma empresa baseado em padrões locais
 * Detecta sinais de possível grilhagem, desmatamento ilegal, etc
 * @param {object} companyData - Dados normalizados da empresa
 * @param {string} municipio - Município
 * @param {string} uf - UF
 * @returns {Promise<{riskScore: number, riskFactors: Array, indicators: Array}>}
 */
export async function analyzeLocalRisk(companyData, municipio, uf) {
  const riskFactors = [];
  const indicators = [];
  let riskScore = 0;

  // ── Fator 1: Atividade principal (CNAE) ──────────────────────────────────
  const cnaeLabel = (companyData.cnaeLabel || '').toLowerCase();
  const riskCNAE = {
    'pecuária': 35,
    'agricultura': 30,
    'madeira': 40,
    'celulose': 38,
    'frigorífico': 35,
    'usina': 32,
    'mineração': 45,
    'processamento': 28,
  };

  for (const [activity, score] of Object.entries(riskCNAE)) {
    if (cnaeLabel.includes(activity)) {
      riskScore += score;
      riskFactors.push(`Atividade de alto risco ambiental: ${companyData.cnaeLabel}`);
      break;
    }
  }

  // ── Fator 2: Localização em região de risco ──────────────────────────────
  const riskRegions = {
    'PA': 45,  // Pará - Amazônia
    'AM': 45,  // Amazonas
    'AC': 40,  // Acre
    'RO': 40,  // Rondônia
    'TO': 35,  // Tocantins
    'MA': 35,  // Maranhão
    'MT': 40,  // Mato Grosso
    'MS': 30,  // Mato Grosso do Sul
    'GO': 25,  // Goiás
  };

  if (riskRegions[uf]) {
    riskScore += riskRegions[uf];
    riskFactors.push(`Localização em região de alto risco ambiental: ${uf}`);
    indicators.push(`UF ${uf} é zona de proteção ambiental ou desmatamento histórico`);
  }

  // ── Fator 3: Padrão de grilhagem (empresa nova + atividade rural + região) ──
  const abertura = companyData.abertura || '';
  const yearMatch = abertura.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    const age = new Date().getFullYear() - year;
    
    if (age < 3 && (cnaeLabel.includes('agricultura') || cnaeLabel.includes('pecuária'))) {
      riskScore += 25;
      riskFactors.push('Possível grilhagem: empresa nova em atividade rural em região de risco');
      indicators.push(`Empresa criada em ${abertura} — padrão de grilhagem`);
    }
  }

  // ── Fator 4: Porte e capital social (empresas pequenas podem ser fantasmas) ──
  const porte = (companyData.porte || '').toLowerCase();
  const capital = parseFloat(String(companyData.capitalSocial || '0').replace(',', '.')) || 0;

  if ((porte.includes('micro') || porte.includes('pequeno')) && capital < 100000) {
    riskScore += 15;
    riskFactors.push('Empresa de pequeno porte com baixo capital — possível estrutura de fraude');
    indicators.push(`Capital social baixo (${companyData.capitalSocial}) para atividade declarada`);
  }

  // ── Fator 5: Sócios com padrões suspeitos ──────────────────────────────────
  const socios = companyData.socios || [];
  if (socios.length === 1) {
    riskScore += 10;
    riskFactors.push('Empresa com único sócio — estrutura centralizada');
  }

  // Detectar padrão de sócios com nomes genéricos ou mascarados
  const genericNames = socios.filter(s => 
    (s.nome || '').match(/^[A-Z]{1,3}$/) || 
    (s.nome || '').includes('LTDA') ||
    (s.nome || '').includes('HOLDINGS')
  );
  if (genericNames.length > 0) {
    riskScore += 12;
    indicators.push(`${genericNames.length} sócio(s) com nomes genéricos ou estrutura de holding`);
  }

  // ── Fator 6: Situação cadastral ──────────────────────────────────────────
  const situacao = (companyData.situacao || '').toLowerCase();
  if (situacao.includes('suspensa') || situacao.includes('cancelada')) {
    riskScore += 20;
    riskFactors.push('Empresa com situação cadastral irregular');
  }

  // ── Fator 7: Endereço suspeito (zona rural, sem número, etc) ──────────────
  const endereco = [
    companyData.logradouro || '',
    companyData.numero || '',
    companyData.bairro || '',
  ].join(' ').toLowerCase();

  const ruralIndicators = ['zona rural', 'estrada', 'rodovia', 'km ', 'fazenda', 'sítio', 'chácara', 'distrito'];
  if (ruralIndicators.some(ind => endereco.includes(ind))) {
    riskScore += 10;
    indicators.push('Endereço em zona rural — típico de operações de grilhagem');
  }

  if (!companyData.numero || companyData.numero === 'S/N') {
    riskScore += 8;
    indicators.push('Endereço sem número — dificulta localização e fiscalização');
  }

  // ── Fator 8: Ausência de contato ────────────────────────────────────────
  if (!companyData.telefone && !companyData.email) {
    riskScore += 12;
    riskFactors.push('Empresa sem contato registrado — possível estrutura de fraude');
  }

  // Normalizar score para 0-100
  riskScore = Math.min(100, Math.max(0, riskScore));

  return {
    riskScore,
    riskFactors: [...new Set(riskFactors)],
    indicators: [...new Set(indicators)],
  };
}

/**
 * Detectar padrões de grilhagem em um município
 * Análise agregada de múltiplas empresas para identificar operações coordenadas
 * @param {Array} companies - Array de dados de empresas
 * @param {string} municipio
 * @param {string} uf
 * @returns {Promise<{grilhagePattern: boolean, confidence: number, details: Array}>}
 */
export async function detectGrilhagePattern(companies, municipio, uf) {
  const details = [];
  let confidence = 0;

  if (!companies || companies.length === 0) {
    return { grilhagePattern: false, confidence: 0, details: [] };
  }

  // ── Padrão 1: Múltiplas empresas rurais criadas no mesmo período ──────────
  const recentCompanies = companies.filter(c => {
    const match = (c.abertura || '').match(/(\d{4})/);
    if (!match) return false;
    const year = parseInt(match[1], 10);
    return new Date().getFullYear() - year < 2;
  });

  if (recentCompanies.length >= 3) {
    details.push(`${recentCompanies.length} empresas rurais criadas recentemente no mesmo município`);
    confidence += 30;
  }

  // ── Padrão 2: Empresas com sócios compartilhados ────────────────────────
  const allSocios = new Map();
  companies.forEach(c => {
    (c.socios || []).forEach(s => {
      const key = (s.cpfHash || s.nome || '').toLowerCase();
      if (key) {
        allSocios.set(key, (allSocios.get(key) || 0) + 1);
      }
    });
  });

  const sharedSocios = Array.from(allSocios.values()).filter(count => count > 1);
  if (sharedSocios.length > 0) {
    details.push(`Detectado(s) ${sharedSocios.length} sócio(s) compartilhado(s) entre múltiplas empresas`);
    confidence += 25;
  }

  // ── Padrão 3: Concentração de atividades rurais em pequena área ─────────
  const ruralActivities = companies.filter(c => {
    const cnae = (c.cnaeLabel || '').toLowerCase();
    return cnae.includes('agricultura') || cnae.includes('pecuária') || cnae.includes('madeira');
  });

  if (ruralActivities.length >= companies.length * 0.7) {
    details.push(`${ruralActivities.length}/${companies.length} empresas com atividades rurais — padrão de concentração`);
    confidence += 20;
  }

  // ── Padrão 4: Baixo capital social agregado ────────────────────────────
  const totalCapital = companies.reduce((sum, c) => {
    const cap = parseFloat(String(c.capitalSocial || '0').replace(',', '.')) || 0;
    return sum + cap;
  }, 0);

  const avgCapital = totalCapital / companies.length;
  if (avgCapital < 500000 && ruralActivities.length > 0) {
    details.push(`Capital social médio baixo (R$ ${avgCapital.toLocaleString('pt-BR')}) para operações rurais`);
    confidence += 15;
  }

  const grilhagePattern = confidence >= 50;

  return {
    grilhagePattern,
    confidence: Math.min(100, confidence),
    details,
  };
}

/**
 * Gerar relatório de risco para um município
 * @param {string} municipio
 * @param {string} uf
 * @param {Array} companies - Dados das empresas (opcional, para análise agregada)
 * @returns {Promise<object>}
 */
export async function generateCityRiskReport(municipio, uf, companies = []) {
  const report = {
    municipio,
    uf,
    timestamp: new Date().toISOString(),
    companiesAnalyzed: companies.length,
    highRiskCompanies: [],
    criticalPatterns: [],
    recommendations: [],
  };

  if (companies.length === 0) {
    report.recommendations.push('Nenhuma empresa encontrada neste município.');
    return report;
  }

  // Analisar cada empresa
  const analyzedCompanies = [];
  for (const company of companies) {
    const localRisk = await analyzeLocalRisk(company, municipio, uf);
    if (localRisk.riskScore >= 60) {
      report.highRiskCompanies.push({
        cnpj: company.cnpj,
        razaoSocial: company.razaoSocial,
        riskScore: localRisk.riskScore,
        riskFactors: localRisk.riskFactors,
      });
    }
    analyzedCompanies.push({ ...company, localRisk });
  }

  // Detectar padrões agregados
  if (companies.length >= 3) {
    const grilhagePattern = await detectGrilhagePattern(companies, municipio, uf);
    if (grilhagePattern.grilhagePattern) {
      report.criticalPatterns.push({
        type: 'Possível grilhagem',
        confidence: grilhagePattern.confidence,
        details: grilhagePattern.details,
      });
    }
  }

  // Gerar recomendações
  if (report.highRiskCompanies.length > 0) {
    report.recommendations.push(
      `${report.highRiskCompanies.length} empresa(s) de alto risco identificada(s) — recomenda-se fiscalização prioritária`
    );
  }

  if (report.criticalPatterns.length > 0) {
    report.recommendations.push(
      'Padrões de possível grilhagem detectados — recomenda-se ação coordenada com IBAMA e órgãos fundiários'
    );
  }

  if (report.highRiskCompanies.length === 0 && report.criticalPatterns.length === 0) {
    report.recommendations.push(
      'Nenhum padrão crítico detectado — monitoramento contínuo recomendado'
    );
  }

  return report;
}
