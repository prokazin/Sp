// ============================================================
// АВТОПОСТИНГ С РУБРИКАМИ (CLOUDFLARE WORKERS AI)
// ============================================================

// Список картинок для мемов (можно расширять)
const MEME_IMAGES = [
  "https://i.imgflip.com/5gmxqp.jpg",
  "https://i.imgflip.com/5f7zzm.jpg",
  "https://i.imgflip.com/7zqj6m.jpg",
  "https://i.imgflip.com/6b5p3d.jpg",
  "https://i.imgflip.com/5t1w2r.jpg"
];

// Пул вопросов для викторины (можно расширять)
const QUIZ_QUESTIONS = [
  { q: "Какой бизнес открывал Рэнди Марш?", a: ["Пивные бары в детских садах", "Ферму по выращиванию травы", "Ресторан здоровой еды", "Школу луксмаксинга"], c: 0 },
  { q: "Кто из персонажей постоянно умирает?", a: ["Стэн", "Кайл", "Кенни", "Баттерс"], c: 2 },
  { q: "Что Картман любит больше всего?", a: ["Свою маму", "Чиззи Поффс и деньги", "Школу", "Помогать другим"], c: 1 },
  { q: "Как зовут учителя в начальной школе Южного Парка?", a: ["Мистер Гаррисон", "Мистер Мэки", "Шеф", "Мисс Крабтри"], c: 0 }
];

export default {
  async scheduled(event, env, ctx) {
    const now = new Date();
    const hour = now.getUTCHours();
    
    if (hour === 5) ctx.waitUntil(postEpisodeOfTheDay(env));
    else if (hour === 10) ctx.waitUntil(postRandomImage(env)); // Новый рандомный пост с картинкой
    else if (hour === 15) ctx.waitUntil(postQuiz(env));
    else if (hour === 18) ctx.waitUntil(postJoke(env));
  },
  
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (request.method === 'GET') {
      if (url.searchParams.get('test') === 'true') {
        try {
          await postRandomImage(env); // Для теста вызываем картинку
          return new Response("Тестовый пост с картинкой отправлен!", { status: 200 });
        } catch (e) {
          return new Response("Ошибка: " + e.message, { status: 500 });
        }
      }
      return new Response("Бот работает. Для теста добавь ?test=true", { status: 200 });
    }
    
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        console.log("ПОЛУЧЕНО СООБЩЕНИЕ:", JSON.stringify(update));
        if (update.message && update.message.text) {
          if (!update.message.is_automatic_forward && update.message.from.id !== 8700031797) {
            const text = update.message.text;
            const userName = update.message.from.first_name || "Друг";
            const chatId = update.message.chat.id;
            const messageId = update.message.message_id;
            ctx.waitUntil(generateReply(env, text, userName, chatId, messageId));
          } else {
            console.log("ПРОПУЩЕНО: автопересылка или сообщение бота.");
          }
        }
      } catch (e) {
        console.log("Ошибка вебхука:", e.message);
      }
      return new Response("OK", { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  }
};

// ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ----------

function getRandomCharacter() {
  const characters = ["Эрик Картман", "Кенни Маккормик", "Стэн Марш", "Кайл Брофловски", "Баттерс Стотч", "Рэнди Марш", "Мистер Гаррисон", "Шеф"];
  return characters[Math.floor(Math.random() * characters.length)];
}

async function callAI(env, prompt, systemPrompt) {
  const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });
  const raw = aiResponse.response;
  if (!raw) throw new Error("Пустой ответ ИИ");
  if (typeof raw === 'object') return raw;
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Не удалось извлечь JSON");
  return JSON.parse(match[0]);
}

async function sendToTelegram(env, method, payload) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) console.log("Telegram API Error:", JSON.stringify(data));
  return data;
}

// ---------- РУБРИКИ ----------

// 1. Серия дня
async function postEpisodeOfTheDay(env) {
  const channelId = env.TELEGRAM_CHANNEL_ID;
  
  const res = await fetch("https://api.tvmaze.com/singlesearch/shows?q=south%20park&embed=episodes");
  const data = await res.json();
  const episodes = data._embedded.episodes;
  if (!episodes || episodes.length === 0) throw new Error("Не удалось загрузить эпизоды");
  
  const randomEp = episodes[Math.floor(Math.random() * episodes.length)];
  const season = randomEp.season;
  const number = randomEp.number;
  const name = randomEp.name;
  const summary = randomEp.summary ? randomEp.summary.replace(/<[^>]*>/g, '') : "Описание отсутствует.";
  const imageUrl = randomEp.image ? randomEp.image.medium : null;
  
  const character = getRandomCharacter();
  const systemPrompt = `Ты — админ канала "Южный Парк". Ты дерзкий, используешь черный юмор. Пиши только на русском. Верни JSON: {"quote": "..."}`;
  const prompt = `Напиши короткое (1-2 предложения) описание серии "${name}" (Сезон ${season}, Серия ${number}) от лица персонажа ${character}. Используй факты: ${summary}. Сделай это дерзко и смешно.`;
  
  const aiData = await callAI(env, prompt, systemPrompt);
  const quote = aiData.quote || "Сегодня без описания, но серия всё равно крутая.";
  
  const text = `<b>Серия дня: ${name} (S${season}E${number})</b>\n<blockquote>${quote}</blockquote>`;
  
  if (imageUrl) {
    await sendToTelegram(env, "sendPhoto", {
      chat_id: channelId,
      photo: imageUrl,
      caption: text,
      parse_mode: "HTML"
    });
  } else {
    await sendToTelegram(env, "sendMessage", {
      chat_id: channelId,
      text: text,
      parse_mode: "HTML"
    });
  }
}

