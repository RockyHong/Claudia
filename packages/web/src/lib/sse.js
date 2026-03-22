/**
 * SSE client for receiving session state updates from Claudia server.
 * Uses native EventSource with built-in auto-reconnect.
 */

export function createSSEClient(url, onUpdate) {
  let source = null;

  function connect() {
    source = new EventSource(url);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data);
      } catch {
        // Ignore malformed messages
      }
    };

    source.onerror = () => {
      // EventSource auto-reconnects. We just let it.
      // If the connection is closed permanently, readyState will be CLOSED.
      if (source.readyState === EventSource.CLOSED) {
        // Server gone — retry manually after delay
        setTimeout(connect, 3000);
      }
    };
  }

  function disconnect() {
    if (source) {
      source.close();
      source = null;
    }
  }

  connect();

  return { disconnect };
}
