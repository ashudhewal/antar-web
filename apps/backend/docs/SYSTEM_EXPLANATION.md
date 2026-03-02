# WebRTC, OpenAI & Memory Architecture Explanation

## 1. Where is the WebRTC code written?

The WebRTC implementation is primarily handled via **Signaling** on your server, while the actual media streaming happens directly between the Client and OpenAI.

*   **Signaling Logic**: Located in **`src/services/openaiService.ts`**.
    *   Method: `createRealtimeCallAnswer`
    *   This function takes the client's WebRTC "Offer" (SDP - Session Description Protocol), sends it to OpenAI, and returns OpenAI's "Answer" (SDP).
*   **API Endpoint**: Located in **`src/routes/v1.ts`**.
    *   Endpoint: `POST /v1/webrtc/offer`
    *   This is the entry point where the client app submits its SDP offer to initiate the connection.

**Note**: There is no low-level WebRTC media handling (ICE candidates, STUN/TURN servers for media relay) in your Node.js code because OpenAI's Realtime API handles the media termination. Your server acts purely as the authenticated bridge for the handshake.

---

## 2. How are OpenAI services being called?

There are two distinct ways OpenAI services are used in this codebase:

### A. Realtime Audio/Voice (WebRTC)
*   **File**: `src/services/openaiService.ts`
*   **Method**: `createRealtimeCallAnswer`
*   **Flow**:
    1.  The function constructs a `FormData` object containing the SDP offer and session configuration (instructions, voice, turn detection settings).
    2.  It sends a `POST` request to `https://api.openai.com/v1/realtime/calls`.
    3.  **Authentication**: It uses the `OPENAI_API_KEY` from your environment variables.
    4.  **Response**: OpenAI returns an SDP Answer, which your server passes back to the client to complete the WebRTC handshake.

### B. Memory Summarization (Chat Completion)
*   **File**: `src/services/memoryService.ts`
*   **Method**: `summarizeTurns`
*   **Flow**:
    1.  At the end of a session, the server retrieves the conversation transcript (`turns`).
    2.  It constructs a prompt for `gpt-4o-mini` (or the configured `OPENAI_SUMMARY_MODEL`).
    3.  It sends a `POST` request to `https://api.openai.com/v1/chat/completions`.
    4.  **Prompt**: The system prompt instructs OpenAI to "Return strict JSON with keys: summaryShort, factsExtracted, topics."
    5.  **Result**: The JSON response is parsed and used to update the user's long-term memory.

---

## 3. How is memory getting saved?

Memory management acts as a cycle of **Retrieving (Seeding)** and **Saving (Summarizing)**.

### A. Saving Memory (The "Write" Path)
This happens in `src/services/memoryService.ts` inside the `finalizeSessionMemory` method, triggered by the `/v1/usage/finish` or `/v1/session/finalize-memory` endpoints.

1.  **Retrieve Transcript**: The code fetches the last 120 turns of conversation from Firestore (`repo.listSessionTurns`).
2.  **AI Summarization**: It calls OpenAI (as described above) to extract:
    *   `summaryShort`: A brief recap of the session.
    *   `factsExtracted`: Specific details about the user (e.g., "User is anxious about exams").
    *   `topics`: Key themes discussed.
3.  **Persist Summary**: A `SessionSummary` record is created in Firestore.
4.  **Merge into User Profile**: The `mergeUserMemory` method updates the user's core document:
    *   **Stable Facts**: New facts are added to the user's long-term `stableFacts` list (deduplicated, max 20 items).
    *   **Episodic Memory**: The session summary is added to `episodicRecent` (keeping the last 6 sessions).

### B. Loading Memory (The "Read" Path)
When a new session starts (in `/v1/realtime/session` or `/v1/webrtc/offer`), `buildSessionMemorySeed` is called.

1.  It fetches the user's `stableFacts` and `episodicRecent` history.
2.  It constructs a textual **Context String** (e.g., "User name: Rahul. Profile facts: User likes meditation. Recent memory: Discussed stress relief...").
3.  This context string is injected into the **System Instructions** sent to OpenAI's Realtime API, so the AI "remembers" the user instantly.

---

## 4. How does the entire calling function work?

The lifecycle of a call follows this specific sequence of API endpoints in `src/routes/v1.ts`:

### Step 1: Session Initialization (`POST /v1/realtime/session`)
*   **Client**: Requests to start a session.
*   **Server**:
    *   Checks if the user has a valid subscription/quota.
    *   Generates a unique `sessionId`.
    *   Retrieves the **Memory Seed** (previous context).
    *   Returns the `sessionId` and `memoryContext` to the client.

### Step 2: WebRTC Handshake (`POST /v1/webrtc/offer`)
*   **Client**: Generates an SDP Offer locally and sends it to this endpoint.
*   **Server**:
    *   Validates the session.
    *   Calls `openAiService.createRealtimeCallAnswer(offer, memoryContext)`.
    *   Forwards the offer to OpenAI.
    *   Receives OpenAI's answer.
*   **Client**: Receives the answer and establishes the direct audio connection with OpenAI.

### Step 3: The Conversation (Realtime)
*   Audio streams directly between Client <-> OpenAI.
*   **Parallel**: The client sends text transcripts of what is being said to `POST /v1/session/turn`.
*   **Server**: Saves these turns to Firestore for memory purposes (OpenAI doesn't store this for you in a way you can easily query later, so you self-host the transcript).

### Step 4: Session End (`POST /v1/usage/finish`)
*   **Client**: Reports that the call has ended (or server detects timeout).
*   **Server**:
    *   Calculates usage duration and updates billing/quota.
    *   Triggers **Memory Finalization** (Summarization process described in #3).
    *   Updates the user's long-term memory with new facts found in this session.

This architecture ensures you have full control over the user's data and memory while leveraging OpenAI's powerful realtime audio capabilities.
