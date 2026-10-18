// ============================================================
// АВТОПОСТИНГ ДЛЯ TELEGRAM-КАНАЛА "ЮЖНЫЙ ПАРК"
// ============================================================

export default {
  // 1. Этот блок срабатывает по расписанию (Cron Trigger)
  async scheduled(event, env, ctx) {
    const now = new Date();
    const hour = now.getUTCHours(); // Время по Гринвичу (0-23)
    
    // Защита от задержек Cloudflare: используем диапазоны часов
    let postType = '';
    if (hour >= 5 && hour < 8) postType = 'text';       // 08:00 по МСК (Утренняя мысль)
    else if (hour >= 10 && hour < 13) postType = 'poll'; // 13:00 по МСК (Обеденный опрос)
    else if (hour >= 15 && hour < 18) postType = 'joke'; // 18:00 по МСК (Вечерняя шутка)
    else if (hour >= 18 && hour < 21) postType = 'text'; // 21:00 по МСК (Ночная мысль)
    else return; // Если запуск ночью, бот "спит"
    
    ctx.waitUntil(generateAndPost(env, postType));
  },
  
  // 2. Этот блок срабатывает при открытии ссылки в браузере (для ручного теста)
  async fetch(request, env, ctx) {
    try {
      await generateAndPost(env, 'text');
      return new Response("Тестовый пост успешно отправлен! Проверь канал.", { status: 200 });
    } catch (e) {
      return new Response("Ошибка: " + e.message, { status: 500 });
    }
  }
};

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ И ОТПРАВКИ
// ============================================================
async function generateAndPost(env, postType) {
  
  // ==========================================================
  // ВНИМАНИЕ! ВСТАВЬ СВОИ ДАННЫЕ В ТРИ СТРОКИ НИЖЕ:
  // ==========================================================
  const TELEGRAM_BOT_TOKEN = "8937064578:AAHuY-2CIFWOyhhkReIPmp98e3d4gw_-wTU";
  const TELEGRAM_CHANNEL_ID = "-1004389745995";
  const GROQ_API_KEY = "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";
  // ==========================================================

  const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  
  const characters = [
    "Эрик Картман", "Кенни Маккормик", "Стэн Марш", "Кайл Брофловски",
    "Баттерс Стотч", "Рэнди Марш", "Мистер Гаррисон", "Шеф"
  ];
  const chosenCharacter = characters[Math.floor(Math.random() * characters.length)];
  
  let prompt = "";
  
  if (postType === 'poll') {
    prompt = `Придумай опрос от лица персонажа: ${chosenCharacter}. 
    Вопрос смешной, провокационный, в духе сериала. 
    Варианты ответов — от 2 до 4, короткие (1-3 слова). 
    Верни СТРОГО JSON: {"question": "...", "options": ["...", "..."]}`;
  } else if (postType === 'joke') {
    prompt = `Напиши дерзкую мысль или шутку от лица персонажа: ${chosenCharacter}.
    1-2 предложения, черный юмор, отсылки к сериалу, 1-2 эмодзи.
    ОБЯЗАТЕЛЬНО используй HTML-теги: имя персонажа сделай жирным (<b>Имя</b>), а саму шутку оберни в цитату (<blockquote>Текст</blockquote>).
    Верни СТРОГО JSON: {"text": "..."}`;
  } else {
    prompt = `Напиши короткую мысль-подводку от лица персонажа: ${chosenCharacter}.
    1-2 предложения, тон как у фаната, 1 эмодзи.
    ОБЯЗАТЕЛЬНО используй HTML-теги: имя персонажа сделай жирным (<b>Имя</b>), а саму мысль оберни в цитату (<blockquote>Текст</blockquote>).
    Верни СТРОГО JSON: {"text": "..."}`;
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
        { role: "system", content: `Ты — админ Telegram-канала с нарезками из "Южного Парка" (South Park). 
Ты дерзкий, умный, используешь черный юмор и сатиру, как в самом сериале. 
Ты никогда не пишешь банальности и не извиняешься. Ты не бот — ты живой фанат.

ПЕРЕД НАПИСАНИЕМ ПОСТА ВЫБЕРИ ОДНОГО ПЕРСОНАЖА ИЗ СПИСКА НИЖЕ И ПИШИ ОТ ЕГО ЛИЦА. 
Каждый пост — это как будто цитата или мысль этого персонажа.

=== ПЕРСОНАЖИ ===
1. ЭРИК КАРТМАН: эгоист, наглый, любит себя и еду. Тон: "Вы все идиоты, а я гений."
2. КЕННИ МАККОРМИК: фаталист, постоянно умирает. Тон: "Ммф-ммф... (я опять умер)."
3. СТЭН МАРШ: голос разума, устал от мира. Тон: "Вот дерьмо. Взрослые опять всё сломали."
4. КАЙЛ БРОФЛОВСКИ: умный, вспыльчивый, спорит с Картманом. Тон: "Картман, это неправильно!"
5. БАТТЕРС СТОТЧ: наивный, добрый. Тон: "Я хороший мальчик!.. А почему все смеются?"
6. РЭНДИ МАРШ: нарцисс, драматичный. Тон: "Я нашел смысл жизни. И это — я."
7. МИСТЕР ГАРРИСОН: циничный, раздраженный. Тон: "Я преподаю детям. Это абсурд."
8. ШЕФ: добрый, мудрый. Тон: "Дети, любовь — это как чили."

=== ПРАВИЛА ===
- Пиши коротко: 1-2 предложения максимум.
- Не используй слова "нарезка", "видео", "пост".
- Добавляй 1-2 эмодзи в конце.
- ВСЕГДА используй HTML-теги <b> для имени и <blockquote> для реплики.
- Верни ответ СТРОГО в JSON-формате: {"text": "..."} или {"question": "...", "options": [...]}.` },
        { role: "user", content: prompt }
      ],
      temperature: 0.9,
      response_format: { type: "json_object" }
    })
  });
  
  const groqData = await groqResponse.json();

  if (!groqData.choices) {
    throw new Error("Ошибка от OpenRouter: " + JSON.stringify(groqData));
  }

  const content = JSON.parse(groqData.choices[0].message.content);
  
  let tgResponse;
  
  if (postType === 'poll') {
    tgResponse = await fetch(`${TG_API}/sendPoll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        question: content.question,
        options: content.options,
        is_anonymous: false,
        type: "regular"
      })
    });
  } else {
    tgResponse = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        text: content.text,
        parse_mode: "HTML" // Включает поддержку жирного шрифта и цитат
      })
    });
  }

  const tgResult = await tgResponse.json();
  console.log("Ответ от Telegram API:", JSON.stringify(tgResult));

  if (!tgResult.ok) {
    throw new Error("Ошибка от Telegram: " + JSON.stringify(tgResult));
  }
}
