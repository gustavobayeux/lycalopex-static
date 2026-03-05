# Lycalopex Changelog

## [2.0.0] — 2026-03-05 — ESG Intelligence & Map-Based Search

### 🎯 Major Features

#### 1. ESG Intelligence Engine (`js/esg-intelligence.js`)
Complete intelligence system for field agents combining environmental, social, governance, and corporate power analysis.

**Components:**
- **PEP Detection** — Identifies Politically Exposed Persons in shareholder structure via Portal da Transparência
- **Shareholder Graph Analysis** — Maps corporate ownership, detects economic groups, calculates concentration and influence scores
- **Composite ESG Risk Index** — 0-100 score combining:
  - Environmental (E): IBAMA embargoes + CNAE sector risk (40 pts max)
  - Social/Governance (S+G): CEIS + CNEP + PEP influence (35 pts max)
  - Corporate Power (P): Company size + shareholder concentration (25 pts max)
- **Field Action Plans** — Structured guidance with immediate actions, documents to request, authorities to notify, legal references

**APIs Integrated:**
- Portal da Transparência `/api-de-dados/peps` — PEP lookup
- Portal da Transparência `/api-de-dados/cnep` — Judicial punishments (Lei Anticorrupção)
- Portal da Transparência `/api-de-dados/ceis` — Administrative sanctions
- Portal da Transparência `/api-de-dados/acordos-leniencia` — Leniency agreements
- Brasil.IO socios-brasil — Extended shareholder data

#### 2. Map-Based Geographic Search (`index-map.html`, `js/app-map.js`, `js/map-search.js`)
Complete redesign of search UI for field-ready discovery.

**Features:**
- **Step-by-step search:** Region → State → City
- **Interactive region map** with color-coded regions
- **All 121 PR municipalities** from IBAMA embargo data
- **Companies sorted by ESG Risk Score** (not CNPJ input)
- **Breadcrumb navigation** showing current selection
- **Real-time filtering** by company type and ESG risk level
- **Responsive design** for mobile/tablet field use

**Geographic Coverage:**
- Norte: AC, AM, AP, PA, RO, RR, TO
- Nordeste: AL, BA, CE, MA, PB, PE, PI, RN, SE
- Centro-Oeste: DF, GO, MS, MT
- Sudeste: ES, MG, RJ, SP
- Sul: PR (121 cities), RS, SC

#### 3. COMPRASNET Integration (`js/comprasnet.js`)
Government procurement intelligence revealing company-government relationships.

**Features:**
- **Federal Contracts Lookup** — All contracts with federal agencies via Portal da Transparência
- **Federal Spending Tracking** — All payments/transfers to company
- **Procurement Risk Score** — 0-100 score based on:
  - Contract frequency and volume
  - Spending dependency on government
  - PEP connections (conflict of interest)
  - Agency concentration (captura regulatória risk)
- **Conflict of Interest Detection** — Flags PEP involvement in public contracts
- **Action Items** — Structured recommendations for field agents

**APIs Integrated:**
- Portal da Transparência `/api-de-dados/contratos/cpf-cnpj` — Federal contracts
- Portal da Transparência `/api-de-dados/despesas/documentos-por-favorecido` — Federal spending

### 📊 Data Enhancements

#### Extended Shareholder Data
- **Brasil.IO Integration** — Supplements CNPJ.ws QSA with:
  - Entry dates for shareholders
  - Country of origin (for foreign shareholders)
  - Qualification codes
  - Additional shareholder details

#### New Data Fields in Records
```javascript
// ESG Intelligence
esgScore                    // 0-100 composite score
esgLabel                    // 'Crítico', 'Alto', 'Moderado', 'Baixo'
esgFieldPriority            // Recommendation for field agents
esgComponents               // { environmental, socialGovernance, corporatePower }
esgActionItems              // Array of action items

// PEP & Shareholder Analysis
shareholderAnalysis         // { pepCount, pepShareholders, concentrationScore, influenceScore, economicGroupIndicators }
cnepStatus                  // Status in CNEP (Cadastro Nacional de Empresas Punidas)
cnepDetail                  // Details of CNEP entry
leniencyStatus              // Status of leniency agreements

// Field Action Plan
fieldActionPlan             // { immediateActions, documentsToRequest, authoritiesToNotify, legalReferences }

// Procurement Intelligence
procurementRiskScore        // 0-100 government contract risk
procurementRiskLabel        // Risk level
contractCount               // Number of federal contracts
contractTotalValue          // Total value of contracts
spendingCount               // Number of spending records
spendingTotalValue          // Total federal spending
```

