// ============================================================
// АВТОПОСТИНГ И ОТВЕТЫ НА КОММЕНТАРИИ (С ДИАГНОСТИКОЙ)
// ============================================================

export default {
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
  
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (request.method === 'GET') {
      if (url.searchParams.get('test') === 'true') {
        try {
          await generateAndPost(env, 'text');
          return new Response("Тестовый пост успешно отправлен!", { status: 200 });
        } catch (e) {
          return new Response("Ошибка: " + e.message, { status: 500 });
        }
      }
      return new Response("Бот работает. Для теста добавь ?test=true", { status: 200 });
    }
    
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        
        // Логируем полученное сообщение
        console.log("ПОЛУЧЕНО СООБЩЕНИЕ:", JSON.stringify(update));

        // Проверяем, есть ли текст и не от бота ли он
        if (update.message && update.message.text) {
          if (!update.message.from.is_bot && !update.message.is_automatic_forward) {
            const text = update.message.text;
            const userName = update.message.from.first_name || "Друг";
            const chatId = update.message.chat.id;
            const messageId = update.message.message_id;
            
            console.log("ЗАПУСКАЕМ ОТВЕТ ДЛЯ:", userName);
            ctx.waitUntil(generateReply(env, text, userName, chatId, messageId));
          } else {
            console.log("ПРОПУЩЕНО: Это сообщение от бота или автопересылка.");
          }
        } else {
            console.log("ПРОПУЩЕНО: Нет текста в сообщении.");
        }
      } catch (e) {
        console.log("КРИТИЧЕСКАЯ ОШИБКА ВЕБХУКА:", e.message);
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
  const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHANNEL_ID = env.TELEGRAM_CHANNEL_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
      throw new Error("Нет токена или ID канала в настройках Cloudflare!");
  }

  const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  
  const characters = ["Эрик Картман", "Кенни Маккормик", "Стэн Марш", "Кайл Брофловски", "Баттерс Стотч", "Рэнди Марш", "Мистер Гаррисон", "Шеф"];
  const now = new Date();
  const charIndex = (now.getDate() + now.getHours()) % characters.length;
  const chosenCharacter = characters[charIndex];
  
  let prompt = "";
  if (postType === 'poll') {
    prompt = `Придумай смешной, провокационный вопрос для опроса. Варианты ответов — от 2 до 4, короткие. Верни СТРОГО JSON: {"question": "...", "options": ["...", "..."]}`;
  } else if (postType === 'joke') {
    prompt = `Напиши дерзкую мысль или шутку от лица персонажа: ${chosenCharacter}. 1-2 предложения. Верни СТРОГО JSON: {"quote": "..."}`;
  } else {
    prompt = `Напиши короткую мысль-подводку от лица персонажа: ${chosenCharacter}. 1-2 предложения. Верни СТРОГО JSON: {"quote": "..."}`;
  }
  
  const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: "system", content: `Ты — админ канала "Южный Парк". Ты дерзкий, используешь черный юмор. 
ВЕРНИ ОТВЕТ СТРОГО НА РУССКОМ ЯЗЫКЕ. 
Верни ответ СТРОГО в JSON-формате: {"quote": "..."} или {"question": "...", "options": [...]}.` },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });
  
  const rawResponse = aiResponse.response;
  if (!rawResponse) throw new Error("Пустой ответ от ИИ");
  
  let content;
  if (typeof rawResponse === 'object' && rawResponse !== null) {
    content = rawResponse; 
  } else {
    const jsonMatch = String(rawResponse).match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Не удалось найти JSON");
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
  const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) return;

  const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  const characters = ["Эрик Картман", "Кенни Маккормик", "Стэн Марш", "Кайл Брофловски", "Баттерс Стотч", "Рэнди Марш", "Мистер Гаррисон", "Шеф"];
  const chosenCharacter = characters[Math.floor(Math.random() * characters.length)];

  const prompt = `Пользователь по имени ${userName} написал комментарий: "${userComment}".
Ответь ему от лица персонажа: ${chosenCharacter}. 1-3 предложения. Верни СТРОГО JSON: {"reply": "текст"}`;

  console.log("ЗАПРОС К ИИ ДЛЯ ОТВЕТА...");
  
  try {
      const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: "system", content: `Ты — персонаж из "Южного Парка". Отвечай коротко, дерзко, но по смыслу },
. 
    ВЕР         НИ ОТВ {ЕТ СТРОГО НА role РУ:ССКО "М ЯЗЫКЕ. 
    Верни СТРОГО JSON: {"reply": "..."}.`user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      console.log("ОТВЕТ ОТ ИИ ПОЛУЧЕН:", JSON.stringify(aiResponse));

      const rawResponse = aiResponse.response;
      if (!rawResponse) {
          console.log("ОШИБКА: ИИ вернул пустоту.");
          return;
      }
      
      let content;
      if (typeof rawResponse === 'object' && rawResponse !== null) {
        content = rawResponse;
      } else {
        const jsonMatch = String(rawResponse).match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.log("ОШИБКА: Не удалось найти JSON в ответе ИИ.");
            return;
        }
        content = JSON.parse(jsonMatch[0]);
      }
      
      let replyText = content.reply;

      if (!replyText) {
          console.log("ОШИБКА: В JSON нет поля 'reply'.");
          return;
      }

      // 🚨 ЖЕСТКИЙ ФИЛЬТР ОТ СПАМА
      if (replyText.includes('http') || replyText.includes('t.me') || replyText.includes('@') || replyText.toLowerCase().includes('crypto') || replyText.toLowerCase().includes('loot')) {
          replyText = "Я не рекламирую всякое дерьмо. Пиши по делу!";
      }
      
      const formattedReply = `<b>${chosenCharacter}:</b>\n<blockquote>${replyText}</blockquote>`;

      console.log("ОТПРАВЛЯЕМ В TELEGRAM:", formattedReply);

      const tgRes = await fetch(`${TG_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: formattedReply,
          parse_mode: "HTML",
          reply_to_message_id: replyToMessageId
        })
      });

      const tgData = await tgRes.json();
      console.log("ОТВЕТ ОТ TELEGRAM API:", JSON.stringify(tgData));

  } catch (e) {
      console.log("ОШИБКА В ФУНКЦИИ ОТВЕТА:", e.message);
  }
}
