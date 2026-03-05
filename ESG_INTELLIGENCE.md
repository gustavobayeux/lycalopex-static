# ESG Intelligence Engine — Lycalopex v2.0

> **Ferramenta de Inteligência ESG para Agentes de Campo IBAMA e Ativistas Greenpeace**
>
> Identifique quem está realmente por trás das operações que danificam o clima no Brasil.

---

## O que é o ESG Intelligence?

O **ESG Intelligence** é um novo módulo integrado ao Lycalopex que enriquece a análise de empresas agro-industriais com:

1. **Detecção de PEPs** — Identifica Pessoas Politicamente Expostas no quadro societário
2. **Mapa de Sócios** — Analisa estrutura corporativa, concentração e grupos econômicos
3. **Score ESG Composto** — Combina infrações ambientais reais + sanções + influência política
4. **Plano de Ação para Campo** — Instruções estruturadas para agentes IBAMA/Greenpeace

---

## Componentes do ESG Intelligence

### 1. Detecção de PEP (Pessoas Politicamente Expostas)

**Objetivo:** Identificar se sócios ou administradores são/foram agentes públicos com poder de influência.

**Dados:** Portal da Transparência `/api-de-dados/peps` (busca por nome)

**Resultado:**
- ✅ Nome do PEP
- ✅ Função pública exercida
- ✅ Órgão/entidade
- ✅ Período de exercício

**Implicação para Campo:**
- PEPs podem influenciar decisões de licenciamento ambiental
- Potencial conflito de interesses em contratos públicos
- Maior risco de captura regulatória

---

### 2. Análise de Quadro Societário

**Objetivo:** Mapear estrutura de propriedade, identificar grupos econômicos e concentração de poder.

**Dados Utilizados:**
- **publica.cnpj.ws** — QSA (Quadro Societário) já integrado
- **Brasil.IO socios-brasil** — Dados complementares (país de origem, datas de entrada)
- **Detecção de padrões** — Sócios jurídicos, cargos executivos, concentração

**Indicadores Calculados:**

| Indicador | Significado | Campo |
|-----------|-------------|-------|
| **PEP Count** | Número de PEPs no quadro | Risco político |
| **Concentration Score** | 0–100: quanto menor # sócios, maior concentração | Risco de captura |
| **Influence Score** | 0–100: PEPs + executivos + sócios jurídicos | Poder corporativo |
| **Economic Group Indicators** | Padrões de holdings/grupos | Estrutura corporativa |

**Exemplo:**
```
Empresa: AGRO BRASIL S.A.
├─ Sócio 1: João Silva (PEP) — Presidente
├─ Sócio 2: Holding Agro Ltda (jurídica)
└─ Sócio 3: Maria Santos — Diretora

Resultado:
  PEPs: 1 ⚠️
  Concentração: 67/100 (alta)
  Influência: 72/100 (muito influente)
  Indicadores: "Possível grupo econômico com estrutura de holding"
```

---

### 3. ESG Risk Index (0–100)

**Objetivo:** Score composto que combina risco ambiental REAL + sanções + poder corporativo.

**Fórmula:**

```
ESG Risk Index = E (40 pts) + S+G (35 pts) + P (25 pts)

E (Ambiental):
  - IBAMA embargoes: até 25 pts (real, verificado)
  - CNAE sector risk: até 15 pts (estimado)

S+G (Social/Governança):
  - CEIS (sanctions): até 12 pts
  - CNEP (judicial punishment): até 15 pts
  - Leniency agreements: até 8 pts
  - PEP influence: até 10 pts

P (Poder Corporativo):
  - Porte da empresa: até 10 pts
  - Concentração societária: até 10 pts
  - Capital social: até 5 pts
```

**Interpretação:**

| Score | Label | Prioridade de Campo |
|-------|-------|---------------------|
| 70–100 | **Crítico** | 🚨 MÁXIMA — Ação imediata |
| 50–69 | **Alto** | 🟠 Alta — Próxima operação |
| 30–49 | **Moderado** | 🟡 Monitoramento contínuo |
| 0–29 | **Baixo** | ✅ Monitoramento periódico |

---

### 4. Plano de Ação para Campo

**Objetivo:** Guia estruturado para agentes IBAMA/Greenpeace operando em campo.

**Seções:**

#### 📋 Ações Imediatas
Baseadas em achados específicos (IBAMA embargoes, PEPs, CEIS, etc.)

**Exemplo:**
```
🔴 IBAMA: 3 embargo(s) ativo(s)
   → Verificar se embargo ainda está em vigor (consultar TAD no SIFISC)
   → Fotografar e georreferenciar a área embargada
   → Verificar se há atividade em andamento (infração continuada)

🟠 PEP: 1 pessoa(s) politicamente exposta(s)
   → Mapear relações entre sócio PEP e contratos públicos ambientais
   → Solicitar Declaração de Bens e Conflito de Interesses
```

