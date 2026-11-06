// Spotify: sign in with PKCE (no server, no secret), read what's playing,
// and send play / pause / next / previous. Controls need Spotify Premium.

import { SPOTIFY_CLIENT_ID } from './config.js';

const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
const STORE = 'ws.spotify';
const API = 'https://api.spotify.com/v1';
const redirectUri = () => location.origin + location.pathname;

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
};
const save = (v) => {
  try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {}
};

let tokens = load();

export const isConfigured = () => Boolean(SPOTIFY_CLIENT_ID);
export const isConnected = () => Boolean(tokens.refresh);

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function connect() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem('ws.verifier', verifier);
  try { localStorage.setItem('ws.verifier', verifier); } catch {}
  const q = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  location.assign(`https://accounts.spotify.com/authorize?${q}`);
}

export function disconnect() {
  tokens = {};
  save(tokens);
}

async function tokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...body }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const t = await res.json();
  tokens = {
    access: t.access_token,
    refresh: t.refresh_token || tokens.refresh,
    expires: Date.now() + (t.expires_in - 60) * 1000,
  };
  save(tokens);
}

// Call once on load: finishes the sign-in when Spotify sends us back.
export async function handleRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code && !params.get('error')) return;
  history.replaceState(null, '', redirectUri());
  if (!code) return;
  const verifier = sessionStorage.getItem('ws.verifier') || localStorage.getItem('ws.verifier');
  if (!verifier) return;
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });
  sessionStorage.removeItem('ws.verifier');
  try { localStorage.removeItem('ws.verifier'); } catch {}
}

async function accessToken() {
  if (!tokens.refresh) return null;
  if (!tokens.access || Date.now() > tokens.expires) {
    await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
  }
  return tokens.access;
}

async function api(path, method = 'GET') {
  const token = await accessToken();
  if (!token) return { status: 0 };
  let res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    tokens.access = null;
    const retry = await accessToken();
    res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${retry}` } });
  }
  return res;
}

// What's playing right now, or null.
export async function nowPlaying() {
  const res = await api('/me/player/currently-playing');
  if (res.status !== 200) return null;
  const d = await res.json();
  const item = d.item;
  if (!item) return null;
  const art = (item.album?.images || item.images || []).slice().sort((a, b) => a.width - b.width);
  return {
    id: item.id,
    title: item.name,
    artist: (item.artists || []).map((a) => a.name).join(', ') || item.show?.name || '',
    art: (art.find((i) => i.width >= 64) || art[0] || {}).url || '',
    playing: d.is_playing,
    progress: d.progress_ms || 0,
    duration: item.duration_ms || 0,
    at: Date.now(),
  };
}

// Returns '' on success, or a short reason to show.
async function control(path, method) {
  const res = await api(path, method);
  if (res.ok || res.status === 204) return '';
  if (res.status === 404) return 'Open Spotify and start a song first';
  if (res.status === 403) return 'Controls need Spotify Premium';
  return 'Spotify didn’t respond';
}

export const play = () => control('/me/player/play', 'PUT');
export const pause = () => control('/me/player/pause', 'PUT');
export const next = () => control('/me/player/next', 'POST');
export const previous = () => control('/me/player/previous', 'POST');
