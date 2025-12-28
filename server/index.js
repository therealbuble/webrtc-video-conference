const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// SPA routing - serve index.html for all non-file routes
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Store room information
const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join a room
    socket.on('join-room', ({ roomId, displayName }) => {
        // Check if room exists, if not create it
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }

        const room = rooms.get(roomId);

        // Check room capacity (max 3 users)
        if (room.size >= 3) {
            socket.emit('room-full');
            return;
        }

        // Join the room
        socket.join(roomId);
        room.add(socket.id);

        // Store user info
        socket.roomId = roomId;
        socket.displayName = displayName;

        console.log(`${displayName} (${socket.id}) joined room: ${roomId}`);

        // Notify user of successful join
        socket.emit('joined-room', { roomId });

        // Get list of existing users in room
        const existingUsers = Array.from(room)
            .filter(id => id !== socket.id)
            .map(id => {
                const userSocket = io.sockets.sockets.get(id);
                return {
                    userId: id,
                    displayName: userSocket?.displayName || 'Unknown'
                };
            });

        // Send existing users to the new user
        socket.emit('existing-users', existingUsers);

        // Notify other users in the room
        socket.to(roomId).emit('user-joined', {
            userId: socket.id,
            displayName: displayName
        });
    });

    // Handle WebRTC offer
    socket.on('offer', ({ offer, to }) => {
        console.log(`Sending offer from ${socket.id} to ${to}`);
        io.to(to).emit('offer', {
            offer,
            from: socket.id,
            displayName: socket.displayName
        });
    });

    // Handle WebRTC answer
    socket.on('answer', ({ answer, to }) => {
        console.log(`Sending answer from ${socket.id} to ${to}`);
        io.to(to).emit('answer', {
            answer,
            from: socket.id
        });
    });

    // Handle ICE candidate
    socket.on('ice-candidate', ({ candidate, to }) => {
        console.log(`Sending ICE candidate from ${socket.id} to ${to}`);
        io.to(to).emit('ice-candidate', {
            candidate,
            from: socket.id
        });
    });

    // Handle chat message
    socket.on('chat-message', ({ message, to, timestamp }) => {
        console.log(`Chat message from ${socket.displayName} to ${to || 'everyone'}: ${message}`);

        const payload = {
            message,
            from: socket.id,
            displayName: socket.displayName,
            timestamp: timestamp || Date.now(),
            isPrivate: !!to
        };

        if (to) {
            // Private message
            io.to(to).emit('chat-message', payload);
            // Also send back to sender so they see their own private message
            socket.emit('chat-message', payload);
        } else {
            // Public message to room
            if (socket.roomId) {
                io.to(socket.roomId).emit('chat-message', payload);
            }
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.delete(socket.id);

                // If room is empty, delete it
                if (room.size === 0) {
                    rooms.delete(socket.roomId);
                    console.log(`Room ${socket.roomId} deleted (empty)`);
                } else {
                    // Notify other users
                    socket.to(socket.roomId).emit('user-left', {
                        userId: socket.id,
                        displayName: socket.displayName
                    });
                }
            }
        }
    });

    // Handle explicit leave
    socket.on('leave-room', () => {
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.delete(socket.id);

                socket.to(socket.roomId).emit('user-left', {
                    userId: socket.id,
                    displayName: socket.displayName
                });

                if (room.size === 0) {
                    rooms.delete(socket.roomId);
                }
            }
            socket.leave(socket.roomId);
            socket.roomId = null;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('------------------------------------------------');
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Socket.io path initialized`);
    console.log('------------------------------------------------');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});
