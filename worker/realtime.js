// One Durable Object per graph id — the replacement for Supabase's
// `postgres_changes` subscription.
//
// Flow: the Worker writes to D1 first (D1 stays the source of truth), then POSTs
// the new revision here and this object fans it out to every other open socket.
// Sockets are accepted with the hibernation API so an idle room costs nothing.

export class GraphRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/broadcast') {
      const body   = await request.text();
      const origin = url.searchParams.get('cid');   // don't echo to the sender
      let sent = 0;
      for (const ws of this.ctx.getWebSockets()) {
        if (origin && this.ctx.getTags(ws).includes(origin)) continue;
        try { ws.send(body); sent++; } catch { /* socket already gone */ }
      }
      return Response.json({ sent });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const cid = url.searchParams.get('cid') || crypto.randomUUID();
    const { 0: client, 1: server } = new WebSocketPair();
    // The tag is how /broadcast recognises the sender after hibernation —
    // instance fields do not survive it, tags do.
    this.ctx.acceptWebSocket(server, [cid]);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Keepalive only; clients never send state, they PUT it through the API.
  webSocketMessage(ws, message) {
    if (message === 'ping') ws.send('pong');
  }

  webSocketClose(ws, code, reason, wasClean) {
    try { ws.close(code, reason); } catch {}
  }

  webSocketError(ws) {
    try { ws.close(1011, 'error'); } catch {}
  }
}

/** Called by the API after a successful D1 write. */
export async function broadcast(env, graphId, payload, cid) {
  const stub = env.GRAPH_ROOM.get(env.GRAPH_ROOM.idFromName(graphId));
  const qs   = cid ? `?cid=${encodeURIComponent(cid)}` : '';
  await stub.fetch(`https://do/broadcast${qs}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
