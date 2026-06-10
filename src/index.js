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
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Connect to Database
connectDB();

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id, 'auth:', socket.auth);

  // Join a room
  socket.on('join-room', ({ roomId, userId }) => {
    socket.join(roomId);
    socket.data.userId = userId; // Store userId in socket data
    console.log(`User ${userId} (socket: ${socket.id}) joined room ${roomId}`);

    // Notify all other users in the room
    socket.to(roomId).emit('user-connected', { userId: socket.id });
  });

  // Handle WebRTC signaling - use socket.id for identification
  socket.on('offer', ({ to, offer }) => {
    console.log('Sending offer to:', to);
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    console.log('Sending answer to:', to);
    io.to(to).emit('answer', { from: socket.id, answer });
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
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { io };