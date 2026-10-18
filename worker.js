// ============================================================
// АВТОПОСТИНГ ДЛЯ TELEGRAM-КАНАЛА "ЮЖНЫЙ ПАРК"
// Работает на Cloudflare Workers (бесплатно)
// ============================================================

export default {
  // 1. Этот блок срабатывает по расписанию (Cron Trigger)
  async scheduled(event, env, ctx) {
    const now = new Date();
    const hour = now.getUTCHours(); // 0-23 по UTC
    
    // Простая логика "человечности": 
    // Утром (6-9 UTC) — легкий пост, днем (12-15) — опрос, вечером (18-21) — мем/шутка
    let postType = 'text';
    if (hour >= 6 && hour < 10) postType = 'text';
    else if (hour >= 12 && hour < 16) postType = 'poll';
    else if (hour >= 18 && hour < 22) postType = 'joke';
    else return; // Ночью (по UTC) бот "спит" и ничего не публикует
    
    // С вероятностью 70% публикуем, 30% — "пропускаем" день, 
    // чтобы не выглядеть как робот, который постит строго по часам.
    if (Math.random() > 0.7) {
      console.log("Пропускаем публикацию для имитации человека");
      return;
    }
    
    // Вызываем основную функцию генерации и публикации
    await generateAndPost(env, postType);
  },
  
  // 2. Этот блок нужен только если ты захочешь, 
  // чтобы бот отвечал на сообщения в канале (пока не обязательно)
  async fetch(request, env, ctx) {
    return new Response("Bot is running", { status: 200 });
  }
};

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ: генерация контента и отправка в Telegram
// ============================================================
async function generateAndPost(env, postType) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, GROQ_API_KEY } = env;
  const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  
  // --- Шаг 1: Просим Groq придумать контент ---
  let prompt = "";
  
  if (postType === 'poll') {
    prompt = `Придумай один короткий опрос для фанатов "Южного Парка" (South Park). 
    Вопрос должен быть смешным или провокационным, как в самом мультфильме. 
    Варианты ответов: от 2 до 4, короткие (1-3 слова). 
    Верни ответ СТРОГО в формате JSON: {"question": "текст вопроса", "options": ["вариант1", "вариант2", ...]}`;
  } else if (postType === 'joke') {
    prompt = `Напиши короткий пост-шутку или дерзкую мысль в стиле "Южного Парка". 
    Используй черный юмор, сарказм, отсылки к персонажам (Картман, Кенни, Стэн, Кайл). 
    Длина: 1-2 предложения. В конце добавь 1-2 уместных эмодзи. 
    Верни ответ СТРОГО в формате JSON: {"text": "твой текст"}`;
  } else {
    prompt = `Напиши короткую подводку к нарезке из "Южного Парка". 
    Это должен быть текст, который как бы предваряет видео (хотя видео ты загрузишь сам позже). 
    Тон: как у фаната, который делится любимым моментом. 1-2 предложения, 1 эмодзи. 
    Верни ответ СТРОГО в формате JSON: {"text": "твой текст"}`;
  }
  
  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", // Бесплатная и мощная модель
      messages: [
        { role: "system", content: "Ты — админ Telegram-канала с нарезками из Южного Парка. Ты дерзкий, шутишь про политику и общество, используешь черный юмор. Твой ответ должен быть ТОЛЬКО валидным JSON, без markdown-оберток." },
        { role: "user", content: prompt }
      ],
      temperature: 0.9, // Высокая температура = больше креатива и "человечности"
      response_format: { type: "json_object" } // Заставляем вернуть JSON
    })
  });
  
  const groqData = await groqResponse.json();
  const content = JSON.parse(groqData.choices[0].message.content);
  
  // --- Шаг 2: Публикуем в Telegram ---
  if (postType === 'poll') {
    // Отправляем опрос
    await fetch(`${TG_API}/sendPoll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        question: content.question,
        options: content.options,
        is_anonymous: false, // Люди любят видеть, как голосуют другие
        type: "regular"
      })
    });
  } else {
    // Отправляем текстовый пост (шутка или подводка)
    await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        text: content.text,
        parse_mode: "HTML" // Разрешает базовое форматирование (жирный, курсив)
      })
    });
  }
}
