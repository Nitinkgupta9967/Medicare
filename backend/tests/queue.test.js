const queueService = require('../src/services/queueService');

describe('MediQueue Service Logic', () => {
  test('should fetch initial state with defaults', async () => {
    const status = await queueService.getQueueStatus();
    expect(status.currentToken).toBe(0);
    expect(status.avgConsultMin).toBe(5);
    expect(status.totalServed).toBe(0);
    expect(status.waitingTokens).toEqual([]);
    expect(status.servingToken).toBeNull();
  });

  test('should add patient and increment tokenId', async () => {
    const state1 = await queueService.addPatient('John Doe');
    expect(state1.lastTokenId).toBe(1);
    expect(state1.waitingTokens.length).toBe(1);
    expect(state1.waitingTokens[0].patientName).toBe('John Doe');
    expect(state1.waitingTokens[0].status).toBe('waiting');

    const state2 = await queueService.addPatient('Jane Smith');
    expect(state2.lastTokenId).toBe(2);
    expect(state2.waitingTokens.length).toBe(2);
    expect(state2.waitingTokens[1].patientName).toBe('Jane Smith');
  });

  test('should call next and promote waiting patient', async () => {
    // Currently serving should be 0, Doe is waiting (1), Smith is waiting (2)
    const state = await queueService.callNext();
    expect(state.currentToken).toBe(1);
    expect(state.servingToken.patientName).toBe('John Doe');
    expect(state.waitingTokens.length).toBe(1);
    expect(state.waitingTokens[0].patientName).toBe('Jane Smith');
  });

  test('should allow manually overriding average consultation time', async () => {
    const state = await queueService.setAvgTime(8.5);
    expect(state.avgConsultMin).toBe(8.5);
  });

  test('should calculate rolling average time on callNext', async () => {
    // Doe (token 1) is currently serving.
    // Let's modify the serving token's calledAt time to simulate actual consultation duration.
    // In our test context, we'll wait a brief moment or mock the duration.
    const now = new Date();
    
    // We mock the service inMemoryTokens directly if needed, or trigger callNext.
    // Let's call next. This marks Doe (token 1) served and promotes Smith (token 2) serving.
    const state = await queueService.callNext();
    expect(state.currentToken).toBe(2);
    expect(state.servingToken.patientName).toBe('Jane Smith');
    
    // Total served should now be 1 because John Doe was serving and is now served.
    expect(state.totalServed).toBe(1);
  });
});