#### 📋 Documentos a Solicitar
Checklist de documentação para verificação in loco:

- Licença Ambiental de Operação (LO) vigente
- Plano de Recuperação de Área Degradada (PRAD)
- Outorga de uso de recursos hídricos (ANA/SEMA)
- Certificado de Regularidade do CAR
- Relatório de monitoramento de efluentes
- CNPJ e Contrato Social atualizado
- Alvará de funcionamento municipal

#### 📞 Autoridades a Notificar
Órgãos competentes por tipo de infração:

- **IBAMA** — Embargoes ambientais, fauna/flora
- **CGU** — Conflito de interesses (PEPs)
- **MPF** — Crimes ambientais, corrupção
- **SEMA/IAP** — Licenciamento estadual

#### ⚖️ Referências Legais
Leis e decretos aplicáveis:

- Lei 9.605/98 (Lei de Crimes Ambientais)
- Lei 12.651/2012 (Código Florestal)
- Lei 12.846/2013 (Lei Anticorrupção)
- Lei 12.813/2013 (Conflito de Interesses)
- Decreto 6.514/2008 (Infrações ambientais)

---

## Como Usar o ESG Intelligence

### 1. Configurar Chave de API (Recomendado)

Para habilitar verificações em tempo real de **CNEP**, **CEIS**, **PEP**, configure a chave gratuita do Portal da Transparência:

**Passo 1:** Obtenha a chave em https://portaldatransparencia.gov.br/api-de-dados

**Passo 2:** Abra `index.html` e configure:

```html
<script>
  window.__LYCALOPEX_API_KEY__ = 'sua-chave-aqui';
</script>
```

**Passo 3:** Salve e recarregue a página.

### 2. Consultar uma Empresa

1. Cole o CNPJ no campo de entrada
2. Clique em "Consultar CNPJs"
3. Aguarde o carregamento (inclui verificações PEP, CNEP, CEIS)
4. Clique na linha para expandir o painel de detalhes

### 3. Analisar o Painel ESG Intelligence

No painel de detalhes, procure por:

- **ESG Risk Index** — Score composto (0–100)
- **Prioridade de Campo** — Recomendação de ação
- **Componentes ESG** — Breakdown ambiental/social/corporativo
- **Ações Imediatas** — Tarefas para agente de campo
- **Análise de Quadro Societário** — PEPs, concentração, grupos
- **Plano de Ação Estruturado** — Documentos, autoridades, leis

### 4. Exportar Dados para Operação

Clique em **"Exportar CSV"** para gerar relatório com:

- ESG Risk Index de cada empresa
- Componentes ESG detalhados
- PEPs detectados
- Plano de ação estruturado
- Todas as fontes de dados

---

## APIs Utilizadas

### Portal da Transparência (CGU)

| Endpoint | Autenticação | Limite | Uso |
|----------|--------------|--------|-----|
| `/api-de-dados/peps` | Chave gratuita | ~1 req/s | Detecção de PEPs |
| `/api-de-dados/cnep` | Chave gratuita | ~1 req/s | Empresas punidas (Lei Anticorrupção) |
| `/api-de-dados/ceis` | Chave gratuita | ~1 req/s | Sanções administrativas |
| `/api-de-dados/acordos-leniencia` | Chave gratuita | ~1 req/s | Acordos de leniência |
| `/api-de-dados/pessoa-juridica` | Chave gratuita | ~1 req/s | Histórico de contratos públicos |

### Brasil.IO

| Endpoint | Autenticação | Limite | Uso |
|----------|--------------|--------|-----|
| `/api/dataset/socios-brasil/socios/` | Nenhuma | ~1 req/s | Dados complementares de sócios |

### Receita Federal (publica.cnpj.ws)

| Endpoint | Autenticação | Limite | Uso |
|----------|--------------|--------|-----|
| `/cnpj/{cnpj}` | Nenhuma | ~1 req/s | Dados básicos + QSA |

### IBAMA (local)

| Dados | Autenticação | Uso |
|-------|--------------|-----|
| `data/ibama-demo.json` | Nenhuma | Embargoes ambientais (PR) |

---

## Arquitetura Técnica

### Novos Arquivos

```
js/esg-intelligence.js    ← Módulo principal (PEP, shareholder graph, ESG index)
```

### Arquivos Modificados

```
js/api.js                 ← +fetchSociosBrasilIO(), +checkPessoaJuridica()
js/store.js               ← +runESGIntelligence() na buildRecord()
js/ui.js                  ← +ESG panel no detail view, +ESG column na tabela
index.html                ← +ESG Risk Index column, +API key config
```

### Fluxo de Dados

