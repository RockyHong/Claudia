/**
 * SSE client for receiving session state updates from Claudia server.
 * Uses native EventSource with built-in auto-reconnect.
 */

export function createSSEClient(url, onUpdate, onStatusChange) {
  let source = null;
  let connected = false;

  function setConnected(value) {
    if (value !== connected) {
      connected = value;
      if (onStatusChange) onStatusChange(connected);
    }
  }

  function connect() {
    source = new EventSource(url);

    source.onopen = () => setConnected(true);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setConnected(true);
        onUpdate(data);
      } catch {
        // Ignore malformed messages
      }
    };

    source.onerror = () => {
      setConnected(false);
      if (source.readyState === EventSource.CLOSED) {
        setTimeout(connect, 3000);
      }
    };
  }

  function disconnect() {
    if (source) {
      source.close();
      source = null;
      setConnected(false);
    }
  }

  connect();

  function reconnect() {
    if (source) {
      source.close();
      source = null;
    }
    connect();
  }

  return { disconnect, reconnect };
}