### 🎨 UI/UX Improvements

#### New Map-Based Interface
- **Region buttons** with color coding and state lists
- **State selector** showing all states in region
- **City selector** with all municipalities
- **Breadcrumb navigation** for current selection
- **Results panel** showing filtered companies

#### Enhanced Detail Panel
- **ESG Risk Index display** with color-coded risk levels
- **Component breakdown** (E, S+G, P scores)
- **Action items** for field agents
- **Shareholder analysis** with PEP indicators
- **CNEP/Leniency status** prominently displayed
- **Structured field action plan** with:
  - Immediate actions
  - Documents to request
  - Authorities to notify
  - Legal references

#### Table Enhancements
- **New ESG Risk Index column** with PEP badge
- **Sorting by ESG score** (descending)
- **Filtering by ESG risk level**
- **Stats bar** showing ESG critical count and PEP alerts

#### CSV Export Expansion
New columns added:
- ESG Risk Index, Label, Field Priority
- ESG component scores (E, S+G, P)
- PEP count, shareholder concentration, influence score
- CNEP status, leniency agreements
- IBAMA embargo count
- Field action plan details (actions, documents, authorities, references)

### 🔧 API Enhancements

#### New API Functions

**api.js:**
```javascript
fetchSociosBrasilIO(cnpj)           // Extended shareholder data
checkPessoaJuridica(cnpj, apiKey)   // Company data from Portal da Transparência
```

**esg-intelligence.js:**
```javascript
checkPEP(name, apiKey)                          // PEP detection
checkCNEP(cnpj, apiKey)                         // CNEP lookup
checkLeniencyAgreement(cnpj, apiKey)            // Leniency status
analyzeShareholderGraph(socios, apiKey)         // Shareholder analysis
calcESGRiskIndex(record, analysis, cnep, leniency)  // ESG score
generateFieldActionPlan(record, esgIndex, analysis) // Action plan
runESGIntelligence(record, socios, apiKey)      // Full enrichment
```

**comprasnet.js:**
```javascript
fetchFederalContracts(cnpj, apiKey)             // Federal contracts
fetchFederalSpending(cnpj, apiKey)              // Federal spending
calcProcurementRiskScore(contracts, spending, pepCount)  // Procurement risk
generateProcurementIntelligence(...)            // Full procurement analysis
runProcurementIntelligence(record, pepCount, apiKey)    // Batch check
```

**map-search.js:**
```javascript
getStatesInRegion(region)           // States in region
getCitiesInState(state)              // Cities in state
getRegionForState(state)             // Region for state
getAllRegions()                      // All regions
buildRegionMap()                     // Region map HTML
buildStateSelector(region)           // State selector HTML
buildCitySelector(state)             // City selector HTML
```

### 📚 Documentation

#### New Files
- **ESG_INTELLIGENCE.md** — Complete guide to ESG Intelligence Engine
  - Component descriptions
  - Use cases for IBAMA agents and Greenpeace
  - API documentation
  - Roadmap for future versions

- **CHANGELOG.md** — This file

#### Updated Files
- **README.md** — Updated with new features
- **RESEARCH_APIS.md** — Added COMPRASNET and Brasil.IO details

### 🔐 Security & Privacy

- **No full CPFs displayed** — Only masked CPFs (e.g., `123.456.789-**`) and hashes
- **All APIs public** — No private credentials needed (except optional Portal da Transparência key)
- **HTTPS only** — All external API calls use HTTPS
- **Rate limiting** — Respects API rate limits (1 req/s for Portal da Transparência)
- **Timeout handling** — 8-10 second timeouts for API calls

### 🚀 Performance

- **Parallel API calls** — Contracts and spending fetched simultaneously
- **Sequential PEP checks** — Respects rate limits while checking multiple shareholders
- **Lazy loading** — Companies loaded only when city is selected
- **Efficient filtering** — Real-time filter/sort on client side

### 📱 Field Deployment

All features designed for IBAMA agents and Greenpeace activists in the field:

