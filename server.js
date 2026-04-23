require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ============================
// MEMORY
// ============================
const sessions = {};

function getSession(id) {
  if (!sessions[id]) {
    sessions[id] = {
      history: [],
      topics: [],
      corrections: 0,
      userName: null,
    };
  }
  return sessions[id];
}

// ============================
// SYSTEM PROMPT (FIXED)
// ============================
function buildSystemPrompt(voice, session) {
  const personas = {
    Maya: "You are Maya, a kind and patient English teacher. You speak gently and clearly.",
    Arjun: "You are Arjun, a confident and cool English mentor. You speak smart and motivating.",
    Zara: "You are Zara, a fun and energetic best friend. You speak casually and playfully.",
    Leo: "You are Leo, a high-energy hype buddy. You speak with excitement and motivation."
  };

  return `${personas[voice]}

You help users practice English conversation.

STRICT RULES:
- Reply in 2 short sentences
- Always ask 1 question
- Keep tone matching your personality
- If mistake → give correction

IMPORTANT:
Return ONLY JSON:

{
  "reply": "...",
  "correction": null,
  "topic": "general",
  "memory_note": null,
  "userName": null
}`;
}

// ============================
// GROQ CALL
// ============================
async function callGroq(systemPrompt, history, message) {
  const messages = [{ role: "system", content: systemPrompt }];

  history.slice(-10).forEach(h => {
    messages.push({ role: h.role, content: h.content });
  });

  messages.push({ role: "user", content: message });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(data);
    throw new Error("Groq API error");
  }

  return data.choices[0].message.content;
}

// ============================
// SAFE PARSE
// ============================
function parseResponse(text) {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return {
      reply: text,
      correction: null,
      topic: "chat",
      memory_note: null,
      userName: null
    };
  }
}

// ============================
// ROUTES
// ============================
app.post("/api/session/start", (req, res) => {
  const { sessionId, voice } = req.body;

  getSession(sessionId);

  res.json({
    reply: `Hey! I'm ${voice} 😊 What's your name?`,
    correction: null,
    topic: "intro",
    memory_note: null
  });
});

app.post("/api/chat", async (req, res) => {
  const { message, voice, sessionId } = req.body;

  const session = getSession(sessionId);
  const systemPrompt = buildSystemPrompt(voice, session);

  try {
    const raw = await callGroq(systemPrompt, session.history, message);
    const parsed = parseResponse(raw);

    session.history.push({ role: "user", content: message });
    session.history.push({ role: "assistant", content: parsed.reply });

    res.json(parsed);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ============================
// START
// ============================
app.listen(3000, () => {
  console.log("🚀 Running at http://localhost:3000");
});