// 2. Рандомный пост с картинкой (Мем ИЛИ Кадр из серии)
async function postRandomImage(env) {
  const channelId = env.TELEGRAM_CHANNEL_ID;
  const character = getRandomCharacter();
  
  let imageUrl = "";
  let promptContext = "";
  
  // Подбрасываем монетку: 50% на мем, 50% на кадр из серии
  const isEpisodeFrame = Math.random() > 0.5;
  
  if (isEpisodeFrame) {
    // Логика для кадра из серии
    try {
      const res = await fetch("https://api.tvmaze.com/singlesearch/shows?q=south%20park&embed=episodes");
      const data = await res.json();
      const episodes = data._embedded.episodes;
      
      // Ищем эпизоды, у которых точно есть картинка
      const episodesWithImages = episodes.filter(ep => ep.image && ep.image.medium);
      const randomEp = episodesWithImages[Math.floor(Math.random() * episodesWithImages.length)];
      
      imageUrl = randomEp.image.medium;
      promptContext = `Напиши смешную подпись к кадру из серии "${randomEp.name}" (Сезон ${randomEp.season}, Серия ${randomEp.number}).`;
    } catch (e) {
      console.log("Ошибка получения кадра, переключаемся на мем:", e.message);
      imageUrl = MEME_IMAGES[Math.floor(Math.random() * MEME_IMAGES.length)];
      promptContext = `Напиши смешную подпись к картинке.`;
    }
  } else {
    // Логика для готового мема
    imageUrl = MEME_IMAGES[Math.floor(Math.random() * MEME_IMAGES.length)];
    promptContext = `Напиши смешную подпись к мему. Это шутка про жизнь, школу или деньги.`;
  }
  
  // Генерация подписи
  const systemPrompt = `Ты — админ канала "Южный Парк". Ты дерзкий, используешь черный юмор. Пиши только на русском. Верни JSON: {"quote": "..."}`;
  const prompt = `${promptContext} От лица персонажа ${character}. 1-2 предложения.`;
  
  const aiData = await callAI(env, prompt, systemPrompt);
  const quote = aiData.quote || "Без комментариев. Просто смотрите.";
  
  const text = `<b>${character}:</b>\n<blockquote>${quote}</blockquote>`;
  
  await sendToTelegram(env, "sendPhoto", {
    chat_id: channelId,
    photo: imageUrl,
    caption: text,
    parse_mode: "HTML"
  });
}

// 3. Викторина
async function postQuiz(env) {
  const channelId = env.TELEGRAM_CHANNEL_ID;
  const qObj = QUIZ_QUESTIONS[Math.floor(Math.random() * QUIZ_QUESTIONS.length)];
  
  const systemPrompt = `Ты — админ канала "Южный Парк". Пиши только на русском. Верни JSON: {"question": "...", "options": ["...", "...", "...", "..."]}`;
  const prompt = `Перефразируй вопрос викторины: "${qObj.q}" и варианты ответов: ${JSON.stringify(qObj.a)}. Сделай это в стиле "Южного Парка", дерзко. Верни JSON с полем "question" и массивом "options" (4 варианта).`;
  
  const aiData = await callAI(env, prompt, systemPrompt);
  const question = aiData.question || qObj.q;
  const options = aiData.options || qObj.a;
  
  await sendToTelegram(env, "sendPoll", {
    chat_id: channelId,
    question: question,
    options: options,
    type: "quiz",
    correct_option_id: qObj.c,
    is_anonymous: false
  });
}

// 4. Текстовая шутка
async function postJoke(env) {
  const channelId = env.TELEGRAM_CHANNEL_ID;
  const character = getRandomCharacter();
  const systemPrompt = `Ты — админ канала "Южный Парк". Ты дерзкий, используешь черный юмор. Пиши только на русском. Верни JSON: {"quote": "..."}`;
  const prompt = `Напиши дерзкую мысль или шутку от лица персонажа ${character}. 1-2 предложения.`;
  
  const aiData = await callAI(env, prompt, systemPrompt);
  const quote = aiData.quote || "Сегодня даже Картман молчит. Наверное, что-то задумал.";
  
  const text = `<b>${character}:</b>\n<blockquote>${quote}</blockquote>`;
  await sendToTelegram(env, "sendMessage", {
    chat_id: channelId,
    text: text,
    parse_mode: "HTML"
  });
}

// 5. Ответ на комментарии
async function generateReply(env, userComment, userName, chatId, replyToMessageId) {
  const character = getRandomCharacter();
  const systemPrompt = `Ты — персонаж из "Южного Парка". Отвечай коротко, дерзко, но по смыслу. Пиши только на русском. Верни JSON: {"reply": "..."}`;
  const prompt = `Пользователь ${userName} написал: "${userComment}". Ответь от лица ${character}. 1-3 предложения.`;
  
  try {
    const aiData = await callAI(env, prompt, systemPrompt);
    let replyText = aiData.reply || "Я не понял, что ты сказал, но звучит как бред.";
    
    if (replyText.includes('http') || replyText.includes('t.me') || replyText.includes('@') || replyText.toLowerCase().includes('crypto')) {
      replyText = "Я не рекламирую всякое дерьмо. Пиши по делу!";
    }
    
    const formattedReply = `<b>${character}:</b>\n<blockquote>${replyText}</blockquote>`;
    await sendToTelegram(env, "sendMessage", {
      chat_id: chatId,
      text: formattedReply,
      parse_mode: "HTML",
      reply_to_message_id: replyToMessageId
    });
  } catch (e) {
    console.log("Ошибка в generateReply:", e.message);
  }
}
