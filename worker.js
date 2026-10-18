// ============================================================
// АВТОПОСТИНГ И ОТВЕТЫ НА КОММЕНТАРИИ (TELEGRAM-КАНАЛ "ЮЖНЫЙ ПАРК")
// ============================================================

export default {
  // 1. Блок расписания (Cron Trigger)
  async scheduled(event, env, ctx) {
    const now = new Date();
    const hour = now.getUTCHours(); 
    
    let postType = '';
    if (hour >= 5 && hour < 8) postType = 'text';
    else if (hour >= 10 && hour < 13) postType = 'poll';
    else if (hour >= 15 && hour < 18) postType = 'joke';
    else if (hour >= 18 && hour < 21) postType = 'text';
    else return; 
    
    ctx.waitUntil(generateAndPost(env, postType));
  },
  
  // 2. Блок для приема запросов (Тесты из браузера и Комментарии из Telegram)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Если ты просто открыл ссылку в браузере (GET) — отправляем тестовый пост в канал
    if (request.method === 'GET') {
      try {
        await generateAndPost(env, 'text');
        return new Response("Тестовый пост успешно отправлен! Проверь канал.", { status: 200 });
      } catch (e) {
        return new Response("Ошибка: " + e.message, { status: 500 });
      }
    }
    
    // Если Telegram прислал обновление (POST) — значит, кто-то написал комментарий
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        
        // Проверяем: есть ли текст, и не написал ли это сам бот (чтобы не было вечного цикла)
        if (update.message && update.message.text && !update.message.from.is_bot) {
          const text = update.message.text;
          const userName = update.message.from.first_name;
          const chatId = update.message.chat.id;
          const messageId = update.message.message_id;
          
          // Отвечаем в фоне, чтобы Telegram не ждал
          ctx.waitUntil(generateReply(env, text, userName, chatId, messageId));
        }
      } catch (e) {
        console.log("Ошибка при чтении вебхука:", e);
      }
      
      // Telegram всегда ждет ответ 200 OK, иначе он будет присылать уведомление снова
      return new Response("OK", { status: 200 });
    }
    
    return new Response("Not Found", { status: 404 });
  }
};

// ============================================================
// ФУНКЦИЯ ГЕНЕРАЦИИ ПОСТОВ В КАНАЛ
// ============================================================
async function generateAndPost(env, postType) {
  const TELEGRAM_BOT_TOKEN = "8937064578:AAHuY-2CIFWOyhhkReIPmp98e3d4gw_-wTU";
  const TELEGRAM_CHANNEL_ID = "-1004389745995";
  const GROQ_API_KEY = "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";

  const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  
  const characters = ["Эрик Картман", "Кенни Маккормик", "Стэн Марш", "Кайл Брофловски", "Баттерс Стотч", "Рэнди Марш", "Мистер Гаррисон", "Шеф"];
  const chosenCharacter = characters[Math.floor(Math.random() * characters.length)];
  
  let prompt = "";
  if (postType === 'poll') {
    prompt = `Придумай смешной, провокационный вопрос для опроса. Варианты ответов — от 2 до 4, короткие. Верни СТРОГО JSON: {"question": "...", "options": ["...", "..."]}`;
  } else if (postType === 'joke') {
    prompt = `Напиши дерзкую мысль или шутку от лица персонажа: ${chosenCharacter}. 1-2 предложения. Верни СТРОГО JSON: {"quote": "..."}`;
  } else {
    prompt = `Напиши короткую мысль-подводку от лица персонажа: ${chosenCharacter}. 1-2 предложения. Верни СТРОГО JSON: {"quote": "..."}`;
  }
  
  const groqResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://t.me/south_parksp",
      "X-Title": "South Park Bot"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [
        { role: "system", content: `Ты — админ канала0 "Южный Парк". Ты]. дерзmessageкий,.content используешь черный юмор. 
В);
ерни ответ СТРОГО в JSON-формате: {"quote": "..."} или {"question": "...", "options": [...]}.` },
        { role: "user", content: prompt }
      ],
      temperature: 0.9,
      response_format: { type: "json_object" }
    })
  });
  
  const groqData = await groqResponse.json();
  if (!groqData.choices) throw new Error("Ошибка OpenRouter: " + JSON.stringify(groqData));
  const content = JSON.parse(groqData.choices[  
  if (postType === 'poll') {
    await fetch(`${TG_API}/sendPoll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHANNEL_ID, question: content.question, options: content.options, is_anonymous: false })
    });
  } else {
    const formattedText = `<b>${chosenCharacter}:</b>\n<blockquote>${content.quote}</blockquote>`;
    await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHANNEL_ID, text: formattedText, parse_mode: "HTML" })
    });
  }
}

// ============================================================
// ФУНКЦИЯ ОТВЕТА НА КОММЕНТАРИИ
// ============================================================
async function generateReply(env, userComment, userName, chatId, replyToMessageId) {
  const TELEGRAM_BOT_TOKEN = "8937064578:AAHuY-2CIFWOyhhkReIPmp98e3d4gw_-wTU";
  const GROQ_API_KEY = "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";
  const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  const characters = ["Эрик Картман", "Кенни Маккормик", "Стэн Марш", "Кайл Брофловски", "Баттерс Стотч", "Рэнди Марш", "Мистер Гаррисон", "Шеф"];
  const chosenCharacter = characters[Math.floor(Math.random() * characters.length)];

  // Просим ИИ адекватно ответить на комментарий
  const prompt = `Пользователь по имени ${userName} написал комментарий: "${userComment}".
Ответь ему от лица персонажа: ${chosenCharacter}. 
Ответ должен быть остроумным, по делу, в стиле персонажа (1-3 предложения). Не пиши банальности.
Верни СТРОГО JSON: {"reply": "текст твоего ответа"}`;

  const groqResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://t.me/south_parksp",
      "X-Title": "South Park Bot"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [
        { role: "system", content: `Ты — персонаж из "Южного Парка". Отвечай коротко, дерзко, но по смыслу комментария. Верни СТРОГО JSON: {"reply": "..."}.` },
        { role: "user", content: prompt }
      ],
      temperature: 0.9,
      response_format: { type: "json_object" }
    })
  });

  const groqData = await groqResponse.json();
  if (!groqData.choices) return; // Если ошибка ИИ, просто молчим

  const content = JSON.parse(groqData.choices[0].message.content);
  
  // Форматируем красивый ответ с упоминанием пользователя
  const formattedReply = `<b>${chosenCharacter}:</b>\n<blockquote>${content.reply}</blockquote>`;

  // Отправляем ответ в группу (reply_to_message_id делает так, чтобы ответ прикрепился к комментарию)
  await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: formattedReply,
      parse_mode: "HTML",
      reply_to_message_id: replyToMessageId
    })
  });
}
