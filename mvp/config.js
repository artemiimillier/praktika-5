// Конфиг MVP — всё, что может меняться, лежит здесь, не в коде.
// Цены и идентификаторы моделей kie.ai сверять с https://kie.ai/pricing

module.exports = {
  PORT: process.env.PORT || 3000,

  KIE: {
    BASE_URL: 'https://api.kie.ai',
    CREATE_TASK: '/api/v1/jobs/createTask',
    RECORD_INFO: '/api/v1/jobs/recordInfo',
    // File Upload API (отдельный хост kie.ai для загрузки файлов)
    UPLOAD_BASE64: 'https://kieai.redpandaai.co/api/file-base64-upload',
  },

  MODELS: {
    // редактирование по референс-фото (identity preservation)
    // апгрейд качества: 'nano-banana-pro' (вход: image_input вместо image_urls, до 8 рефов, $0.09)
    character: 'google/nano-banana-edit',
    storyboard: 'google/nano-banana-edit',
  },

  ASPECT_RATIO: {
    character: '1:1',   // квадратные карточки в гриде
    storyboard: '16:9', // широкий лист model sheet
  },

  // USD за одну успешную генерацию (kie.ai, 1 кредит = $0.005)
  PRICE_PER_IMAGE_USD: {
    'google/nano-banana-edit': 0.02, // 4 кредита
    'google/nano-banana': 0.02,
    'nano-banana-pro': 0.09,         // 18 кредитов 1K/2K, 24 ($0.12) за 4K
    'nano-banana-2': 0.04,           // 8 кредитов 1K
  },

  POLL_INTERVAL_MS: 3000,

  // Общая для всех стилей задача сохранения личности
  IDENTITY_RULES: `CRITICAL IDENTITY REQUIREMENT: this is the same real child from the reference photo. The child MUST instantly recognize themselves. Preserve exactly: face shape, eye color and eye shape, eyebrows, nose shape, mouth and smile, skin tone, freckles/birthmarks/dimples if present, the exact same hairstyle and hair color, and the same clothing (same colors and garments as in the photo). Keep the same age, same gender, same friendly expression. Do not beautify, do not change proportions of recognizable features beyond what the art style strictly requires.`,

  STYLES: [
    {
      key: 'pixar',
      name: 'Pixar 3D',
      emoji: '🎬',
      prompt: `Transform this child into a high-quality 3D animated movie character in the style of a modern Pixar/Disney feature film: soft subsurface-scattering skin, large expressive eyes, detailed hair groom, cinematic warm lighting, gentle depth of field. Upper-body portrait, clean soft studio background.`,
    },
    {
      key: 'minecraft',
      name: 'Minecraft',
      emoji: '⛏️',
      prompt: `Transform this child into a Minecraft-style blocky voxel character: cubic head and body, pixelated 16x16 face texture, blocky Minecraft world background with cubes and pixel clouds. IMPORTANT for recognizability despite the blocky style: keep the same hairstyle silhouette and hair color, same eye color, same skin tone, same clothing colors and patterns rendered as pixel textures, so the child still clearly recognizes themselves.`,
    },
    {
      key: 'anime',
      name: 'Аниме',
      emoji: '🌸',
      prompt: `Transform this child into a hand-drawn anime character in the style of a heartwarming Studio Ghibli-like animated feature film: clean line art, soft watercolor-like background, expressive anime eyes that keep the child's real eye color, natural daylight. Upper-body portrait.`,
    },
    {
      key: 'lego',
      name: 'LEGO',
      emoji: '🧱',
      prompt: `Transform this child into a LEGO minifigure character: glossy plastic minifigure body, molded LEGO hair piece matching the child's real hairstyle and hair color, printed face keeping the child's recognizable features (eye color, smile, freckles if present), torso print matching the child's real clothing colors. Bright playful LEGO diorama background.`,
    },
  ],

  STORYBOARD_PROMPT: `Professional animation character model sheet (turnaround reference sheet) of this exact character, all on ONE single image, clean white background, layout of a real studio character reference sheet:
- Top row: full-body views of the character standing in a neutral pose — front view, 3/4 view, side profile view, back view.
- Bottom row: close-up facial expression studies — happy, surprised, laughing, thoughtful — plus one dynamic action pose (running or jumping with joy).
Character identity MUST be 100% consistent across every view: image 1 is the canonical character, image 2 is the real child this character is based on — keep the face recognizable as this child in every view. Same outfit, same hairstyle, same colors in all views. Neat small annotation lines like in real model sheets. High detail, production quality.`,
};
