/**
 * map-search.js — Interactive Brazilian map with step-by-step search
 *
 * UI Flow: Region → State → City → Load all companies for that city
 * Displays all companies (infractors or not) sorted by ESG Risk Score
 */

'use strict';

// Brazilian geographic hierarchy
export const BRASIL_REGIONS = {
  'Norte': {
    states: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
    cities: {
      'AC': ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira'],
      'AM': ['Manaus', 'Itacoatiara', 'Parintins'],
      'AP': ['Macapá', 'Santana'],
      'PA': ['Belém', 'Ananindeua', 'Marabá', 'Parauapebas', 'Castanhal'],
      'RO': ['Porto Velho', 'Ariquemes', 'Ji-Paraná'],
      'RR': ['Boa Vista', 'Rorainópolis'],
      'TO': ['Palmas', 'Araguaína', 'Gurupi'],
    }
  },
  'Nordeste': {
    states: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
    cities: {
      'AL': ['Maceió', 'Rio Largo', 'Arapiraca'],
      'BA': ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Ilhéus', 'Jequié'],
      'CE': ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú'],
      'MA': ['São Luís', 'Imperatriz', 'Caxias'],
      'PB': ['João Pessoa', 'Campina Grande', 'Patos'],
      'PE': ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru'],
      'PI': ['Teresina', 'Parnaíba', 'Picos'],
      'RN': ['Natal', 'Mossoró', 'Parnamirim'],
      'SE': ['Aracaju', 'Nossa Senhora do Socorro'],
    }
  },
  'Centro-Oeste': {
    states: ['DF', 'GO', 'MS', 'MT'],
    cities: {
      'DF': ['Brasília'],
      'GO': ['Goiânia', 'Anápolis', 'Aparecida de Goiânia', 'Rio Verde'],
      'MS': ['Campo Grande', 'Dourados', 'Três Lagoas'],
      'MT': ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra'],
    }
  },
  'Sudeste': {
    states: ['ES', 'MG', 'RJ', 'SP'],
    cities: {
      'ES': ['Vitória', 'Vila Velha', 'Serra', 'Cariacica'],
      'MG': ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Montes Claros', 'Governador Valadares'],
      'RJ': ['Rio de Janeiro', 'Niterói', 'Duque de Caxias', 'São Gonçalo', 'Macaé'],
      'SP': ['São Paulo', 'Campinas', 'Santos', 'Sorocaba', 'Ribeirão Preto', 'Piracicaba', 'Araraquara'],
    }
  },
  'Sul': {
    states: ['PR', 'RS', 'SC'],
    cities: {
      'PR': ['Adrianópolis', 'Almirante Tamandaré', 'Alto Paraíso', 'Altônia', 'Ampére', 'Andirá', 'Apucarana', 'Araucária', 'Balsa Nova', 'Bela Vista do Paraíso', 'Bituruna', 'Cafezal do Sul', 'Campina do Simão', 'Capanema', 'Carambeí', 'Cascavel', 'Castro', 'Centenário do Sul', 'Chopinzinho', 'Cianorte', 'Colombo', 'Colorado', 'Cornélio Procópio', 'Coronel Domingos Soares', 'Cruz Machado', 'Curitiba', 'Céu Azul', 'Diamante do Norte', 'Douradina', 'Engenheiro Beltrão', 'Espigão Alto do Iguaçu', 'Fazenda Rio Grande', 'Florestópolis', 'Formosa do Oeste', 'Foz do Iguaçu', 'Foz do Jordão', 'Francisco Beltrão', 'General Carneiro', 'Guarapuava', 'Guaraqueçaba', 'Guaratuba', 'Guaíra', 'Ibiporã', 'Icaraíma', 'Iguaraçu', 'Inácio Martins', 'Ipiranga', 'Iporã', 'Irati', 'Itaipulândia', 'Itambaracá', 'Ivaí', 'Jaguapitã', 'Jaguariaíva', 'Jesuítas', 'Lapa', 'Loanda', 'Londrina', 'Mallet', 'Mandaguari', 'Mandirituba', 'Mangueirinha', 'Marechal Cândido Rondon', 'Marialva', 'Mariluz', 'Maringá', 'Matinhos', 'Medianeira', 'Missal', 'Morretes', 'Nova Laranjeiras', 'Ortigueira', 'Palmas', 'Palmeira', 'Palotina', 'Paranaguá', 'Paranavaí', 'Paula Freitas', 'Paulo Frontin', 'Pinhais', 'Pinhão', 'Piraquara', 'Piraí do Sul', 'Pitanga', 'Planalto', 'Ponta Grossa', 'Pontal do Paraná', 'Porecatu', 'Porto Rico', 'Porto Vitória', 'Presidente Castelo Branco', 'Primeiro de Maio', 'Prudentópolis', 'Pérola D\'Oeste', 'Quatiguá', 'Quedas do Iguaçu', 'Ramilândia', 'Realeza', 'Rebouças', 'Rio Azul', 'Rio Branco do Sul', 'Rio Negro', 'Santa Cruz de Monte Castelo', 'Santa Helena', 'Santa Terezinha de Itaipu', 'Sengés', 'Sertaneja', 'Sertanópolis', 'Sulina', 'São Jorge do Ivaí', 'São José dos Pinhais', 'São Mateus do Sul', 'São Miguel do Iguaçu', 'Tamarana', 'Terra Roxa', 'Tibagi', 'Toledo', 'Tuneiras do Oeste', 'Turvo', 'Umuarama', 'União da Vitória'],
      'RS': ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Santa Maria', 'Novo Hamburgo'],
      'SC': ['Florianópolis', 'Joinville', 'Blumenau', 'Itajaí', 'Chapecó'],
    }
  }
};

