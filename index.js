//////////////////////////////////////////
//////////////// LOGGING /////////////////
//////////////////////////////////////////
function getCurrentDateString() {
    return (new Date()).toISOString() + ' ::';
};
__originalLog = console.log;
console.log = function () {
    var args = [].slice.call(arguments);
    __originalLog.apply(console.log, [getCurrentDateString()].concat(args));
};
//////////////////////////////////////////
//////////////////////////////////////////
const fs = require('fs');
const util = require('util');
const request = require('request');
const { Readable } = require('stream');
//////////////////////////////////////////
///////////////// VARIA //////////////////
//////////////////////////////////////////
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function convert_audio(input) {
    try {
        // stereo to mono channel
        const data = new Int16Array(input)
        const ndata = new Int16Array(data.length/2)
        for (let i = 0, j = 0; i < data.length; i+=4) {
            ndata[j++] = data[i]
            ndata[j++] = data[i+1]
        }
        return Buffer.from(ndata);
    } catch (e) {
        console.log(e)
        console.log('convert_audio: ' + e)
        throw e;
    }
}


//////////////////////////////////////////
//////////////// CONFIG //////////////////
//////////////////////////////////////////

const SETTINGS_FILE = 'settings.json';

let DISCORD_TOK = null;
let WITAPIKEY = null; 

function loadConfig() {
    if (fs.existsSync(SETTINGS_FILE)) {
        const CFG_DATA = JSON.parse( fs.readFileSync(SETTINGS_FILE, 'utf8') );
        DISCORD_TOK = CFG_DATA.discord_token;
        WITAPIKEY = CFG_DATA.wit_ai_token;

    } else {
        DISCORD_TOK = process.env.DISCORD_TOK;
        WITAPIKEY = process.env.WITAPIKEY;
    }
    if (!DISCORD_TOK || !WITAPIKEY)
        throw 'failed loading config #113 missing keys!'
    
}
loadConfig()


const https = require('https')
function listWitAIApps(cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps?offset=0&limit=100',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAPIKEY,
      },
    }

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })

    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.end()
}
function updateWitAIAppLang(appID, lang, cb) {
    const options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/apps/' + appID,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+WITAPIKEY,
      },
    }
    const data = JSON.stringify({
      lang
    })

    const req = https.request(options, (res) => {
      res.setEncoding('utf8');
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      });
      res.on('end',function() {
        cb(JSON.parse(body))
      })
    })
    req.on('error', (error) => {
      console.error(error)
      cb(null)
    })
    req.write(data)
    req.end()
}

//////////////////////////////////////////
////////// DISCORD ///////////////////////
//////////////////////////////////////////
const Discord = require('discord.js')
const discordClient = new Discord.Client()
discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user.tag}!`)
})
discordClient.login(DISCORD_TOK)

const PREFIX = '+';
const _CMD_HELP        = PREFIX + 'help';
const _CMD_SETUP        = PREFIX + 'setup';
const _CMD_JOIN        = PREFIX + 'join';
const _CMD_LEAVE       = PREFIX + 'leave';
const _CMD_DEBUG       = PREFIX + 'debug';
const _CMD_TEST        = PREFIX + 'hello';
const _CMD_LANG        = PREFIX + 'lang';

const guildMap = new Map();

discordClient.on('message', async (msg) => {
    try {
        if (!('guild' in msg) || !msg.guild) return; // prevent private messages to bot
        const mapKey = msg.guild.id;
        
        if (msg.content.trim().toLowerCase() == _CMD_SETUP) {
                msg.guild.channels.create('CheaterBot', {type: 'category'})
                msg.guild.channels.create('AnswerKey', {type: 'text'})
                .then((channel) => {
                    let category = msg.guild.channels.cache.find(c => c.name == "CheaterBot" && c.type == "category");

                    if (!category) throw new Error("Category channel does not exist");
                    channel.setParent(category.id);
                }).catch(console.error);
                msg.reply('**Created new Text Channel for cheating**')
                msg.guild.channels.create('AnswerRecord', {type: 'voice'})
                .then((channel) => {
                    let category = msg.guild.channels.cache.find(c => c.name == "CheaterBot" && c.type == "category");

                    if (!category) throw new Error("Category channel does not exist");
                    channel.setParent(category.id);
                }).catch(console.error);
                msg.reply('**Created new Voice Channel for cheating**')
        } else if (msg.content.trim().toLowerCase() == _CMD_JOIN) {
            if (!msg.member.voice.channelID) {
                msg.reply('Error: please join a voice channel first.')
            } else {
                if (!guildMap.has(mapKey))
                    await connect(msg, mapKey)
                else
                    msg.reply('Already connected')
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_LEAVE) {
            if (guildMap.has(mapKey)) {
                let val = guildMap.get(mapKey);
                if (val.voice_Channel) val.voice_Channel.leave()
                if (val.voice_Connection) val.voice_Connection.disconnect()
                if (val.musicYTStream) val.musicYTStream.destroy()
                    guildMap.delete(mapKey)
                msg.reply("Disconnected.")
            } else {
                msg.reply("Cannot leave because not connected.")
            }
        } else if (msg.content.trim().toLowerCase() == _CMD_HELP) {
            msg.reply(getHelpString());
        }
        else if (msg.content.trim().toLowerCase() == _CMD_DEBUG) {
            console.log('toggling debug mode')
            let val = guildMap.get(mapKey);
            if (val.debug)
                val.debug = false;
            else
                val.debug = true;
        }
        else if (msg.content.trim().toLowerCase() == _CMD_TEST) {
            msg.reply('hello back =)')
        }
        else if (msg.content.split('\n')[0].split(' ')[0].trim().toLowerCase() == _CMD_LANG) {
            const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
            listWitAIApps(data => {
              if (!data.length)
                return msg.reply('no apps found! :(')
              for (const x of data) {
                updateWitAIAppLang(x.id, lang, data => {
                  if ('success' in data)
                    msg.reply('success!')
                  else if ('error' in data && data.error !== 'Access token does not match')
                    msg.reply('Error: ' + data.error)
                })
              }
            })
        }
    } catch (e) {
        console.log('discordClient message: ' + e)
        msg.reply('Error#180: Something went wrong, try again or contact the developers if this keeps happening.');
    }
})

function getHelpString() {
    let out = '\n**VOICE COMMANDS:**\n'
        out += '```'
        out += 'Strictly use the given format:\n[WITHIN 20s]\n "The question is (initials of question) the answer is (initials of answer)" \n'
        out += '```'

        out += '**TEXT COMMANDS:**\n'
        out += '```'
        out += _CMD_HELP + ' - command help\n'
        out += _CMD_SETUP + ' - setup voice and text channel for bot\n'
        out += _CMD_JOIN + '/' + _CMD_LEAVE + ' - join/leave voice channel\n'
        out += '```'
    return out;
}

