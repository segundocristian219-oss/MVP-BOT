import { watchFile, unwatchFile } from 'fs'
import chalk from 'chalk'
import { fileURLToPath } from 'url'

global.owner = [
'217158512549931', 
'240621851824139',
'213834207887375', 
'128209823764660'
] 

global.mods = []
global.prems = []

global.emoji = '📎'
global.emoji2 = '🏞️'
global.namebot = '𝐌𝐕𝐏 𝐁𝐎𝐓'
global.botname = '𝐌𝐕𝐏 𝐁𝐎𝐓'
global.banner = 'https://files.catbox.moe/xvhvvy.jpg'
global.packname = '𝐌𝐕𝐏 𝐁𝐎𝐓'
global.author = '𝖣𝖾𝗌𝖺𝗋𝗅𝗅𝖺𝖽𝗈 𝗉𝗈𝗋 HERNANDEZ'
global.sessions = 'SHADOW BOT'

global.APIs = {
sky: 'https://api-sky.ultraplus.click',
may: 'https://mayapi.ooguy.com'
}

global.APIKeys = {
sky: 'Angxlllll',
may: 'may-0595dca2'
}

const file = fileURLToPath(import.meta.url)
watchFile(file, () => {
unwatchFile(file)
console.log(chalk.redBright("Se actualizó el 'config.js'"))
import(`file://${file}?update=${Date.now()}`)
})