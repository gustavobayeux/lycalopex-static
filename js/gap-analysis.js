/**
 * gap-analysis.js — Security Gap Analysis for Lycalopex
 *
 * Identifies security and compliance gaps for business CNPJs based on:
 *   1. Vulnerability score vs Resistance score
 *   2. Missing security infrastructure (from OSM)
 *   3. Environmental and corruption history (from IBAMA, CEIS)
 *   4. Company size and age risk factors
 */

'use strict';

/**
 * Perform security gap analysis for a company.
 * @param {object} record - Full company record
 * @returns {Array<{type: string, severity: string, title: string, description: string, recommendation: string}>}
 */
export function analyzeSecurityGaps(record) {
  const gaps = [];

  // 1. High Vulnerability / Low Resistance Gap
  if (record.vulnerabilityScore > 70 && record.resistanceScore < 40) {
    gaps.push({
      type: 'physical',
      severity: 'high',
      title: 'Alta Vulnerabilidade Física',
      description: `A estrutura apresenta score de vulnerabilidade elevado (${record.vulnerabilityScore}) com baixa resistência física estimada (${record.resistanceScore}).`,
      recommendation: 'Recomenda-se auditoria presencial de segurança patrimonial e reforço em barreiras físicas.'
    });
  }

  // 2. OSM Security Infrastructure Gaps
  if (record.urbanExploringIndicators) {
    const indicators = record.urbanExploringIndicators;
    
    if (indicators.some(i => i.includes('Sem barreiras físicas'))) {
      gaps.push({
        type: 'perimeter',
        severity: 'high',
        title: 'Perímetro Desprotegido',
        description: 'Não foram detectadas barreiras físicas (muros, cercas) nos dados de infraestrutura pública.',
        recommendation: 'Instalação de cercamento perimetral regulamentado e monitoramento de acessos.'
      });
    }

    if (indicators.some(i => i.includes('Sem câmeras de vigilância'))) {
      gaps.push({
        type: 'surveillance',
        severity: 'medium',
        title: 'Ausência de Monitoramento Visual',
        description: 'Nenhuma infraestrutura de CFTV/Vigilância detectada nos arredores da instalação.',
        recommendation: 'Implementação de sistema de monitoramento IP com cobertura 360º do perímetro.'
      });
    }

    if (record.urbanExploringScore > 60) {
      gaps.push({
        type: 'access',
        severity: 'medium',
        title: 'Alta Suscetibilidade a Intrusão',
        description: `Score de acesso não-autorizado elevado (${record.urbanExploringScore}). Estrutura isolada ou com múltiplos pontos de entrada.`,
        recommendation: 'Controle rigoroso de acessos e instalação de sensores de intrusão.'
      });
    }
  }

  // 3. Compliance & History Gaps
  if (record.ibamaStatus === 'Alerta Ambiental') {
    gaps.push({
      type: 'compliance',
      severity: 'critical',
      title: 'Histórico de Infrações Ambientais',
      description: record.ibamaDetail,
      recommendation: 'Regularização imediata junto aos órgãos ambientais e implementação de sistema de gestão de compliance (ESG).'
    });
  }

  if (record.antiCorruptionStatus === 'Alerta') {
    gaps.push({
      type: 'compliance',
      severity: 'critical',
      title: 'Alerta de Sanção Administrativa (CEIS)',
      description: record.antiCorruptionDetail,
      recommendation: 'Revisão de governança corporativa e auditoria de integridade.'
    });
  }

  // 4. Age and Size Gaps
  const yearMatch = (record.abertura || '').match(/(\d{4})/);
  if (yearMatch) {
    const age = new Date().getFullYear() - parseInt(yearMatch[1], 10);
    if (age > 30) {
      gaps.push({
        type: 'infrastructure',
        severity: 'medium',
        title: 'Infraestrutura Obsoleta',
        description: `Estrutura com mais de ${age} anos. Risco aumentado de falhas elétricas e de sistemas de segurança.`,
        recommendation: 'Modernização de sistemas elétricos, hidráulicos e de combate a incêndio.'
      });
    }
  }

  return gaps;
}
