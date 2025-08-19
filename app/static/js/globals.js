// static/js/globals.js

export const GEO_ENABLED = false; // toggle to true when ready

export const GAME_DATA = {
  gameId: window.gameId || 0,
  teamId: window.teamId || 0,
  locations: window.locations || [],
  nextIndex: window.nextIndex || 0
};

export const locationImageUrls = GAME_DATA.locations.map(l => l.image_url).filter(Boolean);

export const bounds = window.bounds || [];
