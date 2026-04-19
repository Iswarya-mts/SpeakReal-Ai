require("dotenv").config();

// ============================================
//   SpeakReal Backend — GROQ API Version
//   Run: node server.js
// ============================================

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ✅ FIX: Use API key from .env
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Model (working one)
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ============================================
// MEMORY STORAGE
// ============================================
const sessions = {};

function getSession(id) {
  if (!sessions[id]) {
    sessions[id] = {
      history: [],
      topics: [],
      corrections: 0,
      userName: null,
      createdAt: new Date(),
    };
  }
  return sessions[id];
}

// ============================================
// SYSTEM PROMPT
// ============================================
function buildSystemPrompt(voice, session) {
  const personas = {
    Maya: "You are Maya, a warm and patient English teacher.",
    Arjun: "You are Arjun, a calm English mentor.",
    Zara: "You are Zara, a fun best friend.",
    Leo: "You are Leo, a hype buddy.",
  };

  const persona = personas[voice] || personas["Maya"];

  return `${persona}

You help users practice English.

RULES:
- Reply in 2–3 short sentences
- Always ask 1 question
- Correct mistakes gently

IMPORTANT:
Return ONLY valid JSON:

{
  "reply": "...",
  "correction": null,
  "topic": "...",
  "memory_note": null,
  "userName": null
}`;
}

// ============================================
// CALL GROQ API
// ============================================
async function callGroq(systemPrompt, history, message) {
  const messages = [{ role: "system", content: systemPrompt }];

  history.slice(-16).forEach(h => {
    messages.push({ role: h.role, content: h.content });
  });

  messages.push({ role: "user", content: message });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 300,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Groq Error:", data);
    throw new Error(data?.error?.message || "Groq API error");
  }

  return data.choices[0]?.message?.content || "";
}

// ============================================
// SAFE PARSER
// ============================================
function parseResponse(text) {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return {
      reply: text || "Tell me again 😊",
      correction: null,
      topic: "chat",
      memory_note: null,
      userName: null,
    };
  }
}

// ============================================
// TEST ROUTE
// ============================================
app.get("/api/test", (req, res) => {
  res.json({ status: "Server working 🚀" });
});

// ============================================
// SESSION START
// ============================================
app.post("/api/session/start", (req, res) => {
  const { sessionId, voice } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId required" });
  }

  getSession(sessionId);

  res.json({
    reply: `Hey! I'm ${voice || "Maya"} 😊 What's your name?`,
    correction: null,
    topic: "intro",
    memory_note: null,
  });
});

// ============================================
// CHAT API
// ============================================
app.post("/api/chat", async (req, res) => {
  const { message, voice, sessionId } = req.body;

  if (!message || !sessionId) {
    return res.status(400).json({ error: "message & sessionId required" });
  }

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "API key missing" });
  }

  const session = getSession(sessionId);
  const systemPrompt = buildSystemPrompt(voice, session);

  try {
    const raw = await callGroq(systemPrompt, session.history, message);
    const parsed = parseResponse(raw);

    session.history.push({ role: "user", content: message });
    session.history.push({ role: "assistant", content: parsed.reply });

    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    res.json(parsed);

  } catch (err) {
    console.error("❌ ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// START SERVER
// ============================================
const PORT = 3000;

app.listen(PORT, () => {
  console.log(`🚀 Running at http://localhost:${PORT}`);
});