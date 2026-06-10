const express = require('express');
const Room = require('../models/Room');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/rooms
// @desc    Create a new room
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { roomName, password } = req.body;

    if (!roomName || !password) {
      return res.status(400).json({ message: 'Please provide room name and password' });
    }

    // Create room
    const room = await Room.create({
      roomName,
      password,
      createdBy: req.user._id,
      participants: [req.user._id],
    });

    res.status(201).json({
      success: true,
      room: {
        id: room._id,
        roomId: room.roomId,
        roomName: room.roomName,
        createdBy: room.createdBy,
        participants: room.participants,
        isActive: room.isActive,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/rooms
// @desc    Get all active rooms
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true })
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: rooms.length,
      rooms: rooms.map((room) => ({
        id: room._id,
        roomId: room.roomId,
        roomName: room.roomName,
        createdBy: room.createdBy.username,
        participantCount: room.participants.length,
        isActive: room.isActive,
        createdAt: room.createdAt,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/rooms/join
// @desc    Join a room with password
// @access  Private
router.post('/join', protect, async (req, res) => {
  try {
    const { roomId, password } = req.body;

    if (!roomId || !password) {
      return res.status(400).json({ message: 'Please provide room ID and password' });
    }

    // Find room with password
    const room = await Room.findOne({ roomId, isActive: true }).select('+password');

    if (!room) {
      return res.status(404).json({ message: 'Room not found or inactive' });
    }

    // Check password
    const isMatch = await room.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Check if user already in room
    if (!room.participants.includes(req.user._id)) {
      room.participants.push(req.user._id);
      await room.save();
    }

    res.json({
      success: true,
      room: {
        id: room._id,
        roomId: room.roomId,
        roomName: room.roomName,
        createdBy: room.createdBy,
        participants: room.participants,
        isActive: room.isActive,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/rooms/:roomId
// @desc    Get room details
// @access  Private
router.get('/:roomId', protect, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
      .populate('createdBy', 'username')
      .populate('participants', 'username');

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({
      success: true,
      room: {
        id: room._id,
        roomId: room.roomId,
        roomName: room.roomName,
        createdBy: room.createdBy,
        participants: room.participants,
        isActive: room.isActive,
        meetingStartTime: room.meetingStartTime,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/rooms/:roomId
// @desc    Close/delete a room
// @access  Private
router.delete('/:roomId', protect, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is the creator
    if (room.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only room creator can delete the room' });
    }

    room.isActive = false;
    await room.save();

    res.json({
      success: true,
      message: 'Room closed successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/rooms/leave/:roomId
// @desc    Leave a room
// @access  Private
router.post('/leave/:roomId', protect, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Remove user from participants
    room.participants = room.participants.filter(
      (p) => p.toString() !== req.user._id.toString()
    );

    // If no participants left, deactivate room
    if (room.participants.length === 0) {
      room.isActive = false;
    }

    await room.save();

    res.json({
      success: true,
      message: 'Left room successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/rooms/kick/:roomId
// @desc    Kick a participant from room (host only)
// @access  Private
router.post('/kick/:roomId', protect, async (req, res) => {
  try {
    const { userId } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is the creator/host
    if (room.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can kick participants' });
    }

    // Cannot kick yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot kick yourself' });
    }

    // Remove user from participants
    room.participants = room.participants.filter(
      (p) => p.toString() !== userId
    );

    await room.save();

    res.json({
      success: true,
      message: 'User kicked successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;