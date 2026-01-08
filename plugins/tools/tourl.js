import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
import axios from 'axios'
import ffmpeg from 'fluent-ffmpeg'
import crypto from 'crypto'
import { fileTypeFromBuffer } from 'file-type'

function unwrapMessage(m) {
  let n = m
  while (
    n?.viewOnceMessage?.message ||
    n?.viewOnceMessageV2?.message ||
    n?.viewOnceMessageV2Extension?.message ||
    n?.ephemeralMessage?.message
  ) {
    n =
      n.viewOnceMessage?.message ||
      n.viewOnceMessageV2?.message ||
      n.viewOnceMessageV2Extension?.message ||
      n.ephemeralMessage?.message
  }
  return n
}

function ensureWA(wa, conn) {
  if (wa?.downloadContentFromMessage) return wa
  if (conn?.wa?.downloadContentFromMessage) return conn.wa
  if (global.wa?.downloadContentFromMessage) return global.wa
  return null
}

function extFromMime(mime, fallback = 'bin') {
  if (!mime) return fallback
  const m = mime.toLowerCase()
  if (m.includes('image/')) return 'jpg'
  if (m.includes('video/')) return 'mp4'
  if (m.includes('audio/')) return 'mp3'
  if (m.includes('pdf')) return 'pdf'
  return fallback
}

async function uploadToCatbox(filePath) {
  const buffer = await fs.promises.readFile(filePath)
  const { ext, mime } = await fileTypeFromBuffer(buffer) || {}
  const random = crypto.randomBytes(5).toString('hex')
  const filename = `${random}.${ext || 'bin'}`

  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', buffer, {
    filename,
    contentType: mime || 'application/octet-stream'
  })

  const res = await axios.post(
    'https://catbox.moe/user/api.php',
    form,
    {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }
  )

  if (!res.data) throw new Error('Catbox no devolvió URL')
  return res.data.trim()
}

let handler = async (msg, { conn, command, wa }) => {
  const chatId = msg.key.remoteJid
  const pref = global.prefixes?.[0] || '.'

  const ctx = msg.message?.extendedTextMessage?.contextInfo
  const rawQuoted = ctx?.quotedMessage
  const quoted = rawQuoted ? unwrapMessage(rawQuoted) : null

  if (!quoted) {
    return conn.sendMessage(
      chatId,
      { text: `✳️ Usa:\n${pref}${command}\nResponde a una imagen, video, sticker o audio` },
      { quoted: msg }
    )
  }

  await conn.sendMessage(chatId, { react: { text: '☁️', key: msg.key } })

  let rawPath
  let finalPath

  try {
    let type
    let media

    if (quoted.imageMessage) {
      type = 'image'
      media = quoted.imageMessage
    } else if (quoted.videoMessage) {
      type = 'video'
      media = quoted.videoMessage
    } else if (quoted.stickerMessage) {
      type = 'sticker'
      media = quoted.stickerMessage
    } else if (quoted.audioMessage) {
      type = 'audio'
      media = quoted.audioMessage
    } else {
      throw new Error('Tipo no permitido')
    }

    const WA = ensureWA(wa, conn)
    if (!WA) throw new Error('Baileys no disponible')

    const tmpDir = path.join(path.dirname(new URL(import.meta.url).pathname), 'tmp')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

    const ext = type === 'sticker' ? 'webp' : extFromMime(media.mimetype)
    rawPath = path.join(tmpDir, `${Date.now()}.${ext}`)

    const stream = await WA.downloadContentFromMessage(
      media,
      type === 'sticker' ? 'sticker' : type
    )

    const ws = fs.createWriteStream(rawPath)
    for await (const chunk of stream) ws.write(chunk)
    ws.end()
    await new Promise(r => ws.on('finish', r))

    const size = fs.statSync(rawPath).size
    if (size > 200 * 1024 * 1024) throw new Error('Archivo supera 200MB')

    finalPath = rawPath

    if (type === 'audio' && ext !== 'mp3') {
      finalPath = path.join(tmpDir, `${Date.now()}_audio.mp3`)
      await new Promise((res, rej) => {
        ffmpeg(rawPath)
          .audioCodec('libmp3lame')
          .toFormat('mp3')
          .on('end', res)
          .on('error', rej)
          .save(finalPath)
      })
      fs.unlinkSync(rawPath)
    }

    const url = await uploadToCatbox(finalPath)

    await conn.sendMessage(
      chatId,
      { text: `✅ Archivo subido a Catbox\n\n${url}` },
      { quoted: msg }
    )

    await conn.sendMessage(chatId, { react: { text: '✅', key: msg.key } })

  } catch (e) {
    await conn.sendMessage(
      chatId,
      { text: `❌ Error\n${e.message}` },
      { quoted: msg }
    )
    await conn.sendMessage(chatId, { react: { text: '❌', key: msg.key } })
  } finally {
    try { if (rawPath) fs.unlinkSync(rawPath) } catch {}
    try { if (finalPath && finalPath !== rawPath) fs.unlinkSync(finalPath) } catch {}
  }
}

handler.command = ['tourl']
handler.help = ['tourl']
handler.tags = ['herramientas']

export default handler