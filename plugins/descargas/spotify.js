"use strict";

import axios from "axios";

// === Config API ===
const API_BASE = (process.env.API_BASE || "https://api-sky.ultraplus.click").replace(/\/+$/, "");
const API_KEY  = process.env.API_KEY || "Russellxz";
const MAX_TIMEOUT = 30000;

async function getSpotifyMp3(input) {
  const endpoint = `${API_BASE}/spotify`;

  const isUrl = /spotify\.com/i.test(input);
  const body = isUrl ? { url: input } : { query: input };

  const { data: res, status: http } = await axios.post(
    endpoint,
    body,
    {
      headers: {
        apikey: API_KEY,
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: MAX_TIMEOUT,
      validateStatus: () => true,
    }
  );

  let data = res;
  if (typeof data === "string") {
    try { data = JSON.parse(data.trim()); }
    catch { throw new Error("Respuesta no JSON del servidor"); }
  }

  const ok = data?.status === true || data?.status === "true";
  if (!ok) throw new Error(data?.message || data?.error || `HTTP ${http}`);

  const mp3Url = data.result?.media?.audio;
  if (!mp3Url) throw new Error("No se encontró el MP3");

  const title  = data.result?.title || "Spotify Track";
  const artist = data.result?.artist || "Desconocido";

  return { mp3Url, title, artist };
}

function safeBaseFromTitle(title) {
  return String(title || "spotify")
    .slice(0, 70)
    .replace(/[^A-Za-z0-9_\-.]+/g, "_");
}

export default async function handler(msg, { conn, args }) {
  const chatId = msg.key.remoteJid;
  const pref = global.prefixes?.[0] || ".";
  const text = (args.join(" ") || "").trim();

  if (!text) {
    return conn.sendMessage(
      chatId,
      {
        text:
`✳️ Usa:
${pref}sp <canción o URL>

Ejemplo:
${pref}sp bad bunny tití me preguntó`
      },
      { quoted: msg }
    );
  }

  try {
    const { mp3Url, title, artist } = await getSpotifyMp3(text);

    await conn.sendMessage(
      chatId,
      {
        audio: { url: mp3Url },
        mimetype: "audio/mpeg",
        fileName: `${safeBaseFromTitle(title)} - ${artist}.mp3`,
        caption: `🎵 ${title}\n👤 ${artist}`
      },
      { quoted: msg }
    );

  } catch (err) {
    console.error("❌ Error spotify:", err?.message || err);

    let msgTxt = "❌ Ocurrió un error al descargar la canción.";
    const s = String(err?.message || "");

    if (/api key|unauthorized|forbidden|401/i.test(s))
      msgTxt = "🔐 API Key inválida o ausente.";
    else if (/timeout|timed out|502|upstream/i.test(s))
      msgTxt = "⚠️ Error o timeout del servidor.";

    await conn.sendMessage(chatId, { text: msgTxt }, { quoted: msg });
  }
}

handler.command = ["spotify", "sp"];
handler.help = ["spotify <canción o url>", "sp <canción o url>"];
handler.tags = ["descargas"];