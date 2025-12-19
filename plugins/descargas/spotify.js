import axios from "axios";

const API_BASE = (process.env.API_BASE || "https://api-sky.ultraplus.click").replace(/\/+$/, "");
const API_KEY  = process.env.API_KEY || "Russellxz";
const MAX_TIMEOUT = 30000;

// Jobs pendientes por ID del mensaje preview
const pendingSPOTIFY = Object.create(null);

async function react(conn, chatId, key, emoji) {
  try { await conn.sendMessage(chatId, { react: { text: emoji, key } }); } catch {}
}

async function getSpotifyMp3(input) {
  const endpoint = `${API_BASE}/spotify`;

  const isUrl = /spotify\.com/i.test(input);
  const body = isUrl ? { url: input } : { query: input };

  const { data: res, status: http } = await axios.post(endpoint, body, {
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: MAX_TIMEOUT,
    validateStatus: () => true,
  });

  let data = res;
  if (typeof data === "string") {
    try { data = JSON.parse(data.trim()); } catch { throw new Error("Respuesta no JSON del servidor"); }
  }

  const ok = data?.status === true || data?.status === "true";
  if (!ok) throw new Error(data?.message || data?.error || `HTTP ${http}`);

  const mp3Url = data.result?.media?.audio;
  if (!mp3Url) throw new Error("No se encontró el MP3");

  const title = data.result?.title || "Spotify Track";
  const artist = data.result?.artist || "Desconocido";
  const image = data.result?.image || null;

  return { mp3Url, title, artist, image };
}

async function sendAudio(conn, job, asDocument, triggerMsg) {
  const { chatId, mp3Url, title, artist, previewKey, quotedBase, image } = job;

  try {
    await react(conn, chatId, triggerMsg.key, asDocument ? "📁" : "🎵");
    await react(conn, chatId, previewKey, "⏳");

    // enviar imagen si existe
    if (image) {
      await conn.sendMessage(chatId, { image: { url: image }, caption: `🎵 ${title}\n🎤 ${artist}` }, { quoted: quotedBase || triggerMsg });
    }

    const caption = asDocument ? undefined : `🎵 ${title}\n🎤 ${artist}`;

    await conn.sendMessage(
      chatId,
      {
        [asDocument ? "document" : "audio"]: { url: mp3Url },
        mimetype: "audio/mpeg",
        fileName: asDocument ? `${safeBaseFromTitle(title)} - ${artist}.mp3` : undefined,
        caption,
      },
      { quoted: quotedBase || triggerMsg }
    );

    await react(conn, chatId, previewKey, "✅");
    await react(conn, chatId, triggerMsg.key, "✅");
  } catch (e) {
    await react(conn, chatId, previewKey, "❌");
    await react(conn, chatId, triggerMsg.key, "❌");
    await conn.sendMessage(
      chatId,
      { text: `❌ Error enviando: ${e?.message || "unknown"}` },
      { quoted: quotedBase || triggerMsg }
    );
  }
}

function safeBaseFromTitle(title) {
  return String(title || "spotify").slice(0, 70).replace(/[^A-Za-z0-9_\-.]+/g, "_");
}

const handler = async (m, { conn, args }) => {
  const chatId = m.key.remoteJid;
  const pref = global.prefixes?.[0] || ".";
  const text = (args.join(" ") || "").trim();

  if (!text) {
    return conn.sendMessage(
      chatId,
      { text: `✳️ Usa:\n${pref}sp <canción o URL>\n\nEjemplo:\n${pref}sp bad bunny tití me preguntó` },
      { quoted: m }
    );
  }

  try {
    await react(conn, chatId, m.key, "⏱️");

    const { mp3Url, title, artist, image } = await getSpotifyMp3(text);

    const caption = `🎵 Spotify — opciones

👍 Enviar audio (reproducible)
❤️ Enviar como documento
— o responde: 1 = audio · 2 = documento

✦ ${title}
✦ por ${artist}`;

    const preview = await conn.sendMessage(chatId, { text: caption }, { quoted: m });

    pendingSPOTIFY[preview.key.id] = {
      chatId,
      mp3Url,
      title,
      artist,
      image,
      quotedBase: m,
      previewKey: preview.key,
      createdAt: Date.now(),
      processing: false,
    };

    await react(conn, chatId, m.key, "✅");

    if (!conn._spotifyInteractiveListener) {
      conn._spotifyInteractiveListener = true;

      conn.ev.on("messages.upsert", async (ev) => {
        for (const msg of ev.messages) {
          try {
            // limpiar jobs viejos (15 min)
            for (const k of Object.keys(pendingSPOTIFY)) {
              if (Date.now() - (pendingSPOTIFY[k]?.createdAt || 0) > 15 * 60 * 1000) delete pendingSPOTIFY[k];
            }

            // --- Reacciones (👍 / ❤️) al preview ---
            if (msg.message?.reactionMessage) {
              const { key: reactKey, text: emoji } = msg.message.reactionMessage;
              const job = pendingSPOTIFY[reactKey.id];
              if (!job || job.chatId !== msg.key.remoteJid) continue;
              if (emoji !== "👍" && emoji !== "❤️") continue;
              if (job.processing) continue;
              job.processing = true;

              const asDoc = emoji === "❤️";
              await sendAudio(conn, job, asDoc, msg);
              delete pendingSPOTIFY[reactKey.id];
            }

            // --- Replies 1/2 citando el preview ---
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const replyTo = ctx?.stanzaId;

            const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();

            if (replyTo && pendingSPOTIFY[replyTo]) {
              const job = pendingSPOTIFY[replyTo];
              if (job.chatId !== msg.key.remoteJid) continue;
              if (body !== "1" && body !== "2") continue;
              if (job.processing) continue;
              job.processing = true;

              const asDoc = body === "2";
              await sendAudio(conn, job, asDoc, msg);
              delete pendingSPOTIFY[replyTo];
            }
          } catch (e) {
            console.error("Spotify listener error:", e?.message || e);
          }
        }
      });
    }

  } catch (err) {
    console.error("❌ Error spotify:", err?.message || err);
    let msgTxt = "❌ Ocurrió un error al procesar la canción de Spotify.";
    const s = String(err?.message || "");
    if (/api key|unauthorized|forbidden|401/i.test(s)) msgTxt = "🔐 API Key inválida o ausente.";
    else if (/timeout|timed out|502|upstream/i.test(s)) msgTxt = "⚠️ Timeout o error del servidor.";

    await conn.sendMessage(chatId, { text: msgTxt }, { quoted: m });
    await react(conn, chatId, m.key, "❌");
  }
};

handler.command = ["spotify", "sp"];
handler.help = ["spotify <canción o url>"];
handler.tags = ["descargas"];
export default handler;