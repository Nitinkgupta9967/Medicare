const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({
  tokenId: { type: Number, required: true },
  patientName: { type: String, required: true },
  status: { type: String, enum: ['waiting', 'serving', 'served'], default: 'waiting' },
  addedAt: { type: Date, default: Date.now },
  calledAt: { type: Date, default: null },   // when "Call Next" was hit for this token
  servedAt: { type: Date, default: null }    // when token finished / next was called after it
});

module.exports = mongoose.model('Token', TokenSchema);