// State codes to full names
export const STATE_NAMES = {
  'AC': 'Acre',
  'AL': 'Alagoas',
  'AP': 'Amapá',
  'AM': 'Amazonas',
  'BA': 'Bahia',
  'CE': 'Ceará',
  'DF': 'Distrito Federal',
  'ES': 'Espírito Santo',
  'GO': 'Goiás',
  'MA': 'Maranhão',
  'MT': 'Mato Grosso',
  'MS': 'Mato Grosso do Sul',
  'MG': 'Minas Gerais',
  'PA': 'Pará',
  'PB': 'Paraíba',
  'PR': 'Paraná',
  'PE': 'Pernambuco',
  'PI': 'Piauí',
  'RJ': 'Rio de Janeiro',
  'RN': 'Rio Grande do Norte',
  'RS': 'Rio Grande do Sul',
  'RO': 'Rondônia',
  'RR': 'Roraima',
  'SC': 'Santa Catarina',
  'SP': 'São Paulo',
  'SE': 'Sergipe',
  'TO': 'Tocantins',
};

// Approximate coordinates for map visualization (lat, lng)
export const REGION_COORDS = {
  'Norte': { lat: -5.5, lng: -62.5 },
  'Nordeste': { lat: -7.5, lng: -37.5 },
  'Centro-Oeste': { lat: -15.5, lng: -55.5 },
  'Sudeste': { lat: -21.5, lng: -45.5 },
  'Sul': { lat: -28.5, lng: -51.5 },
};

export const STATE_COORDS = {
  'AC': { lat: -9.0, lng: -67.5 },
  'AL': { lat: -9.5, lng: -36.5 },
  'AP': { lat: 1.5, lng: -52.0 },
  'AM': { lat: -3.5, lng: -65.0 },
  'BA': { lat: -12.5, lng: -41.5 },
  'CE': { lat: -5.5, lng: -39.0 },
  'DF': { lat: -15.8, lng: -47.9 },
  'ES': { lat: -20.0, lng: -40.5 },
  'GO': { lat: -15.5, lng: -49.5 },
  'MA': { lat: -5.0, lng: -45.0 },
  'MT': { lat: -13.5, lng: -55.5 },
  'MS': { lat: -20.0, lng: -55.5 },
  'MG': { lat: -19.0, lng: -44.5 },
  'PA': { lat: -3.5, lng: -52.5 },
  'PB': { lat: -7.0, lng: -35.5 },
  'PR': { lat: -24.5, lng: -51.5 },
  'PE': { lat: -8.5, lng: -36.0 },
  'PI': { lat: -6.5, lng: -42.0 },
  'RJ': { lat: -22.5, lng: -43.0 },
  'RN': { lat: -5.5, lng: -36.5 },
  'RS': { lat: -30.0, lng: -53.5 },
  'RO': { lat: -10.5, lng: -62.0 },
  'RR': { lat: 2.5, lng: -61.0 },
  'SC': { lat: -27.5, lng: -49.5 },
  'SP': { lat: -23.5, lng: -46.5 },
  'SE': { lat: -10.5, lng: -37.0 },
  'TO': { lat: -10.0, lng: -48.0 },
};

/**
 * Get all states in a region
 */
export function getStatesInRegion(region) {
  return BRASIL_REGIONS[region]?.states || [];
}

/**
 * Get all cities in a state
 */
export function getCitiesInState(state) {
  let cities = [];
  for (const region of Object.values(BRASIL_REGIONS)) {
    if (region.cities[state]) {
      cities = region.cities[state];
      break;
    }
  }
  return cities.sort();
}

/**
 * Get the region for a given state
 */
export function getRegionForState(state) {
  for (const [region, data] of Object.entries(BRASIL_REGIONS)) {
    if (data.states.includes(state)) {
      return region;
    }
  }
  return null;
}

/**
 * Get all regions
 */
export function getAllRegions() {
  return Object.keys(BRASIL_REGIONS).sort();
}

/**
 * Build map SVG representation (simplified)
 * Returns HTML for a clickable region map
 */
export function buildRegionMap() {
  const regions = getAllRegions();
  const colors = {
    'Norte': '#FF6B6B',
    'Nordeste': '#4ECDC4',
    'Centro-Oeste': '#45B7D1',
    'Sudeste': '#FFA07A',
    'Sul': '#98D8C8',
  };

  return `
    <div class="region-map">
      <div class="map-title">Selecione uma Região</div>
      <div class="region-buttons">
        ${regions.map(region => `
          <button class="region-btn" data-region="${region}" style="background-color: ${colors[region]};">
            <span class="region-name">${region}</span>
            <span class="region-states">${getStatesInRegion(region).join(', ')}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Build state selector for a region
 */
export function buildStateSelector(region) {
  const states = getStatesInRegion(region);
  return `
    <div class="state-selector">
      <div class="selector-title">Estados em ${region}</div>
      <div class="state-buttons">
        ${states.map(state => `
          <button class="state-btn" data-state="${state}" title="${STATE_NAMES[state]}">
            ${state}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Build city selector for a state
 */
export function buildCitySelector(state) {
  const cities = getCitiesInState(state);
  const stateName = STATE_NAMES[state];
  return `
    <div class="city-selector">
      <div class="selector-title">Cidades em ${stateName}</div>
      <div class="city-buttons">
        ${cities.map(city => `
          <button class="city-btn" data-city="${city}" data-state="${state}">
            ${city}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}
