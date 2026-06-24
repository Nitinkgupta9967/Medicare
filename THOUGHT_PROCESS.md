# Thought Process

The system is intentionally small and event-driven. REST is used for initial state loading and simple fallback actions, while Socket.IO is the source of live updates after every mutation. Both receptionist and patient screens render from the same `queue:updated` payload so they cannot drift apart.

The backend keeps queue mutation logic in `queueService`, which makes the HTTP routes and socket events thin wrappers around the same behavior. MongoDB provides persistence and atomic token id increments. If MongoDB is not available during a demo, the service falls back to in-memory data so the real-time workflow can still be judged.

The UI is split into two route-like views. `/reception` prioritizes fast controls and queue visibility for staff. `/display` is designed for a waiting-room screen with oversized current-token information and compact live status indicators.

Concurrency concerns are handled by keeping token id generation server-side and broadcasting a fresh full queue snapshot after each accepted action. Acknowledgement callbacks let the receptionist UI show failures instead of optimistically assuming the server accepted a change.
