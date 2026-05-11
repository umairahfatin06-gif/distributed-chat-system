// ============================================
// Server 1 - TechCom Nexus Chat System
// Port: 3000
// With Redis User Synchronization - FIXED VERSION
// ============================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { pubClient, subClient } = require('./redis-config');
const redisUserManager = require('./redis-helper');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

// Serve static files from public directory
app.use(express.static('public'));

// Add a test route to check if server is running
app.get('/test', (req, res) => {
    res.send('Server 1 is running!');
});

// Add a route to manually check users in Redis (for debugging)
app.get('/users', async (req, res) => {
    try {
        const users = await redisUserManager.getUsers();
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a route to clear users (for testing only - remove in production)
app.get('/clear-users', async (req, res) => {
    try {
        await redisUserManager.clearAllUsers();
        res.send('All users cleared from Redis');
    } catch (error) {
        res.status(500).send('Error clearing users');
    }
});

// Set up Redis adapter for cross-server communication
io.adapter(createAdapter(pubClient, subClient));

// Track socket to username mapping
const socketUsers = new Map();

io.on('connection', (socket) => {
    console.log(`[Server1:${PORT}] ✅ Client connected: ${socket.id}`);

    // Send current user list to the newly connected client
    redisUserManager.getUsers()
        .then(users => {
            console.log(`[Server1:${PORT}] Sending user list to new client:`, users);
            socket.emit('userList', users);
        })
        .catch(err => {
            console.error(`[Server1:${PORT}] Error getting users:`, err);
            socket.emit('userList', []); // Send empty list as fallback
        });

    // ========================================
    // USER JOIN EVENT
    // ========================================
    socket.on('join', async (username) => {
        console.log(`[Server1:${PORT}] 📥 Join event received: "${username}" for socket ${socket.id}`);
        
        try {
            if (!username || username.trim() === '') {
                console.log(`[Server1:${PORT}] ❌ Empty username rejected`);
                return;
            }
            
            username = username.trim();
            
            // Check if this socket already had a different username
            if (socket.username && socket.username !== username) {
                const oldUsername = socket.username;
                console.log(`[Server1:${PORT}] Socket changing username from "${oldUsername}" to "${username}"`);
                
                // Remove old username from Redis
                await redisUserManager.removeUser(oldUsername);
            }
            
            // Set the new username for this socket
            socket.username = username;
            socketUsers.set(socket.id, username);
            
            // Add user to Redis
            const allUsers = await redisUserManager.addUser(username);
            
            console.log(`[Server1:${PORT}] ✅ User added to Redis. Current users:`, allUsers);
            
            // Broadcast user joined notification to all clients
            io.emit('userJoined', username);
            
            // Broadcast updated user list to all clients
            io.emit('userList', allUsers);
            
        } catch (error) {
            console.error(`[Server1:${PORT}] ❌ Error in join handler:`, error);
        }
    });

    // ========================================
    // USER LEAVE EVENT (Graceful Leave)
    // ========================================
    socket.on('leave', async (username) => {
        try {
            if (username) {
                console.log(`[Server1:${PORT}] 📤 Leave event: ${username} leaving gracefully`);
                
                // Remove user from Redis
                const allUsers = await redisUserManager.removeUser(username);
                
                // Remove from socket map
                socketUsers.delete(socket.id);
                
                // Broadcast user left notification
                io.emit('userLeft', username);
                
                // Update user list for all clients
                io.emit('userList', allUsers);
                
                console.log(`[Server1:${PORT}] ${username} left. Current users:`, allUsers);
            }
        } catch (error) {
            console.error(`[Server1:${PORT}] ❌ Error in leave handler:`, error);
        }
    });

    // ========================================
    // RECEIVE CHAT MESSAGE
    // ========================================
    socket.on('chatMessage', (data) => {
        console.log(`[Server1:${PORT}] 💬 Message from ${data.username}: ${data.text}`);
        
        // Broadcast message to all connected clients
        io.emit('message', data);
    });

    // ========================================
    // TYPING INDICATOR
    // ========================================
    socket.on('typing', (username) => {
        socket.broadcast.emit('typing', username);
    });

    socket.on('stopTyping', () => {
        socket.broadcast.emit('stopTyping');
    });

    // ========================================
    // CLIENT DISCONNECT (Unexpected)
    // ========================================
    socket.on('disconnect', async () => {
        try {
            if (socket.username) {
                const disconnectedUser = socket.username;
                console.log(`[Server1:${PORT}] 🔴 Client disconnected: ${disconnectedUser} (socket: ${socket.id})`);
                
                // Remove user from Redis
                const allUsers = await redisUserManager.removeUser(disconnectedUser);
                
                // Remove from socket map
                socketUsers.delete(socket.id);
                
                // Broadcast user disconnected notification
                io.emit('userDisconnected', disconnectedUser);
                
                // Update user list for all clients
                io.emit('userList', allUsers);
                
                console.log(`[Server1:${PORT}] Current users after disconnect:`, allUsers);
            } else {
                console.log(`[Server1:${PORT}] 🔴 Unknown client disconnected: ${socket.id}`);
            }
        } catch (error) {
            console.error(`[Server1:${PORT}] ❌ Error in disconnect handler:`, error);
        }
    });
});

// Handle server errors
server.on('error', (error) => {
    console.error(`[Server1:${PORT}] ❌ Server error:`, error);
});

// Start the server
server.listen(PORT, () => {
    console.log('=================================');
    console.log(`✅ Server 1 running on port ${PORT}`);
    console.log(`🌐 WebSocket: ws://localhost:${PORT}`);
    console.log(`🌐 HTTP: http://localhost:${PORT}`);
    console.log('=================================');
});

// Handle process termination
process.on('SIGINT', async () => {
    console.log(`\n[Server1:${PORT}] 👋 Shutting down...`);
    
    // Close all socket connections
    io.close();
    
    // Close server
    server.close(() => {
        console.log(`[Server1:${PORT}] ✅ Server closed`);
        process.exit(0);
    });
});