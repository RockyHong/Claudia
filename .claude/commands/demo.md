Demo the Claudia dashboard by cycling through visible states.

Do the following steps in order — each one triggers a different state on the Claudia dashboard:

1. **Permission request** — Use the WebFetch tool to fetch `https://github.com/RockyHong/Claudia`. This will trigger a permission prompt that the dashboard can display. (Note: just thinking and generating text already puts the session into "busy" state, so no need for a separate busy step.)

2. **Greeting** — After the above completes, reply with a friendly greeting to the user, something like: "Hey! 👋 Claudia is live and tracking. You just saw me go through busy → permission → response. Your dashboard should have shown each state in real time!"

Keep each step simple — the point is to trigger dashboard state changes, not to do real work.
