/**
 * scoring.js — Physical Resistance & Fire Vulnerability Scoring Engine
 *
 * Score de Resistência Física (0–100):
 *   Higher score = more resistant = lower fire/intrusion vulnerability
 *
 * Score de Vulnerabilidade a Incêndio (0–100):
 *   Higher score = more vulnerable = higher priority in the list
 *   Vulnerability = 100 - ResistanceScore
 *
 * Criteria (weighted):
 *   1. Tipo de construção (porte/capital)  — 30 pts
 *   2. Porte da empresa                    — (included above)
 *   3. Localização/isolamento              — 15 pts
 *   4. Atividade principal (CNAE)          — 20 pts
 *   5. Ano de abertura (modernidade)       — 15 pts
 *   Subtotal max: 80 pts + up to 20 from CNAE = 100
 *
 * Environmental Risk Score (0–100):
 *   Estimated from CNAE activity profile and company size.
 */

'use strict';

// ── CNAE risk profiles ────────────────────────────────────────────────────────

/**
 * Maps CNAE description keywords to risk profiles.
 * Source: IBGE CNAE 2.3 classification.
 * physical: estimated physical resistance (0–100) for this sector
 * env:      estimated environmental risk (0–100) for this sector
 */
const CNAE_PROFILES = [
  { keywords: ['frigorífico', 'abate', 'bovinos', 'aves', 'suínos', 'carne'],
    label: 'Frigorífico/Abate', physical: 55, env: 70, type: 'frigorífico' },
  { keywords: ['açúcar', 'cana', 'usina', 'etanol', 'álcool'],
    label: 'Usina de Cana/Açúcar', physical: 65, env: 68, type: 'usina' },
  { keywords: ['soja', 'grãos', 'cereais', 'milho', 'beneficiamento'],
    label: 'Beneficiamento de Grãos', physical: 40, env: 35, type: 'beneficiamento' },
  { keywords: ['óleo', 'gordura', 'refino', 'margarina'],
    label: 'Processamento de Óleos', physical: 52, env: 58, type: 'processamento' },
  { keywords: ['laticínio', 'leite', 'queijo', 'manteiga', 'iogurte'],
    label: 'Laticínio', physical: 45, env: 45, type: 'laticínio' },
  { keywords: ['café', 'torrefação', 'moagem'],
    label: 'Beneficiamento de Café', physical: 42, env: 38, type: 'beneficiamento' },
  { keywords: ['cerveja', 'bebida', 'refrigerante', 'vinho', 'aguardente', 'destilaria'],
    label: 'Bebidas/Destilaria', physical: 50, env: 45, type: 'destilaria' },
  { keywords: ['adubo', 'fertilizante', 'defensivo', 'agroquímico', 'pesticida'],
    label: 'Agroquímicos/Fertilizantes', physical: 68, env: 85, type: 'química' },
  { keywords: ['resíduo', 'efluente', 'tratamento', 'aterro'],
    label: 'Tratamento de Resíduos', physical: 55, env: 75, type: 'resíduos' },
  { keywords: ['pecuária', 'bovino', 'suíno', 'aves', 'criação'],
    label: 'Pecuária', physical: 18, env: 55, type: 'pecuária' },
  { keywords: ['cultivo', 'plantio', 'agricultura', 'algodão'],
    label: 'Agricultura', physical: 20, env: 42, type: 'agrícola' },
  { keywords: ['aquicultura', 'pesca', 'camarão', 'tilápia'],
    label: 'Aquicultura/Pesca', physical: 22, env: 50, type: 'aquicultura' },
  { keywords: ['madeira', 'celulose', 'papel', 'florestal'],
    label: 'Madeira/Celulose', physical: 38, env: 60, type: 'florestal' },
  { keywords: ['cooperativa'],
    label: 'Cooperativa Agro-industrial', physical: 45, env: 40, type: 'cooperativa' },
];

const DEFAULT_PROFILE = {
  label: 'Agro-industrial (genérico)', physical: 35, env: 40, type: 'genérico'
};

// ── CNAE profile lookup ───────────────────────────────────────────────────────

/**
 * Get risk profile from activity description or CNAE code.
 * @param {object} companyData - Normalized company record
 * @returns {{ label: string, physical: number, env: number, type: string }}
 */
