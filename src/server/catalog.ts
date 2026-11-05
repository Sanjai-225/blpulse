import type { CatalogResponse, Series } from '../shared/types.js';

const disconnectedSnapshot: CatalogResponse = {
  series: [],
  lastRefreshed: null,
  lastChecked: null,
  sourceOnline: false,
  refreshing: false,
  error: 'The live-action catalog is waiting for a licensed data connection.',
  editorial: null,
};

/**
 * Live-action discovery is intentionally disconnected until TMDB access is configured.
 * This module does not read old database rows, request the prior reference site, or retain its records.
 */
export async function hydrateCatalog(): Promise<void> {
  // No legacy catalog data is hydrated or made available to visitors.
}

export function getCatalogSnapshot(): CatalogResponse {
  return { ...disconnectedSnapshot, series: [] };
}

export function catalogIsStale(): boolean {
  return false;
}

export async function refreshCatalog(): Promise<Series[]> {
  throw new Error('Live-action discovery is not connected. Add the TMDB token in secure project settings to enable it.');
}

export async function getSeriesById(_id: string): Promise<Series | undefined> {
  return undefined;
}
