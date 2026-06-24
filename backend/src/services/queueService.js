const Token = require('../models/Token');
const QueueState = require('../models/QueueState');
const mongoose = require('mongoose');

// In-Memory Fallback State (used if MongoDB is not connected)
let inMemoryState = {
  currentToken: 0,
  lastTokenId: 0,
  avgConsultMin: 5,
  totalServed: 0
};
let inMemoryTokens = [];

// Helper to check if MongoDB is connected
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

// Initialize the queue state singleton
async function initQueueState() {
  if (isDbConnected()) {
    try {
      let state = await QueueState.findOne({});
      if (!state) {
        state = new QueueState({
          currentToken: 0,
          lastTokenId: 0,
          avgConsultMin: 5,
          totalServed: 0
        });
        await state.save();
      }
      return state;
    } catch (err) {
      console.error('Error initializing MongoDB QueueState, falling back to in-memory.', err);
    }
  }
  return inMemoryState;
}

// Get the full queue status
async function getQueueStatus() {
  const isDb = isDbConnected();
  let state;
  let tokens = [];

  if (isDb) {
    try {
      state = await QueueState.findOne({});
      if (!state) {
        state = await initQueueState();
      }
      tokens = await Token.find({ status: { $in: ['waiting', 'serving'] } }).sort({ tokenId: 1 });
    } catch (err) {
      console.error('DB query failed, falling back to in-memory state', err);
      state = inMemoryState;
      tokens = inMemoryTokens.filter(t => t.status === 'waiting' || t.status === 'serving');
    }
  } else {
    state = inMemoryState;
    tokens = inMemoryTokens.filter(t => t.status === 'waiting' || t.status === 'serving');
  }

  const waitingTokens = tokens.filter(t => t.status === 'waiting');
  const servingToken = tokens.find(t => t.status === 'serving') || null;

  return {
    currentToken: state.currentToken,
    lastTokenId: state.lastTokenId,
    avgConsultMin: Math.round(state.avgConsultMin * 10) / 10, // Round to 1 decimal place
    totalServed: state.totalServed,
    waitingTokens,
    servingToken,
    queueLength: waitingTokens.length
  };
}

// Add a new patient to the queue
async function addPatient(patientName) {
  if (!patientName || patientName.trim() === '') {
    throw new Error('Patient name is required');
  }
  const cleanName = patientName.trim();
  const isDb = isDbConnected();

  if (isDb) {
    try {
      // Atomic increment of lastTokenId
      const state = await QueueState.findOneAndUpdate(
        {},
        { $inc: { lastTokenId: 1 } },
        { new: true, upsert: true }
      );

      const token = new Token({
        tokenId: state.lastTokenId,
        patientName: cleanName,
        status: 'waiting'
      });
      await token.save();
    } catch (err) {
      console.error('DB addPatient failed, falling back to in-memory', err);
      inMemoryState.lastTokenId += 1;
      const token = {
        tokenId: inMemoryState.lastTokenId,
        patientName: cleanName,
        status: 'waiting',
        addedAt: new Date(),
        calledAt: null,
        servedAt: null
      };
      inMemoryTokens.push(token);
    }
  } else {
    inMemoryState.lastTokenId += 1;
    const token = {
      tokenId: inMemoryState.lastTokenId,
      patientName: cleanName,
      status: 'waiting',
      addedAt: new Date(),
      calledAt: null,
      servedAt: null
    };
    inMemoryTokens.push(token);
  }

  return await getQueueStatus();
}

// Call next patient
async function callNext() {
  const isDb = isDbConnected();
  const now = new Date();

  if (isDb) {
    try {
      const state = await QueueState.findOne({});
      if (!state) {
        await initQueueState();
      }

      let currentTokenId = state ? state.currentToken : 0;
      let totalServed = state ? state.totalServed : 0;
      let avgConsultMin = state ? state.avgConsultMin : 5;

      // 1. Mark current serving token as served and calculate actual consult duration
      if (currentTokenId > 0) {
        const oldToken = await Token.findOne({ tokenId: currentTokenId, status: 'serving' });
        if (oldToken) {
          oldToken.status = 'served';
          oldToken.servedAt = now;
          await oldToken.save();

          if (oldToken.calledAt) {
            const actualDurationMin = (now - oldToken.calledAt) / 60000;
            // Rolling average update
            avgConsultMin = ((avgConsultMin * totalServed) + actualDurationMin) / (totalServed + 1);
            totalServed += 1;
          }
        }
      }

      // 2. Find next waiting token
      const nextToken = await Token.findOne({ status: 'waiting' }).sort({ tokenId: 1 });
      let nextTokenId = 0;

      if (nextToken) {
        nextToken.status = 'serving';
        nextToken.calledAt = now;
        await nextToken.save();
        nextTokenId = nextToken.tokenId;
      }

      // 3. Update global queue state
      await QueueState.findOneAndUpdate(
        {},
        {
          currentToken: nextTokenId,
          totalServed,
          avgConsultMin
        },
        { new: true, upsert: true }
      );
    } catch (err) {
      console.error('DB callNext failed, falling back to in-memory', err);
      await callNextInMemory(now);
    }
  } else {
    await callNextInMemory(now);
  }

  return await getQueueStatus();
}

// In-memory call next helper
async function callNextInMemory(now) {
  let currentTokenId = inMemoryState.currentToken;
  let totalServed = inMemoryState.totalServed;
  let avgConsultMin = inMemoryState.avgConsultMin;

  // 1. Mark current serving token as served
  if (currentTokenId > 0) {
    const oldTokenIndex = inMemoryTokens.findIndex(t => t.tokenId === currentTokenId && t.status === 'serving');
    if (oldTokenIndex !== -1) {
      const oldToken = inMemoryTokens[oldTokenIndex];
      oldToken.status = 'served';
      oldToken.servedAt = now;

      if (oldToken.calledAt) {
        const actualDurationMin = (now - oldToken.calledAt) / 60000;
        avgConsultMin = ((avgConsultMin * totalServed) + actualDurationMin) / (totalServed + 1);
        totalServed += 1;
      }
    }
  }

  // 2. Find next waiting token
  const nextToken = inMemoryTokens.find(t => t.status === 'waiting');
  let nextTokenId = 0;

  if (nextToken) {
    nextToken.status = 'serving';
    nextToken.calledAt = now;
    nextTokenId = nextToken.tokenId;
  }

  // 3. Update global in-memory state
  inMemoryState.currentToken = nextTokenId;
  inMemoryState.totalServed = totalServed;
  inMemoryState.avgConsultMin = avgConsultMin;
}

// Manually set average consultation time
async function setAvgTime(avgConsultMin) {
  const value = parseFloat(avgConsultMin);
  if (isNaN(value) || value < 0) {
    throw new Error('Invalid consultation time value');
  }

  const isDb = isDbConnected();

  if (isDb) {
    try {
      await QueueState.findOneAndUpdate(
        {},
        { avgConsultMin: value },
        { new: true, upsert: true }
      );
    } catch (err) {
      console.error('DB setAvgTime failed, falling back to in-memory', err);
      inMemoryState.avgConsultMin = value;
    }
  } else {
    inMemoryState.avgConsultMin = value;
  }

  return await getQueueStatus();
}

module.exports = {
  initQueueState,
  getQueueStatus,
  addPatient,
  callNext,
  setAvgTime
};
