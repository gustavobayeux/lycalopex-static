/**
 * app.js — Lycalopex entry point
 *
 * Bootstraps the application:
 *   1. Initializes UI event listeners
 *   2. Subscribes to state changes
 *   3. Renders initial empty state
 */

'use strict';

import { subscribe } from './store.js';
import { initUI, render } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI bindings
  initUI();

  // Subscribe to state changes and re-render
  subscribe(state => render(state));

  // Initial render (empty state)
  render({
    records: [],
    filtered: [],
    loading: false,
    loadingMessage: '',
    error: null,
    availableCities: [],
    availableTypes: [],
    totalLoaded: 0,
    filters: { city: '', type: '', minScore: 0, maxScore: 100, antiCorruption: '' },
    sort: { field: 'vulnerability', dir: 'desc' },
  });

  // Keyboard shortcut: Ctrl+E → export
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      document.getElementById('btn-export')?.click();
    }
  });
});
