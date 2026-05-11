// ============================================
// Client-side JavaScript for TechCom Nexus Chat
// With Auto-Reconnection & SERVER FAILOVER - FIXED
// ============================================

// List of available servers for failover
const servers = [
    'http://localhost:3000',
    'http://localhost:4000'
];

let currentServerIndex = 0; // Start with first server (will be overridden by URL)
let socket = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// Determine which server to connect based on current page URL
function getInitialServer() {
    const currentPort = window.location.port;
    if (currentPort === '3000') {
        currentServerIndex = 0;
        return servers[0];
    } else if (currentPort === '4000') {
        currentServerIndex = 1;
        return servers[1];
    } else {
        // Default to first server
        currentServerIndex = 0;
        return servers[0];
    }
}

// Function to connect to a specific server
function connectToServer(serverUrl) {
    console.log(`🔄 Attempting to connect to: ${serverUrl}`);
    
    // Disconnect existing socket if any
    if (socket && socket.connected) {
        console.log('Disconnecting existing socket');
        socket.disconnect();
    }
    
    // Create new socket connection to the specified server
    socket = io(serverUrl, {
        reconnection: false, // We'll handle reconnection manually for failover
        timeout: 5000,
        forceNew: true,
        transports: ['websocket', 'polling'] // Try websocket first, then polling
    });
    
    // Set up socket event listeners
    setupSocketListeners();
    
    return socket;
}

// Function to try next server (failover)
function tryNextServer() {
    reconnectAttempts++;
    
    if (reconnectAttempts <= maxReconnectAttempts) {
        // Try the next server in the list
        currentServerIndex = (currentServerIndex + 1) % servers.length;
        const nextServer = servers[currentServerIndex];
        
        console.log(`⚠️ Attempt ${reconnectAttempts}/${maxReconnectAttempts}: Trying next server: ${nextServer}`);
        addSystemMessage(`🔄 Attempting to connect to alternative server (${nextServer})...`);
        
        setTimeout(() => {
            connectToServer(nextServer);
        }, 1000);
    } else {
        addSystemMessage('❌ Could not connect to any server. Please refresh the page.');
    }
}

// Initial connection based on current page URL
const initialServer = getInitialServer();
console.log(`Starting with server: ${initialServer}`);
connectToServer(initialServer);

// Get references to all required HTML elements
const usernameInput = document.getElementById('username');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesDiv = document.getElementById('messages');
const userList = document.getElementById('userList');
const typingIndicator = document.getElementById('typingIndicator');

// Store current logged-in user
let currentUser = null;
let isConnected = false;

// Used to control typing indicator delay
let typingTimeout;

