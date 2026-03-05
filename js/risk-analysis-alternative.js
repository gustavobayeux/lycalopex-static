/**
 * risk-analysis-alternative.js — Alternative risk analysis without Portal da Transparência
 *
 * Análise de risco baseada em:
 *   1. Brasil.IO — dados de sócios, histórico de empresas
 *   2. CNPJ.ws — dados cadastrais e estrutura societária
 *   3. MapBiomas + INPE — desmatamento e queimadas por localização
 *   4. Padrões de risco local — grilhagem, fraude, etc
 *   5. Análise de rede de sócios — conexões entre empresas
 */

'use strict';

// ── Análise de Sócios (PEP detection alternativa) ──────────────────────────

/**
 * Detectar possíveis PEPs via análise de padrões de nomes e qualificações
 * Sem dependência do Portal da Transparência
 * @param {Array} socios - Array de sócios
 * @returns {Promise<{possiblePEPs: Array, confidence: number}>}
 */
export async function detectPossiblePEPs(socios) {
  const possiblePEPs = [];
  
  if (!socios || socios.length === 0) {
    return { possiblePEPs: [], confidence: 0 };
  }

  // Padrões de nomes e qualificações associados a PEPs
  const pepPatterns = {
    qualifications: [
      'presidente', 'vice-presidente', 'diretor', 'superintendente',
      'secretário', 'conselheiro', 'procurador', 'juiz', 'desembargador',
      'senador', 'deputado', 'vereador', 'prefeito', 'governador',
      'ministro', 'secretário de estado', 'secretário municipal',
    ],
    namePatterns: [
      /^[A-Z]{1,3}$/,  // Iniciais apenas
      /\b(LTDA|S\.A|HOLDINGS|PARTICIPAÇÕES)\b/i,  // Estruturas corporativas
    ],
  };

  let totalConfidence = 0;

  for (const socio of socios) {
    const qual = (socio.qualificacao || '').toLowerCase();
    const nome = (socio.nome || '').toLowerCase();
    let confidence = 0;

    // Verificar qualificações
    for (const pattern of pepPatterns.qualifications) {
      if (qual.includes(pattern)) {
        confidence += 15;
      }
    }

    // Verificar padrões de nome
    for (const pattern of pepPatterns.namePatterns) {
      if (pattern.test(socio.nome || '')) {
        confidence += 10;
      }
    }

    // Verificar se é pessoa jurídica (holding, empresa de participações)
    if (socio.tipo === 'JURIDICA' || qual.includes('administrador')) {
      confidence += 8;
    }

    if (confidence > 20) {
      possiblePEPs.push({
        nome: socio.nome,
        qualificacao: socio.qualificacao,
        tipo: socio.tipo,
        confidence,
        indicators: [
          confidence >= 30 ? 'Padrão de exposição política detectado' : null,
          confidence >= 20 ? 'Cargo executivo ou administrativo' : null,
        ].filter(Boolean),
      });
      totalConfidence += confidence;
    }
  }

  return {
    possiblePEPs,
    confidence: Math.min(100, Math.round(totalConfidence / socios.length)),
  };
}

// ── Análise de Sanções (CNEP/CEIS alternativa) ─────────────────────────────

/**
 * Detectar possíveis sanções via análise de padrões de empresa
 * Sem dependência do Portal da Transparência
 * @param {object} companyData - Dados da empresa
 * @returns {Promise<{possibleSanctions: Array, riskLevel: string}>}
 */
export async function detectPossibleSanctions(companyData) {
  const possibleSanctions = [];
  let riskScore = 0;

  // ── Fator 1: Situação cadastral ──────────────────────────────────────────
  const situacao = (companyData.situacao || '').toLowerCase();
  if (situacao.includes('suspensa') || situacao.includes('cancelada')) {
    possibleSanctions.push({
      type: 'Situação cadastral irregular',
      detail: `Situação: ${companyData.situacao}`,
      severity: 'alta',
    });
    riskScore += 30;
  }

  // ── Fator 2: Histórico de alterações (indicador de instabilidade) ────────
  // Nota: CNPJ.ws fornece data de abertura, podemos inferir instabilidade
  const abertura = companyData.abertura || '';
  const yearMatch = abertura.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    const age = new Date().getFullYear() - year;
    
    // Empresas muito novas em atividades de risco
    if (age < 1) {
      possibleSanctions.push({
        type: 'Empresa recém-constituída',
        detail: 'Criada há menos de 1 ano — padrão de estrutura de fraude',
        severity: 'média',
      });
      riskScore += 15;
    }
  }

  // ── Fator 3: Mudanças de sócios (indicador de fraude) ────────────────────
  // Nota: Brasil.IO fornece histórico de sócios
  const socios = companyData.socios || [];
  if (socios.length > 10) {
    possibleSanctions.push({
      type: 'Elevada rotatividade de sócios',
      detail: `${socios.length} sócios registrados — padrão de fraude societária`,
      severity: 'média',
    });
    riskScore += 12;
  }

  // ── Fator 4: Atividade inconsistente com localização ────────────────────
  const cnae = (companyData.cnaeLabel || '').toLowerCase();
  const municipio = (companyData.municipio || '').toLowerCase();
  const endereco = (companyData.logradouro || '').toLowerCase();

  // Exemplo: empresa de mineração em zona urbana central
  if ((cnae.includes('mineração') || cnae.includes('extração')) && 
      (endereco.includes('avenida') || endereco.includes('rua ') || endereco.includes('centro'))) {
    possibleSanctions.push({
      type: 'Atividade inconsistente com localização',
      detail: 'Atividade de extração/mineração em zona urbana — possível fraude',
      severity: 'alta',
    });
    riskScore += 18;
  }

  // ── Fator 5: Ausência de dados de contato ────────────────────────────────
  if (!companyData.telefone && !companyData.email) {
    possibleSanctions.push({
      type: 'Ausência de contato',
      detail: 'Empresa sem telefone ou email registrado',
      severity: 'baixa',
    });
    riskScore += 8;
  }

  // ── Fator 6: Capital social suspeito ────────────────────────────────────
  const capital = parseFloat(String(companyData.capitalSocial || '0').replace(',', '.')) || 0;
  const porte = (companyData.porte || '').toLowerCase();

  if (capital < 1000 && (porte.includes('grande') || porte.includes('médio'))) {
    possibleSanctions.push({
      type: 'Capital social inconsistente',
      detail: `Capital de R$ ${companyData.capitalSocial} para empresa de porte ${companyData.porte}`,
      severity: 'média',
    });
    riskScore += 14;
  }

  // Determinar nível de risco
  let riskLevel = 'baixo';
  if (riskScore >= 50) riskLevel = 'crítico';
  else if (riskScore >= 35) riskLevel = 'alto';
  else if (riskScore >= 20) riskLevel = 'médio';

  return {
    possibleSanctions,
    riskLevel,
    riskScore: Math.min(100, riskScore),
  };
}

