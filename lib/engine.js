let playerSandboxes = new Map()

module.exports = function (config) {
  config.engine.on('init', (type) => {
    if(type === 'runner') {
      runner(config)
    }
  })
}

function runner (config) {
  const { common: { storage: { db, env, pubsub } } } = config
  console.log(config.engine)
  config.engine.enableInspector = true;
  pubsub.subscribe('inspector/connect', (userId) => {
    initInspector(config, userId)
  })

  config.engine.on('playerSandbox', function(sandbox, userId) {
    let current = playerSandboxes.get(userId);
    if (current !== undefined && current.getIsolate() === sandbox.getIsolate()) {
      sandbox._created = current._created;
    } else {
      sandbox._created = Date.now();
    }
    playerSandboxes.set(userId, sandbox);
  });
}

function initInspector(config, userId) {
  const { common: { storage: { db, env, pubsub } } } = config
  let sandbox = playerSandboxes.get(userId);
  if (!sandbox) {
    return
  }
  // Setup inspector session
  let channel = sandbox.getIsolate().createInspectorSession();
  function dispose() {
    try {
      channel.dispose();
    } catch (err) {}
  }
  
  // Relay messages from frontend to backend
  pubsub.subscribe(`inspector:${userId}/tx`, function(message) {
    try {
      channel.dispatchProtocolMessage(message);
    } catch (err) {
      // This happens if inspector session was closed unexpectedly
      dispose()
    }
  });

  // Relay messages from backend to frontend
  function send(message) {
    try {
      pubsub.publish(`inspector:${userId}/rx`, message);
    } catch (err) {
      dispose();
    }
  }
  channel.onResponse = (callId, message) => send(message);
  channel.onNotification = send;
}