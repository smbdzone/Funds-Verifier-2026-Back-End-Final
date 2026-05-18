/**
 * Socket.IO utility module
 * Provides centralized access to Socket.IO instance
 */

import { Server } from 'socket.io'

let io = null

/**
 * Initialize Socket.IO with Express server
 * @param {http.Server} server - HTTP server instance
 * @returns {SocketIOServer} - Socket.IO instance
 */
export const initSocket = (server) => {
  if (io) {
    return io
  }

  io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:5002',
        'http://localhost:3011',
        'https://fundsverifier.com',
      ],
      credentials: true,
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    connectTimeout: 20000,
  })

  return io
}

/**
 * Get Socket.IO instance
 * @returns {SocketIOServer|null} - Socket.IO instance or null if not initialized
 */
export const getIO = () => {
  return io
}

export default { initSocket, getIO }