async function connect(msg, mapKey) {
    try {
        let voice_Channel = await discordClient.channels.fetch(msg.member.voice.channelID);
        if (!voice_Channel) return msg.reply("Error: The voice channel does not exist!");
        let text_Channel = await discordClient.channels.fetch(msg.channel.id);
        if (!text_Channel) return msg.reply("Error: The text channel does not exist!");
        let voice_Connection = await voice_Channel.join();
        voice_Connection.play('sound.mp3', { volume: 0.5 });
        guildMap.set(mapKey, {
            'text_Channel': text_Channel,
            'voice_Channel': voice_Channel,
            'voice_Connection': voice_Connection,
            'debug': false,
        });
        speak_impl(voice_Connection, mapKey)
        voice_Connection.on('disconnect', async(e) => {
            if (e) console.log(e);
            guildMap.delete(mapKey);
        })
        msg.reply('connected!')
    } catch (e) {
        console.log('connect: ' + e)
        msg.reply('Error: unable to join your voice channel.');
        throw e;
    }
}

function speak_impl(voice_Connection, mapKey) {
    voice_Connection.on('speaking', async (user, speaking) => {
        if (speaking.bitfield == 0 || user.bot) {
            return
        }
        console.log(`I'm listening to ${user.username}`)
        // this creates a 16-bit signed PCM, stereo 48KHz stream
        const audioStream = voice_Connection.receiver.createStream(user, { mode: 'pcm' })
        audioStream.on('error',  (e) => { 
            console.log('audioStream: ' + e)
        });
        let buffer = [];
        audioStream.on('data', (data) => {
            buffer.push(data)
        })
        audioStream.on('end', async () => {
            buffer = Buffer.concat(buffer)
            const duration = buffer.length / 48000 / 4;
            console.log("duration: " + duration)

            if (duration < 1.0 || duration > 19) { // 20 seconds max dur
                console.log("TOO SHORT / TOO LONG; SKPPING")
                return;
            }

            try {
                let new_buffer = await convert_audio(buffer)
                var out = await transcribe(new_buffer);
                const val = guildMap.get(mapKey);
                val.text_Channel.send('```Question:' + out.question + '\nAnswer:' + out.answer + '```')
            } catch (e) {
                console.log('tmpraw rename: ' + e)
            }


        })
    })
}

//////////////////////////////////////////
//////////////// SPEECH //////////////////
//////////////////////////////////////////
async function transcribe(buffer) {

  return transcribe_witai(buffer)
}

let witAI_lastcallTS = null;
const witClient = require('node-witai-speech');
async function transcribe_witai(buffer) {
    try {
        // ensure we do not send more than one request per second
        if (witAI_lastcallTS != null) {
            let now = Math.floor(new Date());    
            while (now - witAI_lastcallTS < 1000) {
                console.log('sleep')
                await sleep(100);
                now = Math.floor(new Date());
            }
        }
    } catch (e) {
        console.log('transcribe_witai 837:' + e)
    }

    try {
        console.log('transcribe_witai')
        const extractSpeechIntent = util.promisify(witClient.extractSpeechIntent);
        var stream = Readable.from(buffer);
        const contenttype = "audio/raw;encoding=signed-integer;bits=16;rate=48k;endian=little"
        const output = await extractSpeechIntent(WITAPIKEY, stream, contenttype, options='verbose')
        var result = {
            question: output['entities']['question_body:question_body'][0]['body'],
            answer: output['entities']['answer_body:answer_body'][0]['body']
        }
        witAI_lastcallTS = Math.floor(new Date());
        console.log(output)
        stream.destroy()
        if (output && '_text' in output && output._text.length)
            return result
        if (output && 'text' in output && output.text.length)
            return result
        return result;         
    } catch (e) { console.log('transcribe_witai 851:' + e); console.log(e) }
}