export function getCNAEProfile(companyData) {
  const activities = companyData.atividade_principal || [];
  if (!activities.length) return DEFAULT_PROFILE;

  const desc = (activities[0].text || activities[0].code || '').toLowerCase();

  for (const profile of CNAE_PROFILES) {
    if (profile.keywords.some(kw => desc.includes(kw))) {
      return profile;
    }
  }
  return DEFAULT_PROFILE;
}

// ── Sub-scores ────────────────────────────────────────────────────────────────

/**
 * Score construction quality from company size and capital.
 * @param {object} d
 * @returns {number} 0–30
 */
function scoreConstruction(d) {
  const porte = (d.porte || '').toLowerCase();
  const capital = parseFloat(String(d.capital_social || '0').replace(',', '.')) || 0;

  let score = 8; // baseline

  if (porte.includes('grande') || porte.includes('demais')) score += 14;
  else if (porte.includes('médio') || porte.includes('medio')) score += 9;
  else if (porte.includes('pequeno') || porte.includes('epp')) score += 5;
  else if (porte.includes('micro') || porte.includes('mei')) score += 2;

  if (capital > 50_000_000) score += 8;
  else if (capital > 10_000_000) score += 5;
  else if (capital > 1_000_000) score += 3;
  else if (capital > 100_000) score += 1;

  return Math.min(score, 30);
}

/**
 * Score location/isolation from address keywords.
 * Rural = harder to reach for emergency services = lower resistance.
 * @param {object} d
 * @returns {number} 0–15
 */
function scoreLocation(d) {
  const combined = [d.logradouro, d.bairro, d.complemento]
    .join(' ').toLowerCase();

  const ruralKw = ['zona rural', 'estrada', 'rodovia', 'br-', 'sp-', 'mt-', 'ms-',
                    'pr-', 'go-', 'to-', 'km ', 'fazenda', 'sítio', 'chácara',
                    'distrito', 'linha ', 'interior'];
  const urbanKw = ['avenida', 'av.', 'rua ', 'alameda', 'praça', 'centro',
                    'industrial', 'parque', 'jardim'];

  if (ruralKw.some(kw => combined.includes(kw))) return 4;
  if (urbanKw.some(kw => combined.includes(kw))) return 13;
  return 8;
}

/**
 * Score modernity from company opening year.
 * @param {object} d
 * @returns {number} 0–15
 */
function scoreAge(d) {
  const abertura = d.abertura || '';
  // Supports DD/MM/YYYY and YYYY-MM-DD
  const yearMatch = abertura.match(/(\d{4})/);
  if (!yearMatch) return 7;
  const year = parseInt(yearMatch[1], 10);
  const age = new Date().getFullYear() - year;

  if (age < 5)  return 15;
  if (age < 10) return 12;
  if (age < 20) return 9;
  if (age < 30) return 6;
  return 3;
}

// ── Main scoring functions ────────────────────────────────────────────────────

/**
 * Calculate Physical Resistance Score (0–100).
 * @param {object} companyData
 * @returns {{ score: number, breakdown: object, justification: string }}
 */
export function calcResistanceScore(companyData) {
  const profile = getCNAEProfile(companyData);

  const construction = scoreConstruction(companyData);
  const location     = scoreLocation(companyData);
  const age          = scoreAge(companyData);
  const cnaeScore    = Math.round(profile.physical * 0.20); // max 20 pts

  const total = Math.min(100, construction + location + age + cnaeScore);

  const breakdown = {
    'Tipo de construção (porte/capital)': `${construction}/30`,
    'Localização / isolamento':           `${location}/15`,
    'Modernidade (ano de abertura)':      `${age}/15`,
    'Perfil de atividade (CNAE)':         `${cnaeScore}/20`,
  };

  const justification = buildJustification(companyData, breakdown, total, profile);

  return { score: total, breakdown, justification };
}

/**
 * Calculate Fire/Arson Vulnerability Score (0–100).
 * Higher = more vulnerable = higher priority in the list.
 * @param {object} companyData
 * @returns {{ score: number, label: string }}
 */
export function calcVulnerabilityScore(companyData) {
  const { score: resistance } = calcResistanceScore(companyData);
  const vulnerability = 100 - resistance;

  let label;
  if (vulnerability >= 75) label = 'Crítico';
  else if (vulnerability >= 55) label = 'Alto';
  else if (vulnerability >= 35) label = 'Moderado';
  else label = 'Baixo';

  return { score: vulnerability, label };
}