// ── Análise de Rede de Sócios ────────────────────────────────────────────────

/**
 * Construir grafo de relações entre sócios e empresas
 * Detectar estruturas de fraude, grupos econômicos, etc
 * @param {Array} companies - Array de dados de empresas
 * @returns {Promise<{shareholderNetwork: object, patterns: Array}>}
 */
export async function analyzeShareholderNetwork(companies) {
  const shareholderMap = new Map();
  const patterns = [];

  // Construir mapa de sócios → empresas
  for (const company of companies) {
    const socios = company.socios || [];
    for (const socio of socios) {
      const key = (socio.cpfHash || socio.nome || '').toLowerCase();
      if (!key) continue;

      if (!shareholderMap.has(key)) {
        shareholderMap.set(key, {
          name: socio.nome,
          companies: [],
          totalShares: 0,
        });
      }

      shareholderMap.get(key).companies.push({
        cnpj: company.cnpj,
        razaoSocial: company.razaoSocial,
      });
    }
  }

  // Detectar padrões
  for (const [key, data] of shareholderMap) {
    if (data.companies.length > 5) {
      patterns.push({
        type: 'Sócio com múltiplas empresas',
        detail: `${data.name} é sócio de ${data.companies.length} empresas`,
        severity: 'média',
        companies: data.companies,
      });
    }
  }

  return {
    shareholderNetwork: Object.fromEntries(shareholderMap),
    patterns,
  };
}

// ── Análise de Desmatamento (via MapBiomas/INPE) ──────────────────────────

/**
 * Consultar dados de desmatamento para uma localização
 * Usa INPE Queimadas API (pública, sem autenticação)
 * @param {string} municipio
 * @param {string} uf
 * @returns {Promise<{deforestationRisk: number, indicators: Array}>}
 */
export async function analyzeDeforestationRisk(municipio, uf) {
  const indicators = [];
  let deforestationRisk = 0;

  try {
    // INPE Queimadas API — dados públicos de queimadas por município
    const url = `https://queimadas.dgi.inpe.br/queimadas/bdqueimadas/api/firespots/municipio/${encodeURIComponent(municipio)}/state/${uf}?limit=100`;
    
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const fireSpots = data.features || [];
      
      if (fireSpots.length > 0) {
        // Calcular densidade de queimadas
        const recentFires = fireSpots.filter(f => {
          const date = new Date(f.properties?.data_hora || 0);
          const daysSince = (new Date() - date) / (1000 * 60 * 60 * 24);
          return daysSince < 365;
        });

        if (recentFires.length > 0) {
          deforestationRisk = Math.min(100, 30 + (recentFires.length * 2));
          indicators.push(`${recentFires.length} focos de queimada nos últimos 12 meses`);
        }
      }
    }
  } catch (e) {
    console.warn('[Deforestation Risk] INPE API error:', e.message);
  }

  // Padrão regional de risco
  const highRiskStates = {
    'PA': 40,
    'AM': 40,
    'AC': 35,
    'RO': 35,
    'TO': 30,
    'MA': 30,
    'MT': 35,
  };

  if (highRiskStates[uf] && deforestationRisk < highRiskStates[uf]) {
    deforestationRisk = highRiskStates[uf];
    indicators.push(`Região ${uf} com histórico de desmatamento`);
  }

  return {
    deforestationRisk,
    indicators,
  };
}

/**
 * Análise integrada de risco alternativa
 * Combina todas as fontes de dados sem dependência do Portal da Transparência
 * @param {object} companyData
 * @param {string} municipio
 * @param {string} uf
 * @returns {Promise<object>}
 */
export async function runAlternativeRiskAnalysis(companyData, municipio, uf) {
  const [
    pepAnalysis,
    sanctionAnalysis,
    deforestationAnalysis,
  ] = await Promise.all([
    detectPossiblePEPs(companyData.socios || []),
    detectPossibleSanctions(companyData),
    analyzeDeforestationRisk(municipio, uf),
  ]);

  const totalRiskScore = Math.round(
    (sanctionAnalysis.riskScore * 0.4) +
    (deforestationAnalysis.deforestationRisk * 0.35) +
    (pepAnalysis.confidence * 0.25)
  );

  return {
    pepAnalysis,
    sanctionAnalysis,
    deforestationAnalysis,
    totalRiskScore,
    riskLevel: totalRiskScore >= 70 ? 'Crítico' : totalRiskScore >= 50 ? 'Alto' : totalRiskScore >= 30 ? 'Médio' : 'Baixo',
  };
}
