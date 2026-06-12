const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/db');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json());

// Connect to Database
connectDB();

app.set('socketio', io);

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id, 'auth:', socket.auth);

  // Join a room
  socket.on('join-room', ({ roomId, userId, username }) => {
    socket.join(roomId);
    socket.data.userId = userId;
    socket.data.username = username;
    console.log(`User ${username} (socket: ${socket.id}) joined room ${roomId}`);

    // Send the list of current participants to the joining user
    const room = io.sockets.adapter.rooms.get(roomId);
    const participants = [];
    if (room) {
      room.forEach(socketId => {
        const clientSocket = io.sockets.sockets.get(socketId);
        if (clientSocket) {
          participants.push({
            socketId,
            userId: clientSocket.data.userId,
            username: clientSocket.data.username
          });
        }
      });
    }
    socket.emit('participants-list', { participants });

    // Notify all other users in the room
    socket.to(roomId).emit('user-connected', { userId: socket.id, username });
  });

  // Handle WebRTC signaling - use socket.id for identification
  socket.on('offer', ({ to, offer }) => {
    console.log('Sending offer to:', to);
    io.to(to).emit('offer', { 
      from: socket.id, 
      offer, 
      username: socket.data.username 
    });
  });

  socket.on('answer', ({ to, answer }) => {
    console.log('Sending answer to:', to);
    io.to(to).emit('answer', { 
      from: socket.id, 
      answer, 
      username: socket.data.username 
    });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // User disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Notify users in the room
    const rooms = socket.rooms;
    rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit('user-disconnected', { userId: socket.id });
      }
    });
  });

  // Leave room
  socket.on('leave-room', ({ roomId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit('user-disconnected', { userId: socket.id });
  });

  // Host kick user
  socket.on('kick-user', ({ roomId, userId }) => {
    io.to(userId).emit('kicked', { roomId, reason: 'kicked' });
    socket.to(roomId).emit('user-kicked', { userId });
  });

  // Host ends the meeting
  socket.on('end-meeting', ({ roomId }) => {
    console.log(`Meeting ended by host in room: ${roomId}`);
    // Notify all participants that the meeting has ended
    socket.to(roomId).emit('kicked', { roomId, reason: 'ended' });
    
    // Force all client sockets in this room to leave
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      const socketIds = Array.from(room);
      socketIds.forEach(socketId => {
        const clientSocket = io.sockets.sockets.get(socketId);
        if (clientSocket) {
          clientSocket.leave(roomId);
        }
      });
    }

    // Broadcast global room ended to update dashboards
    io.emit('room-ended', { roomId });
  });

  // Host mute/unmute participant
  socket.on('mute-user', ({ roomId, userId, isMuted }) => {
    if (userId === 'all') {
      socket.to(roomId).emit('remote-mute', { isMuted });
    } else {
      io.to(userId).emit('remote-mute', { isMuted });
    }
  });

  // Host disable/enable participant video
  socket.on('disable-video', ({ roomId, userId, isDisabled }) => {
    if (userId === 'all') {
      socket.to(roomId).emit('remote-disable-video', { isDisabled });
    } else {
      io.to(userId).emit('remote-disable-video', { isDisabled });
    }
  });

  // Send chat message
  socket.on('send-message', ({ roomId, message }) => {
    socket.to(roomId).emit('chat-message', {
      sender: socket.data.username || 'Anonymous',
      senderId: socket.id,
      message,
      timestamp: new Date()
    });
  });

  // Get room participants
  socket.on('get-participants', ({ roomId }) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      const participants = Array.from(room).map(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        return {
          socketId,
          userId: socket?.data?.userId
        };
      });
      io.to(socket.id).emit('participants-list', { participants });
    }
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { io };