function stateKey(sessions) {
  return sessions
    .map((s) => `${s.id}:${s.state}`)
    .sort()
    .join("|");
}

let lastKey = "";
let lastMessage = "";

export function getStatusMessage(sessions) {
  if (!sessions || sessions.length === 0) {
    return "No active sessions. Waiting for Claude to check in.";
  }

  const key = stateKey(sessions);
  if (key === lastKey) return lastMessage;

  const pending = sessions.filter((s) => s.state === "pending");
  const busy = sessions.filter((s) => s.state === "busy");
  const idle = sessions.filter((s) => s.state === "idle");

  let message;

  if (pending.length > 0) {
    message = `${pending.length} awaiting your response.`;
  } else if (busy.length > 0 && idle.length > 0) {
    message = "Some sessions standing by. Still working on the rest.";
  } else if (busy.length > 0) {
    message = "All busy. Grab a coffee.";
  } else {
    message = "All sessions free — ready for tasks.";
  }

  lastKey = key;
  lastMessage = message;
  return message;
}
