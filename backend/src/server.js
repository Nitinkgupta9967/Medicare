const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const queueService = require('./services/queueService');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = corsOrigin.split(',');

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Socket.IO Setup
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Database Connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mediqueue';
console.log('Connecting to MongoDB...');

mongoose
  .connect(mongoUri)
  .then(async () => {
    console.log('MongoDB connected successfully!');
    await queueService.initQueueState();
  })
  .catch((err) => {
    console.error('MongoDB connection failed. Continuing in offline/in-memory mode...', err.message);
  });

// Broadcast Helper
async function broadcastUpdate() {
  try {
    const status = await queueService.getQueueStatus();
    io.emit('queue:updated', status);
  } catch (err) {
    console.error('Error during broadcast:', err);
  }
}

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    database: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED/IN_MEMORY',
    timestamp: new Date()
  });
});

app.get('/api/queue', async (req, res) => {
  try {
    const status = await queueService.getQueueStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/queue/add', async (req, res) => {
  try {
    const { patientName } = req.body;
    const updatedStatus = await queueService.addPatient(patientName);
    io.emit('queue:updated', updatedStatus);
    res.json(updatedStatus);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/queue/call-next', async (req, res) => {
  try {
    const updatedStatus = await queueService.callNext();
    io.emit('queue:updated', updatedStatus);
    res.json(updatedStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/queue/avg-time', async (req, res) => {
  try {
    const { avgConsultMin } = req.body;
    const updatedStatus = await queueService.setAvgTime(avgConsultMin);
    io.emit('queue:updated', updatedStatus);
    res.json(updatedStatus);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

app.get(['/reception', '/display'], (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});
// Socket.IO Events
io.on('connection', async (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send initial state on connection
  try {
    const status = await queueService.getQueueStatus();
    socket.emit('queue:updated', status);
  } catch (err) {
    console.error(`Error sending initial state to client ${socket.id}:`, err);
  }

  // Socket: Add patient
  socket.on('addPatient', async ({ patientName }, callback) => {
    try {
      const updatedStatus = await queueService.addPatient(patientName);
      io.emit('queue:updated', updatedStatus);
      if (typeof callback === 'function') {
        callback({ success: true, status: updatedStatus });
      }
    } catch (err) {
      console.error('Socket addPatient error:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // Socket: Call next
  socket.on('callNext', async (payload, callback) => {
    if (typeof payload === 'function') {
      callback = payload;
    }
    try {
      const updatedStatus = await queueService.callNext();
      io.emit('queue:updated', updatedStatus);
      if (typeof callback === 'function') {
        callback({ success: true, status: updatedStatus });
      }
    } catch (err) {
      console.error('Socket callNext error:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // Socket: Set avg time
  socket.on('setAvgTime', async ({ avgConsultMin }, callback) => {
    try {
      const updatedStatus = await queueService.setAvgTime(avgConsultMin);
      io.emit('queue:updated', updatedStatus);
      if (typeof callback === 'function') {
        callback({ success: true, status: updatedStatus });
      }
    } catch (err) {
      console.error('Socket setAvgTime error:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`MediQueue Backend server running on port ${PORT}`);
});