- **Mobile-friendly** — Responsive design for tablets/phones
- **Offline-capable** — Core data cached locally
- **Structured intelligence** — Clear action items for agents
- **Legal references** — All recommendations backed by law
- **Document checklists** — Know what to request on site
- **Authority contacts** — Know who to notify

### 🔄 Data Flow

```
User selects Region
  ↓
User selects State
  ↓
User selects City
  ↓
Load all CNPJs for city from IBAMA data
  ↓
For each CNPJ:
  ├─ Fetch basic data (Receita Federal)
  ├─ Extract shareholders (QSA)
  ├─ Fetch extended shareholder data (Brasil.IO)
  ├─ Run ESG Intelligence:
  │  ├─ Check PEP status
  │  ├─ Analyze shareholder graph
  │  ├─ Check CNEP/CEIS/Leniency
  │  └─ Calculate ESG Risk Index
  ├─ Run Procurement Intelligence:
  │  ├─ Fetch federal contracts
  │  ├─ Fetch federal spending
  │  └─ Calculate procurement risk
  └─ Generate field action plan
  ↓
Display results sorted by ESG Risk Score
```

### 🎯 Use Cases

#### IBAMA Agent in Field
1. Open Lycalopex on tablet
2. Select Region → State → City
3. View all companies sorted by ESG Risk
4. Click on "Crítico" company
5. Follow "Ações Imediatas" checklist
6. Use "Documentos a Solicitar" as field checklist
7. Notify authorities listed in "Autoridades a Notificar"
8. Reference laws in "Referências Legais"

#### Greenpeace Campaign Research
1. Load 50+ CNPJs from campaign research
2. Sort by ESG Risk Index (descending)
3. Filter by "Crítico" + "PEPs detectados"
4. Export CSV with full shareholder graph
5. Cross-reference PEPs with government contracts
6. Publish findings with corporate structure visualization

#### NGO Monitoring Dashboard
1. Deploy on internal server
2. Configure Portal da Transparência API key
3. Set up daily CNPJ batch imports
4. Create alerts for ESG score changes
5. Track PEP updates monthly
6. Generate quarterly compliance reports

### 🐛 Bug Fixes

- Fixed city search not returning results (now uses geographic hierarchy)
- Fixed CNPJ input not working (replaced with map-based search)
- Fixed missing ESG column in table
- Fixed detail panel colspan for new columns

### 📝 Breaking Changes

- **Removed CNPJ input field** — Now uses map-based geographic search
- **Removed city search by name** — Now uses structured region/state/city selection
- **Changed default sort** — Now sorts by ESG Risk Score instead of vulnerability

### 🔮 Future Roadmap

#### v2.1
- [ ] Desmatamento data integration (PRODES/MapBiomas)
- [ ] Supply chain analysis (suppliers/customers)
- [ ] Real-time alerts for status changes
- [ ] Email notifications for PEP updates

#### v2.2
- [ ] Network visualization (shareholder graph)
- [ ] COMPRASNET state/municipal contracts
- [ ] Political donations tracking (TSE)
- [ ] Media monitoring integration

#### v3.0
- [ ] REST API for third-party integration
- [ ] Mobile app (React Native)
- [ ] Blockchain audit trail
- [ ] Machine learning risk prediction

### 📦 Dependencies

**New:**
- None (all APIs are public/free)

**Updated:**
- fetch API (browser native)
- ES6 modules (no build step needed)

### 🙏 Credits

Developed for:
- 🇧🇷 IBAMA — Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis
- 🌍 Greenpeace Brasil
- 🌱 Environmental activists and researchers

Data sources:
- Receita Federal (CNPJ.ws)
- Brasil.IO (Shareholder data)
- Portal da Transparência (PEP, CNEP, CEIS, Contracts, Spending)
- IBAMA (Environmental embargoes)
- IBGE (Municipalities)

### 📄 License

MIT License — See LICENSE file

### 🔗 Links

- **GitHub:** https://github.com/gustavobayeux/lycalopex-static
- **Live Demo:** https://lycalopex.campo.ibama.gov.br (when deployed)
- **Documentation:** See ESG_INTELLIGENCE.md and README.md
- **Issues:** https://github.com/gustavobayeux/lycalopex-static/issues

---

**Version:** 2.0.0  
**Release Date:** March 5, 2026  
**Status:** Production Ready ✅
