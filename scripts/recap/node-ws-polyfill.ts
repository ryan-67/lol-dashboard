/**
 * Node < 22 has no global WebSocket. Supabase realtime throws on createClient unless
 * `ws` is installed as the global or passed as `realtime.transport`.
 * Import this module first in Node scripts that may pull in browser supabase clients.
 */
import WebSocket from 'ws'

const g = globalThis as typeof globalThis & { WebSocket?: typeof WebSocket }

if (typeof g.WebSocket === 'undefined') {
  g.WebSocket = WebSocket
}