// ============================================
// SETUP SOCKET EVENT LISTENERS
// ============================================
function setupSocketListeners() {
    
    // Show when client is trying to connect
    socket.on('connect', () => {
        console.log('✅ Connected to server:', socket.io.uri);
        console.log('Socket ID:', socket.id);
        isConnected = true;
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        addSystemMessage(`🟢 Connected to chat server (${socket.io.uri})`);
        
        // Rejoin with username if we had one before disconnection
        if (currentUser) {
            console.log(`Rejoining as ${currentUser}...`);
            socket.emit('join', currentUser);
            addSystemMessage(`🔄 Rejoining as ${currentUser}...`);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('🔴 Disconnected from server. Reason:', reason);
        isConnected = false;
        addSystemMessage('🔴 Disconnected from server. Attempting to reconnect...');
        
        // Try next server for failover
        setTimeout(() => {
            tryNextServer();
        }, 2000);
    });

    socket.on('connect_error', (error) => {
        console.log('❌ Connection error:', error.message);
        
        // Try next server
        tryNextServer();
    });

    socket.on('connect_timeout', () => {
        console.log('⏱️ Connection timeout');
        addSystemMessage('⏱️ Connection timeout. Trying next server...');
        
        // Try next server
        tryNextServer();
    });

    socket.on('error', (error) => {
        console.log('❌ Socket error:', error);
    });

    // ============================================
    // RECEIVE MESSAGE FROM SERVER
    // ============================================
    socket.on('message', (data) => {
        // Create new message element
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        
        // Align message based on sender
        messageElement.classList.add(
            data.username === currentUser ? 'right' : 'left'
        );
        
        // Display username, timestamp and message text
        messageElement.innerHTML = `
            <div class="username">
                ${data.username} 
                <span class="timestamp">${data.timestamp}</span>
            </div>
            <div class="text">${data.text}</div>
        `;
        
        // Append message to chat area
        messagesDiv.appendChild(messageElement);
        
        // Auto scroll to latest message
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });

    // ============================================
    // SYSTEM NOTIFICATIONS (Join/Leave)
    // ============================================
    socket.on('userJoined', (username) => {
        if (username !== currentUser) {
            addSystemMessage(`👤 ${username} joined the conversation`);
        }
    });

    socket.on('userLeft', (username) => {
        addSystemMessage(`👋 ${username} left the conversation`);
    });

    socket.on('userDisconnected', (username) => {
        addSystemMessage(`⚠️ ${username} disconnected (connection lost)`);
    });

    // ============================================
    // UPDATE CONNECTED USERS
    // ============================================
    socket.on('userList', (users) => {
        console.log('📋 Received user list:', users);
        
        userList.innerHTML = '';
        
        if (!users || users.length === 0) {
            const li = document.createElement('li');
            li.innerHTML = `<div class="online-dot" style="background: #ccc;"></div>No users online`;
            li.style.opacity = '0.6';
            userList.appendChild(li);
        } else {
            const sortedUsers = [...users].sort();
            sortedUsers.forEach(user => {
                const li = document.createElement('li');
                if (user === currentUser) {
                    li.innerHTML = `<div class="online-dot" style="background: #22c55e;"></div><strong>${user} (you)</strong>`;
                } else {
                    li.innerHTML = `<div class="online-dot"></div>${user}`;
                }
                userList.appendChild(li);
            });
        }
    });

    // ============================================
    // TYPING INDICATOR
    // ============================================
    socket.on('typing', (username) => {
        if (username !== currentUser) {
            typingIndicator.innerText = `${username} is typing...`;
        }
    });

    socket.on('stopTyping', () => {
        typingIndicator.innerText = '';
    });
}

// ============================================
// USER JOIN EVENT (from input)
// ============================================
usernameInput.addEventListener('change', () => {
    const username = usernameInput.value.trim();
    
    if (username) {
        if (!currentUser) {
            currentUser = username;
            if (isConnected) {
                console.log(`Emitting join for ${username}`);
                socket.emit('join', username);
                addSystemMessage(`👋 You joined as ${username}`);
            } else {
                addSystemMessage(`⚠️ Waiting for connection to join as ${username}...`);
                // Store username and it will auto-join when connected
            }
        } else if (username !== currentUser) {
            // User changed name
            console.log(`Username changed from ${currentUser} to ${username}`);
            if (isConnected) {
                socket.emit('leave', currentUser);
                socket.emit('join', username);
            }
            currentUser = username;
            addSystemMessage(`👋 You are now known as ${username}`);
        }
    }
});

// ============================================
// SEND MESSAGE FUNCTION
// ============================================
function sendMessage() {
    const text = messageInput.value.trim();
    
    if (text && currentUser && isConnected) {
        const timestamp = new Date().toLocaleString();
        
        socket.emit('chatMessage', { 
            username: currentUser, 
            text, 
            timestamp 
        });
        
        messageInput.value = '';
    } else if (!isConnected) {
        addSystemMessage('⚠️ Not connected to server. Please wait for reconnection.');
    } else if (!currentUser) {
        addSystemMessage('⚠️ Please enter your username first.');
    }
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ============================================
// TYPING INDICATOR
// ============================================
messageInput.addEventListener('input', () => {
    if (currentUser && isConnected) {
        socket.emit('typing', currentUser);
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stopTyping');
        }, 1000);
    }
});

// ============================================
// HELPER FUNCTION: Add System Message
// ============================================
function addSystemMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'system-message');
    messageElement.style.background = '#f1f5f9';
    messageElement.style.maxWidth = '100%';
    messageElement.style.textAlign = 'center';
    messageElement.style.fontStyle = 'italic';
    messageElement.style.opacity = '0.8';
    messageElement.style.fontSize = '12px';
    messageElement.style.padding = '4px 10px';
    messageElement.style.borderRadius = '20px';
    messageElement.style.margin = '2px auto';
    messageElement.innerHTML = `<div class="text">${text}</div>`;
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}