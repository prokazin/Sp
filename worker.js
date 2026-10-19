// ============================================================
// АВТОПОСТИНГ И ОТВЕТЫ НА КОММЕНТАРИИ (CLOUDFLARE WORKERS AI)
// ============================================================

export default {
  // 1. Блок расписания (Cron Trigger)
  async scheduled(event, env, ctx) {
    const now = new Date();
    const hour = now.getUTCHours(); 
    
    let postType = '';
    if (hour === 5) postType = 'text';
    else if (hour === 10) postType = 'poll';
    else if (hour === 15) postType = 'joke';
    else if (hour === 18) postType = 'text';
    else return; 
    
    ctx.waitUntil(generateAndPost(env, postType));
  },
  
  // 2. Блок для приема запросов
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // ЗАЩИТА ОТ СПАМА: Пост отправится только если в ссылке есть ?test=true
    if (request.method === 'GET') {
      if (url.searchParams.get('test') === 'true') {
        try {
          await generateAndPost(env, 'text');
          return new Response("Тестовый пост успешно отправлен!", { status: 200 });
        } catch (e) {
          return new Response("Ошибка: " + e.message, { status: 500 });
        }
      }
      return new Response("Бот работает в фоновом режиме. Для теста добавь в ссылку ?test=true", { status: 200 });
    }
    
    // Обработка комментариев от Telegram
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        
        if (update.message && update.message.text && !update.message.from.is_bot) {
          const text = update.message.text;
          const userName = update.message.from.first_name;
          const chatId = update.message.chat.id;
          const messageId = update.message.message_id;
          
          ctx.waitUntil(generateReply(env, text, userName, chatId, messageId));
        }
      } catch (e) {
        console.log("Ошибка при чтении вебхука:", e);
      }
      return new Response("OK", { status: 200 });
    }
    
    return new Response("Not Found", { status: 404 });
  }
};

// ============================================================
// ФУНКЦИЯ ГЕНЕРАЦИИ ПОСТОВ В КАНАЛ
// ============================================================
async function generateAndPost(env, postType) {
  // ==========================================================
  // ВНИМАНИЕ! ВСТАВЬ СВОИ ДАННЫЕ В ДВЕ СТРОКИ НИЖЕ:
  // ==========================================================
  const TELEGRAM_BOT_TOKEN = "8937064578:AAHuY-2CIFWOyhhkReIPmp98e3d4gw_-wTU";
  const TELEGRAM_CHANNEL_ID = "-1004389745995";
  // ==========================================================

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
  
  // Запрос к актуальной модели Cloudflare Workers AI
  const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: "system", content: `Ты — админ канала "Южный Парк". Ты дерзкий, используешь черный юмор. 
ОТВЕЧАЙ СТРОГО НА РУССКОМ ЯЗЫКЕ. Верни ответ СТРОГО в JSON-формате: {"quote": "..."} или {"question": "...", "options": [...]}.` },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });
  
  // Безопасное извлечение JSON
  const rawResponse = aiResponse.response;
  if (!rawResponse) throw new Error("Пустой ответ от ИИ: " + JSON.stringify(aiResponse));
  
  let content;
  if (typeof rawResponse === 'object' && rawResponse !== null) {
    content = rawResponse; 
  } else {
    const jsonMatch = String(rawResponse).match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Не удалось найти JSON в ответе: " + rawResponse);
    content = JSON.parse(jsonMatch[0]);
  }
  
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
  // ==========================================================
  // ВНИМАНИЕ! ВСТАВЬ СВОЙ ТОКЕН БОТА И ТУТ ТОЖЕ:
  // ==========================================================
  const TELEGRAM_BOT_TOKEN = "8937064578:AAHuY-2CIFWOyhhkReIPmp98e3d4gw_-wTU";
  // ==========================================================
  const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  const characters = ["Эрик Картман", "Кенни Маккормик", "Стэн Марш", "Кайл Брофловски", "Баттерс Стотч", "Рэнди Марш", "Мистер Гаррисон", "Шеф"];
  const chosenCharacter = characters[Math.floor(Math.random() * characters.length)];

  const prompt = `Пользователь по имени ${userName} написал комментарий: "${userComment}".
Ответь ему от лица персонажа: ${chosenCharacter}. 
Ответ должен быть остроумным, по делу, в стиле персонажа (1-3 предложения).
Верни СТРОГО JSON: {"reply": "текст твоего ответа"}`;

  const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: "system", content: `Ты — персонаж из "Южного Парка". Отвечай коротко, дерзко, но по смыслу комментария. 
ОТВЕЧАЙ СТРОГО НА РУССКОМ ЯЗЫКЕ. Верни СТРОГО JSON: {"reply": "..."}.` },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });

  const rawResponse = aiResponse.response;
  if (!rawResponse) return;
  
  let content;
  if (typeof rawResponse === 'object' && rawResponse !== null) {
    content = rawResponse;
  } else {
    const jsonMatch = String(rawResponse).match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    content = JSON.parse(jsonMatch[0]);
  }
  
  const formattedReply = `<b>${chosenCharacter}:</b>\n<blockquote>${content.reply}</blockquote>`;

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
