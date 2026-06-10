const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const roomSchema = new mongoose.Schema({
  roomName: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    minlength: 3,
    maxlength: 50,
  },
  roomId: {
    type: String,
    unique: true,
    default: () => uuidv4(),
  },
  password: {
    type: String,
    required: [true, 'Room password is required'],
    minlength: 4,
    select: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
  meetingStartTime: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
roomSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match password method
roomSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Room', roomSchema);