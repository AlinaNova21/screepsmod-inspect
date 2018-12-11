const WebSocket = require('ws');
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const authlib = require(path.join(path.dirname(require.main.filename), '../lib/authlib'))

module.exports = function (config) {
  const { common: { storage: { db, env, pubsub } } } = config

  const wss = new WebSocket.Server({
    port: 21028,
    clientTracking: true,
    verifyClient (info, cb) {
      const token = info.req.url.slice(1)
      if(!token) return cb(false)
      // db.users.findOne({ usernameLower: token.toLowerCase() })
      authlib.checkToken(token)
        .then(user => {
          if(user) {
            info.req.user = user
            cb(true)
          } else {
            cb(false, 401, 'Unauthorized')
          }
        }).catch(err => {
          console.error(err)
          cb(false, 401, 'Unauthorized')
        })
    }
  })


  config.backend.on('expressPreConfig', app => {
    app.use('/inspector', express.static(path.join(__dirname,'../public')))
    app.use('/inspector', express.static(path.join(__dirname,'../node_modules/chrome-devtools-frontend/front_end')))
    app.use('/json', (req, res) => {
      const origin = req.headers.origin
      res.json([
        {
          "description": "node.js instance",
          "devtoolsFrontendUrl": "chrome-devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=localhost:21025/93c148e1-5389-4f46-8c2e-b23a4bd762a4",
          "devtoolsFrontendUrlCompat": "chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=localhost:9229/93c148e1-5389-4f46-8c2e-b23a4bd762a4",
          "faviconUrl": "https://nodejs.org/static/favicon.ico",
          "id": "93c148e1-5389-4f46-8c2e-b23a4bd762a4",
          "title": "node[10631]",
          "type": "node",
          "url": "file://",
          "webSocketDebuggerUrl": "ws://localhost:9229/93c148e1-5389-4f46-8c2e-b23a4bd762a4"
        }
      ])
    })
    pubsub.subscribe('*', (channel, data) => {
      const [,uid] = channel.match(/^inspector:(.+?)\/rx$/) || []
      if(!uid) return
      console.log('rx',uid)
      let client
      wss.clients.forEach(c => {
        if(c.readyState === WebSocket.OPEN && c.user === uid){
          client = c
        }
      })
      if(client) {
        client.send(data)
      }
    })
  })

  wss.on('connection', function connection(ws, req) {
    const { user } = req
    pubsub.publish('inspector/connect', user._id)
    ws.on('close', () => pubsub.publish('inspector/disconnect', user._id))
    ws.on('message', function incoming(message) {
      console.log('tx',user._id,message)
      pubsub.publish(`inspector:${user._id}/tx`, message)
    });
    ws.user = user._id
  })
}