/**
 * Calculate Environmental Risk Score (0–100).
 * @param {object} companyData
 * @returns {{ score: number, label: string, indicators: string[] }}
 */
export function calcEnvScore(companyData) {
  const profile = getCNAEProfile(companyData);
  let score = profile.env;
  const indicators = [];

  const porte = (companyData.porte || '').toLowerCase();
  if (porte.includes('grande') || porte.includes('demais')) {
    score = Math.min(100, score + 10);
    indicators.push('Empresa de grande porte — maior potencial de impacto ambiental');
  } else if (porte.includes('micro') || porte.includes('mei')) {
    score = Math.max(0, score - 8);
  }

  // Type-specific indicators
  const typeIndicators = {
    'frigorífico': 'Geração de efluentes orgânicos e resíduos sólidos de abate',
    'usina':       'Vinhaça, torta de filtro e efluentes de processamento de cana',
    'química':     'Manuseio de substâncias químicas de alto risco ambiental',
    'pecuária':    'Risco de contaminação hídrica por dejetos animais',
    'resíduos':    'Manuseio direto de resíduos perigosos e efluentes industriais',
    'destilaria':  'Risco de derramamento de álcool, solventes e efluentes fermentativos',
    'florestal':   'Supressão de vegetação e risco de contaminação por produtos químicos',
    'processamento': 'Efluentes oleosos e risco de contaminação de solo e água',
    'laticínio':   'Efluentes com alta carga orgânica (DBO elevada)',
  };
  if (typeIndicators[profile.type]) indicators.push(typeIndicators[profile.type]);
  if (!indicators.length) indicators.push(`Perfil de risco estimado para atividade: ${profile.label}`);

  let label;
  if (score >= 70) label = 'Elevado';
  else if (score >= 45) label = 'Moderado';
  else label = 'Baixo';

  return { score, label, indicators };
}

// ── Justification builder ─────────────────────────────────────────────────────

function buildJustification(d, breakdown, total, profile) {
  const porte = d.porte || 'não informado';
  const capital = parseFloat(String(d.capital_social || '0').replace(',', '.'));
  const capitalFmt = isNaN(capital) ? 'não informado'
    : capital.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const abertura = d.abertura || 'não informada';
  const municipio = d.municipio || 'não informado';
  const uf = d.uf || '';

  return `Score de Resistência Física: ${total}/100. ` +
    `Empresa de porte "${porte}" com capital social de ${capitalFmt}, ` +
    `localizada em ${municipio}${uf ? '/' + uf : ''}, ` +
    `com data de abertura em ${abertura}. ` +
    `Atividade principal classificada como "${profile.label}", ` +
    `com resistência física estimada em ${profile.physical}/100 para este setor. ` +
    `Composição: construção/porte (${breakdown['Tipo de construção (porte/capital)']}), ` +
    `localização (${breakdown['Localização / isolamento']}), ` +
    `modernidade (${breakdown['Modernidade (ano de abertura)']}), ` +
    `perfil CNAE (${breakdown['Perfil de atividade (CNAE)']}). ` +
    `Este score é estimativo, baseado em dados públicos da Receita Federal e CNAE. ` +
    `Não substitui vistoria técnica presencial ou laudo de engenharia de segurança.`;
}

// ── CPF masking & hashing ─────────────────────────────────────────────────────

/**
 * Mask a CPF for display. Never exposes the full number.
 * @param {string} cpf
 * @returns {string}
 */
export function maskCPF(cpf) {
  if (!cpf) return '—';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return `***${clean.substring(3, 6)}.${clean.substring(6, 9)}-**`;
  }
  if (clean.length === 14) {
    return `${clean.substring(0, 2)}.***.***/****-${clean.substring(12)}`;
  }
  return cpf.substring(0, 3) + '***';
}

/**
 * Deterministic hash of a CPF for cross-reference without exposing the number.
 * @param {string} cpf
 * @returns {string}
 */
export function hashCPF(cpf) {
  const clean = cpf.replace(/\D/g, '');
  if (!clean) return '—';
  let hash = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, unsigned 32-bit
  }
  return hash.toString(16).toUpperCase().padStart(8, '0');
}