```
1. User enters CNPJ
   ↓
2. fetchCNPJ() — Receita Federal data
   ↓
3. extractSocios() — Parse QSA
   ↓
4. fetchSociosBrasilIO() — Complement with Brasil.IO
   ↓
5. runESGIntelligence()
   ├─ checkPEP() × N sócios → PEP detection
   ├─ analyzeShareholderGraph() → Concentration, influence
   ├─ checkCNEP() → Judicial sanctions
   ├─ checkLeniencyAgreement() → Leniency status
   └─ calcESGRiskIndex() → Composite score
   ↓
6. generateFieldActionPlan() → Structured guidance
   ↓
7. Render in detail panel + export to CSV
```

---

## Casos de Uso

### Caso 1: IBAMA Agent in the Field

**Cenário:** Agent in Pará receives intelligence that a company may be operating in an embargoed area.

**Ação:**
1. Open Lycalopex on mobile/tablet
2. Enter company CNPJ
3. Check ESG Risk Index — if "Crítico", prioritize
4. Expand "Plano de Ação para Campo"
5. Follow immediate actions checklist
6. Document findings with photos/GPS
7. Notify IBAMA HQ via WhatsApp/email with structured report

**Output:** Structured evidence for enforcement action

---

### Caso 2: Greenpeace Campaign Research

**Cenário:** Greenpeace researching corporate networks behind deforestation in Mato Grosso.

**Ação:**
1. Load list of 50+ CNPJs from campaign research
2. Paste into Lycalopex
3. Sort by ESG Risk Index (descending)
4. Filter by "Crítico" + "PEPs detectados"
5. Export CSV with full shareholder graph
6. Cross-reference PEPs with government contracts (Portal da Transparência)
7. Publish findings with corporate structure visualization

**Output:** Investigative report with corporate power mapping

---

### Caso 3: NGO Monitoring Dashboard

**Cenário:** Environmental NGO monitoring 200+ companies in real-time.

**Ação:**
1. Deploy Lycalopex on internal server
2. Configure Portal da Transparência API key
3. Set up daily CNPJ batch imports
4. Create alerts for ESG score changes
5. Track PEP updates monthly
6. Generate quarterly compliance reports

**Output:** Continuous monitoring system

---

## Limitações e Considerações

### Dados Públicos Apenas
- Nenhum CPF é exibido na íntegra (apenas máscara + hash)
- Todas as APIs usadas são públicas e gratuitas
- Sem autenticação de usuário necessária

### Cobertura Geográfica
- IBAMA embargoes: Foco em PR (121 municípios no demo)
- PEP data: Nacional (Portal da Transparência)
- Shareholder data: Nacional (Brasil.IO + Receita Federal)

### Atualização de Dados
- IBAMA embargoes: Atualizado conforme TADs são registrados
- PEP: Atualizado diariamente pelo Portal da Transparência
- Socios: Atualizado conforme CNPJ.ws/Brasil.IO sincronizam com Receita Federal

### Acurácia
- **Environmental (E):** Baseado em dados reais do IBAMA ✅
- **Social/Governance (S+G):** Baseado em sanções públicas ✅
- **Corporate Power (P):** Estimado a partir de porte + concentração ⚠️

---

## Roadmap Futuro

### v2.1
- [ ] Integração com dados de desmatamento (PRODES/MapBiomas)
- [ ] Análise de cadeia de suprimentos (fornecedores/clientes)
- [ ] Alertas em tempo real para mudanças de status

### v2.2
- [ ] Visualização de rede de sócios (graph.js)
- [ ] Integração com dados de contratação pública (COMPRASNET)
- [ ] Análise de doações políticas (TSE)

### v3.0
- [ ] API REST para integração com sistemas terceiros
- [ ] Mobile app nativo (React Native)
- [ ] Blockchain-based audit trail

---

## Contato & Suporte

**Desenvolvido para:**
- 🇧🇷 IBAMA — Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis
- 🌍 Greenpeace Brasil
- 🌱 Ativistas ambientais e pesquisadores

**Código aberto:** MIT License
**Repositório:** https://github.com/gustavobayeux/lycalopex-static

**Contribuições:** Pull requests bem-vindas!

---

## Referências Legais

- Lei 9.605/1998 — Lei de Crimes Ambientais
- Lei 12.651/2012 — Código Florestal Brasileiro
- Lei 12.846/2013 — Lei Anticorrupção
- Lei 12.813/2013 — Lei de Conflito de Interesses
- Decreto 6.514/2008 — Infrações Ambientais
- Lei 9.433/1997 — Política Nacional de Recursos Hídricos
- Resolução COAF 36/2021 — PEP e Lavagem de Dinheiro

---

**Última atualização:** Março 2026
**Versão:** 2.0 (ESG Intelligence)
**Status:** ✅ Produção
