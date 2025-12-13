const urlRegex = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z]{2,})+(?:\/[^\s]*)?/gi
const channelRegex = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/[0-9A-Za-z]{20,24}/i
const groupInviteRegex = /(?:https?:\/\/)?chat\.whatsapp\.com\/[0-9A-Za-z]{20,24}/i

const allowedDomains = new Set([
  'instagram.com',
  'ig.me'
])

const shorteners = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'shorturl.at',
  'goo.gl',
  'rebrand.ly',
  'is.gd',
  'cutt.ly',
  'linktr.ee',
  'shrtco.de'
])

function normalize(text = '') {
  return text
    .toLowerCase()
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, '')
    .replace(/[()\[\]{}<>]/g, '')
}

function extractDomain(link = '') {
  try {
    if (!/^https?:\/\//.test(link)) link = 'https://' + link
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export async function before(m, { conn, isAdmin }) {
  try {
    if (m.fromMe || m.isBaileys) return true
    if (!m.isGroup) return false

    const chat = global.db.data.chats[m.chat]
    if (!chat?.antiLink) return true
    if (isAdmin) return true

    const body = normalize(m.text || '')
    if (!body) return true

    const links = body.match(urlRegex) || []
    const hasChannel = channelRegex.test(body)

    if (!links.length && !hasChannel) return true

    let groupCode = ''
    try {
      groupCode = await conn.groupInviteCode(m.chat)
    } catch {}

    let violation = false

    for (const raw of links) {
      const domain = extractDomain(raw)
      if (!domain) continue

      if (
        groupCode &&
        groupInviteRegex.test(raw) &&
        raw.includes(groupCode)
      ) continue

      if (allowedDomains.has(domain) || [...allowedDomains].some(d => domain.endsWith(d))) {
        continue
      }

      if (shorteners.has(domain)) {
        violation = true
        break
      }

      violation = true
      break
    }

    if (hasChannel) violation = true

    if (!violation) return true

    await conn.sendMessage(m.chat, { delete: m.key }).catch(() => {})

    await conn.sendMessage(
      m.chat,
      {
        text: `🚫 Links no permitidos\n@${m.sender.split('@')[0]}`,
        mentions: [m.sender]
      }
    ).catch(() => {})

  } catch (e) {
    console.error('AntiLink error:', e)
  }

  return true
}