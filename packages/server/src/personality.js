const pendingMessages = [
  (name) => `The ${name} team needs your sign-off.`,
  (name) => `${name} is waiting on you.`,
  (name) => `Hey — ${name} needs a moment of your time.`,
];

const multiPendingMessages = [
  (names) => `You're popular — ${names} both need you.`,
  (names) => `Heads up: ${names} are waiting on you.`,
];

const manyPendingMessages = [
  (count) => `${count} sessions need your attention. Better check in.`,
  (count) => `You've got ${count} waiting. Might want to make the rounds.`,
];

const allIdleMessages = [
  "All quiet. Go grab a coffee.",
  "Nothing happening. Take a breather.",
  "Everyone's idle. Enjoy the calm.",
];

const workingMessages = [
  (count) => `${count > 1 ? "Agents are" : "Agent is"} on it.`,
  (names) => `${names} — heads down, working.`,
];

const thinkingMessages = [
  (name) => `${name} is thinking it over...`,
  (name) => `${name} is pondering the deep questions.`,
];

function pick(arr, seed) {
  return arr[seed % arr.length];
}

function formatNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

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

  const seed = Math.floor(Math.random() * 1000);
  const pending = sessions.filter((s) => s.state === "pending");
  const working = sessions.filter((s) => s.state === "working");
  const thinking = sessions.filter((s) => s.state === "thinking");

  let message;

  if (pending.length > 2) {
    message = pick(manyPendingMessages, seed)(pending.length);
  } else if (pending.length === 2) {
    const names = formatNames(pending.map((s) => s.displayName));
    message = pick(multiPendingMessages, seed)(names);
  } else if (pending.length === 1) {
    message = pick(pendingMessages, seed)(pending[0].displayName);
  } else if (working.length > 0) {
    const names = formatNames(working.map((s) => s.displayName));
    message = pick(workingMessages, seed)(working.length > 1 ? working.length : names);
  } else if (thinking.length > 0) {
    message = pick(thinkingMessages, seed)(thinking[0].displayName);
  } else {
    message = pick(allIdleMessages, seed);
  }

  lastKey = key;
  lastMessage = message;
  return message;
}
