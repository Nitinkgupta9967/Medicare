const mongoose = require('mongoose');

const QueueStateSchema = new mongoose.Schema({
  currentToken: { type: Number, default: 0 },   // tokenId currently being served, 0 = none yet
  lastTokenId: { type: Number, default: 0 },     // last generated tokenId
  avgConsultMin: { type: Number, default: 5 },   // rolling average consultation time (minutes)
  totalServed: { type: Number, default: 0 }      // counter used to compute rolling average
});

module.exports = mongoose.model('QueueState', QueueStateSchema);
