// High-fidelity stylized SVG illustrations for resilient, zero-broken covers and reader panels

function safeSlice(raw: string, start: number, end?: number): string {
  const chars = Array.from(String(raw || ''));
  const sliced = chars.slice(start, end).join('');
  return typeof sliced.toWellFormed === 'function' ? sliced.toWellFormed() : sliced;
}

function escapeXml(raw: string): string {
  const wellFormed =
    typeof String(raw || '').toWellFormed === 'function'
      ? String(raw || '').toWellFormed()
      : String(raw || '');
  return wellFormed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function createCoverSvg(
  title: string,
  theme: 'shadow' | 'cyberpunk' | 'celestial' | 'mecha' | 'cafe' | 'dungeon' | string,
  type: 'webtoon' | 'manga'
): string {
  const safeTitle = escapeXml(safeSlice(title, 0, 24));
  const safeType = escapeXml(type.toUpperCase());

  const themes: Record<
    string,
    {
      bg1: string;
      bg2: string;
      accent: string;
      accent2: string;
      glow: string;
      silhouette: string;
      symbol: string;
    }
  > = {
    shadow: {
      bg1: '#090514',
      bg2: '#1b0d3a',
      accent: '#a855f7',
      accent2: '#6366f1',
      glow: '#c084fc',
      silhouette: '#020108',
      symbol: `<path d="M150 120 L250 120 L280 200 L200 320 L120 200 Z" fill="url(#grad2)" opacity="0.35"/>
               <circle cx="200" cy="220" r="60" fill="none" stroke="#a855f7" stroke-width="2" stroke-dasharray="8 4"/>
               <path d="M170 280 L200 160 L230 280 L200 250 Z" fill="#c084fc" filter="url(#glow)"/>`,
    },
    cyberpunk: {
      bg1: '#050b14',
      bg2: '#0b2038',
      accent: '#06b6d4',
      accent2: '#f43f5e',
      glow: '#22d3ee',
      silhouette: '#03080f',
      symbol: `<rect x="120" y="140" width="160" height="180" rx="8" fill="none" stroke="#06b6d4" stroke-width="2" opacity="0.4"/>
               <line x1="80" y1="200" x2="320" y2="200" stroke="#f43f5e" stroke-width="1.5" opacity="0.6"/>
               <line x1="80" y1="260" x2="320" y2="260" stroke="#06b6d4" stroke-width="1" stroke-dasharray="4 4"/>
               <path d="M160 300 L200 180 L240 300" stroke="#22d3ee" stroke-width="3" fill="none"/>`,
    },
    celestial: {
      bg1: '#130826',
      bg2: '#281347',
      accent: '#ec4899',
      accent2: '#fbbf24',
      glow: '#f472b6',
      silhouette: '#0a0417',
      symbol: `<circle cx="200" cy="210" r="70" fill="url(#grad2)" opacity="0.3"/>
               <circle cx="200" cy="210" r="85" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="4 6"/>
               <polygon points="200,150 215,195 260,210 215,225 200,270 185,225 140,210 185,195" fill="#fbcfe8" filter="url(#glow)"/>`,
    },
    mecha: {
      bg1: '#0f172a',
      bg2: '#1e293b',
      accent: '#e2e8f0',
      accent2: '#38bdf8',
      glow: '#38bdf8',
      silhouette: '#020617',
      symbol: `<polygon points="200,130 270,180 250,290 150,290 130,180" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.5"/>
               <polygon points="200,160 240,195 230,260 170,260 160,195" fill="url(#grad2)" opacity="0.3"/>
               <circle cx="200" cy="220" r="14" fill="#38bdf8" filter="url(#glow)"/>`,
    },
    cafe: {
      bg1: '#1c130d',
      bg2: '#3b2518',
      accent: '#f59e0b',
      accent2: '#e11d48',
      glow: '#fbbf24',
      silhouette: '#0e0906',
      symbol: `<path d="M140 250 C140 300, 260 300, 260 250 L260 210 L140 210 Z" fill="url(#grad2)" opacity="0.4"/>
               <path d="M260 220 C280 220, 290 235, 280 250 C270 260, 260 255, 260 250" fill="none" stroke="#f59e0b" stroke-width="2.5"/>
               <path d="M170 190 Q180 160 175 140 M200 190 Q210 155 205 135 M230 190 Q240 160 235 140" stroke="#fbbf24" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>`,
    },
    dungeon: {
      bg1: '#071510',
      bg2: '#0e2b20',
      accent: '#10b981',
      accent2: '#34d399',
      glow: '#6ee7b7',
      silhouette: '#020805',
      symbol: `<path d="M150 150 L250 150 L270 290 L130 290 Z" fill="none" stroke="#10b981" stroke-width="2" opacity="0.4"/>
               <path d="M170 180 L230 180 L245 280 L155 280 Z" fill="url(#grad2)" opacity="0.3"/>
               <line x1="200" y1="130" x2="200" y2="290" stroke="#34d399" stroke-width="2.5" filter="url(#glow)"/>
               <line x1="160" y1="230" x2="240" y2="230" stroke="#34d399" stroke-width="2.5"/>`,
    },
  };

  const t = themes[theme] || themes.shadow;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560" width="100%" height="100%">
    <defs>
      <linearGradient id="grad1" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stop-color="${t.bg1}"/>
        <stop offset="100%" stop-color="${t.bg2}"/>
      </linearGradient>
      <linearGradient id="grad2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${t.accent}"/>
        <stop offset="100%" stop-color="${t.accent2}"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    </defs>
    <rect width="400" height="560" fill="url(#grad1)"/>
    <g opacity="0.15">
      <line x1="0" y1="140" x2="400" y2="140" stroke="#ffffff" stroke-width="1"/>
      <line x1="0" y1="280" x2="400" y2="280" stroke="#ffffff" stroke-width="1"/>
      <line x1="0" y1="420" x2="400" y2="420" stroke="#ffffff" stroke-width="1"/>
      <line x1="200" y1="0" x2="200" y2="560" stroke="#ffffff" stroke-width="1"/>
    </g>
    ${t.symbol}
    <rect x="24" y="24" width="76" height="22" rx="4" fill="${t.silhouette}" opacity="0.8"/>
    <text x="62" y="39" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="${t.accent}" text-anchor="middle" letter-spacing="1">
      ${safeType}
    </text>
    <rect y="380" width="400" height="180" fill="url(#grad1)" opacity="0.95"/>
    <line x1="24" y1="420" x2="376" y2="420" stroke="${t.accent}" stroke-width="1" opacity="0.4"/>
    <text x="24" y="465" font-family="system-ui, sans-serif" font-size="22" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
      ${safeTitle}
    </text>
    <text x="24" y="495" font-family="system-ui, sans-serif" font-size="12" font-weight="500" fill="#94a3b8" letter-spacing="0.5">
      ORIGINAL SERIALIZATION
    </text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface StoryBeat {
  topLine: string;
  bottomLine: string;
  narration: string;
  sfx: string;
  krSfx: string;
}

function getSeriesStoryBeat(
  seriesTitle: string,
  chapterNum: number,
  pageNum: number,
  customDialogue?: string
): StoryBeat {
  const lower = seriesTitle.toLowerCase();

  const soloBeats: StoryBeat[] = [
    {
      topLine: 'The Double Dungeon gate just sealed shut behind our raid party!',
      bottomLine: 'Stay alert—the Giant Statue on the throne is looking right at us!',
      narration: '[SYSTEM ALERT: SECRET QUEST — COURAGE OF THE WEAK]',
      sfx: 'RUMBLE—!!',
      krSfx: '쿠구구궁!!',
    },
    {
      topLine: 'First Commandment: Worship the Lord! Everyone kneel immediately!',
      bottomLine: 'Only those who decipher the altar rules will survive this chamber!',
      narration: '[HEARTBEAT RATE CRITICAL · SURVIVAL INSTINCT ACTIVATED]',
      sfx: 'FLASH—!!',
      krSfx: '번쩍—!!',
    },
    {
      topLine: '[Will you accept the Player Awakening? 0.02 seconds remaining.]',
      bottomLine: 'If this System can make me stronger... I accept!',
      narration: '[WELCOME, PLAYER SUNG JINWOO · LEVEL 1 AWAKENED]',
      sfx: 'SURGE!!',
      krSfx: '파아아앗!!',
    },
    {
      topLine: 'Kasaka’s Poison Fang dagger equipped! Speed stat surging!',
      bottomLine: 'Even a Boss-rank serpent cannot keep up with my new agility!',
      narration: '[SKILL ACTIVATED: SPRINT LV. 2 · VITAL STRIKE]',
      sfx: 'SLASH—!!',
      krSfx: '서걱—!!',
    },
    {
      topLine: 'Blood-Red Commander Igris guards the empty monarch throne.',
      bottomLine: 'Put away the dagger—I will fight this knight barehanded!',
      narration: '[JOB CHANGE QUEST: DEFEAT THE SHADOW GUARDIAN]',
      sfx: 'CLANG!!',
      krSfx: '카아앙!!',
    },
    {
      topLine: 'Class Advancement Complete: Necromancer -> Monarch of Shadows!',
      bottomLine: 'From the darkness of death, heed my command... "ARISE."',
      narration: '[SHADOW EXTRACTION SUCCESSFUL · IGRIS HAS JOINED YOUR LEGION]',
      sfx: 'ARISE!!',
      krSfx: '일어나라!!',
    },
  ];

  const genericWebtoonBeats: StoryBeat[] = [
    {
      topLine: customDialogue || `Episode ${chapterNum} opens as a fateful aura fills the air...`,
      bottomLine: 'No one expected this encounter to change everything between us.',
      narration: `[${seriesTitle.toUpperCase()} · EPISODE ${chapterNum} · SCENE ${pageNum}]`,
      sfx: 'THUMP—!!',
      krSfx: '두근—!!',
    },
    {
      topLine: 'Wait—did you really think you could hide the truth from me?',
      bottomLine: 'Every glance in this room carries an unspoken tension.',
      narration: `[MOMENTS LATER · THE ATMOSPHERE GROWS INTENSE]`,
      sfx: 'RUSTLE...',
      krSfx: '스르륵...',
    },
    {
      topLine: 'Step back! The barrier around the inner sanctum is shattering!',
      bottomLine: 'If we don’t break through right now, there won’t be a second chance!',
      narration: `[HIDDEN POWER AWAKENING · LIMIT RELEASED]`,
      sfx: 'CRACK—!!',
      krSfx: '콰아아앙!!',
    },
    {
      topLine: 'I made a vow that I would never let anyone take what matters to me.',
      bottomLine: 'Watch closely—this is the true strength I have been concealing!',
      narration: `[CLIMAX SEQUENCE · EPISODE ${chapterNum} PANEL ${pageNum}]`,
      sfx: 'WHOOSH!!',
      krSfx: '슈우우욱!!',
    },
    {
      topLine: 'Why is my heart racing like this just from hearing your voice?',
      bottomLine: 'Don’t look away... tell me what you’re really thinking right now.',
      narration: `[UNSPOKEN CONFESSION · BENEATH THE MOONLIGHT]`,
      sfx: 'BA-DUMP!!',
      krSfx: '쿵—!!',
    },
    {
      topLine: 'The next trial awaits beyond this threshold.',
      bottomLine: 'Whatever happens tomorrow, we face it together.',
      narration: `[TO BE CONTINUED IN THE NEXT SCENE...]`,
      sfx: 'SHING—!!',
      krSfx: '챙—!!',
    },
  ];

  const pool = lower.includes('solo leveling') ? soloBeats : genericWebtoonBeats;
  const beat = pool[(pageNum + chapterNum - 2) % pool.length];

  if (
    customDialogue &&
    !customDialogue.toLowerCase().includes('live streamed') &&
    pageNum % 2 === 1
  ) {
    return {
      ...beat,
      topLine: customDialogue.replace(/^["']|["']$/g, ''),
    };
  }

  return beat;
}

export function createReaderPanelSvg(
  seriesTitle: string,
  chapterNum: number,
  pageNum: number,
  type: 'webtoon' | 'manga',
  dialogue?: string
): string {
  const isWebtoon = type === 'webtoon';
  const width = isWebtoon ? 800 : 750;
  const height = isWebtoon ? 1350 : 1060;
  const safeSeries = escapeXml(safeSlice(seriesTitle, 0, 34));
  const beat = getSeriesStoryBeat(seriesTitle, chapterNum, pageNum, dialogue);

  const topLine1 = escapeXml(safeSlice(beat.topLine, 0, 48));
  const topLine2 = escapeXml(safeSlice(beat.topLine, 48, 96));
  const botLine1 = escapeXml(safeSlice(beat.bottomLine, 0, 48));
  const botLine2 = escapeXml(safeSlice(beat.bottomLine, 48, 96));
  const safeNarration = escapeXml(safeSlice(beat.narration, 0, 56));
  const safeSfx = escapeXml(beat.sfx);
  const safeKrSfx = escapeXml(beat.krSfx);

  if (isWebtoon) {
    const palettes = [
      { bg1: '#070913', bg2: '#181236', accent: '#a855f7', accent2: '#38bdf8', eye: '#c084fc' },
      { bg1: '#120714', bg2: '#2d0f35', accent: '#ec4899', accent2: '#f43f5e', eye: '#f472b6' },
      { bg1: '#061417', bg2: '#0f2f38', accent: '#06b6d4', accent2: '#10b981', eye: '#22d3ee' },
      { bg1: '#140c08', bg2: '#2f190e', accent: '#f59e0b', accent2: '#ef4444', eye: '#fbbf24' },
    ];
    const pal = palettes[(pageNum + chapterNum - 2) % palettes.length];
    const poseVariant = pageNum % 3;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <defs>
        <linearGradient id="bgG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${pal.bg1}"/>
          <stop offset="50%" stop-color="${pal.bg2}"/>
          <stop offset="100%" stop-color="${pal.bg1}"/>
        </linearGradient>
        <radialGradient id="auraG" cx="50%" cy="48%" r="52%">
          <stop offset="0%" stop-color="${pal.accent}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${pal.bg1}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="slashG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="50%" stop-color="${pal.accent}"/>
          <stop offset="100%" stop-color="${pal.accent2}"/>
        </linearGradient>
      </defs>

      <rect width="${width}" height="${height}" fill="url(#bgG)"/>

      <!-- PANEL 1: TOP CINEMATIC SCENE (y: 30 -> 460) -->
      <g>
        <rect x="36" y="30" width="728" height="430" rx="8" fill="#05070f" stroke="${pal.accent}" stroke-width="2" stroke-opacity="0.55"/>
        <circle cx="430" cy="260" r="190" fill="url(#auraG)"/>

        <!-- Dynamic Speed Lines -->
        <g stroke="${pal.accent}" stroke-width="1.5" opacity="0.28">
          <line x1="40" y1="50" x2="350" y2="230"/>
          <line x1="760" y1="60" x2="490" y2="230"/>
          <line x1="40" y1="440" x2="340" y2="280"/>
          <line x1="760" y1="430" x2="500" y2="280"/>
          <line x1="200" y1="30" x2="390" y2="210"/>
          <line x1="620" y1="30" x2="450" y2="210"/>
        </g>

        <!-- Character Illustration in Panel 1 -->
        ${
          poseVariant === 0
            ? `<g>
                <polygon points="440,145 555,455 325,455" fill="#0b1120" stroke="${pal.accent}" stroke-width="2.5"/>
                <polygon points="390,220 490,220 520,455 360,455" fill="#111827"/>
                <circle cx="440" cy="145" r="42" fill="#0f172a" stroke="#e2e8f0" stroke-width="2.5"/>
                <path d="M405 125 L430 142 L412 145 Z" fill="${pal.eye}"/>
                <path d="M475 125 L450 142 L468 145 Z" fill="${pal.eye}"/>
                <path d="M240 350 Q440 210 690 120" stroke="url(#slashG)" stroke-width="6" fill="none"/>
              </g>`
            : poseVariant === 1
            ? `<g>
                <polygon points="480,130 610,455 350,455" fill="#0f172a" stroke="${pal.accent2}" stroke-width="2.5"/>
                <circle cx="480" cy="135" r="45" fill="#1e293b" stroke="#f8fafc" stroke-width="2.5"/>
                <circle cx="464" cy="132" r="6" fill="${pal.eye}"/>
                <circle cx="496" cy="132" r="6" fill="${pal.eye}"/>
                <circle cx="480" cy="295" r="95" fill="none" stroke="${pal.accent2}" stroke-width="2" stroke-dasharray="10 6"/>
              </g>`
            : `<g>
                <polygon points="330,160 445,455 225,455" fill="#0f172a" stroke="${pal.accent}" stroke-width="2"/>
                <polygon points="540,145 655,455 435,455" fill="#1e1b4b" stroke="${pal.accent2}" stroke-width="2"/>
                <circle cx="335" cy="140" r="36" fill="#0f172a" stroke="#f8fafc" stroke-width="2"/>
                <circle cx="545" cy="128" r="38" fill="#0f172a" stroke="${pal.accent2}" stroke-width="2"/>
                <line x1="380" y1="270" x2="500" y2="240" stroke="#ffffff" stroke-width="4"/>
              </g>`
        }

        <!-- Speech Bubble 1 (Top-Left) -->
        <rect x="58" y="54" width="470" height="${topLine2 ? 92 : 68}" rx="22" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <polygon points="210,${topLine2 ? 146 : 122} 245,${topLine2 ? 176 : 150} 260,${topLine2 ? 146 : 122}" fill="#ffffff"/>
        <text x="293" y="92" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="#0f172a" text-anchor="middle">
          ${topLine1}
        </text>
        ${
          topLine2
            ? `<text x="293" y="118" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#334155" text-anchor="middle">${topLine2}</text>`
            : ''
        }

        <!-- Korean SFX Callout -->
        <text x="695" y="115" font-family="system-ui, sans-serif" font-size="28" font-weight="900" fill="${pal.eye}" text-anchor="end" opacity="0.9">
          ${safeKrSfx}
        </text>
        <text x="695" y="142" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#f8fafc" text-anchor="end" letter-spacing="1.5">
          ${safeSfx}
        </text>
      </g>

      <!-- PANEL 2: MIDDLE DRAMATIC EYES CLOSE-UP & SYSTEM NARRATION (y: 490 -> 790) -->
      <g>
        <rect x="36" y="490" width="728" height="290" rx="8" fill="#03050a" stroke="${pal.accent2}" stroke-width="2" stroke-opacity="0.6"/>
        <linearGradient id="eyeBand" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#03050a"/>
          <stop offset="50%" stop-color="${pal.bg2}"/>
          <stop offset="100%" stop-color="#03050a"/>
        </linearGradient>
        <rect x="40" y="545" width="720" height="125" fill="url(#eyeBand)"/>
        <line x1="40" y1="545" x2="760" y2="545" stroke="${pal.accent}" stroke-width="1.5" opacity="0.6"/>
        <line x1="40" y1="670" x2="760" y2="670" stroke="${pal.accent}" stroke-width="1.5" opacity="0.6"/>

        <!-- Intense Glowing Eyes Close-Up -->
        <path d="M230 608 Q290 575 350 608 Q290 628 230 608 Z" fill="#0f172a" stroke="#e2e8f0" stroke-width="2.5"/>
        <circle cx="295" cy="606" r="14" fill="${pal.eye}"/>
        <circle cx="295" cy="606" r="5" fill="#ffffff"/>

        <path d="M450 608 Q510 575 570 608 Q510 628 450 608 Z" fill="#0f172a" stroke="#e2e8f0" stroke-width="2.5"/>
        <circle cx="505" cy="606" r="14" fill="${pal.eye}"/>
        <circle cx="505" cy="606" r="5" fill="#ffffff"/>

        <!-- System / Narration Window -->
        <rect x="90" y="692" width="620" height="62" rx="10" fill="#090d1a" stroke="${pal.accent2}" stroke-width="2"/>
        <text x="400" y="729" font-family="monospace, system-ui, sans-serif" font-size="14" font-weight="700" fill="#38bdf8" text-anchor="middle" letter-spacing="0.5">
          ${safeNarration}
        </text>
      </g>

      <!-- PANEL 3: BOTTOM CLIMAX & DIALOGUE (y: 820 -> 1290) -->
      <g>
        <rect x="36" y="820" width="728" height="465" rx="8" fill="#050811" stroke="${pal.accent}" stroke-width="2" stroke-opacity="0.5"/>
        <polygon points="80,1280 400,855 720,1280" fill="${pal.accent}" opacity="0.18"/>
        <circle cx="400" cy="1095" r="130" fill="none" stroke="${pal.accent2}" stroke-width="2" stroke-dasharray="12 8"/>
        <path d="M240 1120 L400 940 L560 1120 L400 1245 Z" fill="#0b1120" stroke="${pal.accent}" stroke-width="2.5"/>

        <!-- Speech Bubble 2 (Bottom Panel) -->
        <rect x="195" y="852" width="535" height="${botLine2 ? 96 : 72}" rx="22" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
        <polygon points="430,${botLine2 ? 948 : 924} 405,${botLine2 ? 980 : 954} 465,${botLine2 ? 948 : 924}" fill="#ffffff"/>
        <text x="462" y="892" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="#0f172a" text-anchor="middle">
          ${botLine1}
        </text>
        ${
          botLine2
            ? `<text x="462" y="918" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#334155" text-anchor="middle">${botLine2}</text>`
            : ''
        }
      </g>

      <!-- Episode Footer Strip -->
      <text x="42" y="${height - 22}" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#94a3b8">
        ${safeSeries} · Episode ${chapterNum}
      </text>
      <text x="${width - 42}" y="${height - 22}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#e2e8f0" text-anchor="end">
        Panel ${pageNum}
      </text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } else {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <rect width="${width}" height="${height}" fill="#f8fafc"/>
      <!-- Outer Manga Page Border -->
      <rect x="28" y="28" width="${width - 56}" height="${height - 64}" fill="#ffffff" stroke="#0f172a" stroke-width="4"/>

      <!-- Manga Panel Dividers -->
      <line x1="28" y1="430" x2="${width - 28}" y2="400" stroke="#0f172a" stroke-width="5"/>
      <line x1="395" y1="414" x2="365" y2="${height - 36}" stroke="#0f172a" stroke-width="5"/>

      <!-- Top Panel Speed Lines -->
      <g stroke="#0f172a" stroke-width="1.5" opacity="0.22">
        <line x1="40" y1="50" x2="320" y2="390"/>
        <line x1="90" y1="50" x2="360" y2="390"/>
        <line x1="140" y1="50" x2="400" y2="390"/>
        <line x1="680" y1="50" x2="440" y2="390"/>
        <line x1="630" y1="50" x2="410" y2="390"/>
      </g>

      <!-- Top Panel Character Ink Silhouette -->
      <polygon points="210,415 295,155 385,410" fill="#0f172a"/>
      <circle cx="295" cy="115" r="38" fill="#0f172a"/>
      <path d="M275 112 L290 118 M305 118 L320 112" stroke="#ffffff" stroke-width="3"/>

      <!-- Right-Side Speech Balloon (RTL Manga Order) -->
      <rect x="350" y="56" width="345" height="${topLine2 ? 105 : 82}" rx="36" fill="#ffffff" stroke="#0f172a" stroke-width="3.5"/>
      <text x="522" y="96" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#0f172a" text-anchor="middle">
        ${topLine1}
      </text>
      ${
        topLine2
          ? `<text x="522" y="122" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#334155" text-anchor="middle">${topLine2}</text>`
          : ''
      }

      <!-- Bottom-Left Action Panel -->
      <rect x="42" y="446" width="318" height="${height - 498}" fill="#0f172a"/>
      <polygon points="85,490 325,490 205,910" fill="#ffffff"/>
      <text x="200" y="675" font-family="system-ui, sans-serif" font-size="22" font-weight="900" fill="#0f172a" text-anchor="middle">
        ${safeSfx}
      </text>
      <text x="200" y="715" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#334155" text-anchor="middle">
        ${safeKrSfx}
      </text>

      <!-- Bottom-Right Dialogue & Character Panel -->
      <circle cx="555" cy="790" r="88" fill="#e2e8f0" stroke="#0f172a" stroke-width="3"/>
      <polygon points="480,1010 555,830 635,1010" fill="#0f172a"/>
      <rect x="405" y="455" width="295" height="${botLine2 ? 105 : 82}" rx="32" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
      <text x="552" y="495" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#0f172a" text-anchor="middle">
        ${botLine1}
      </text>
      ${
        botLine2
          ? `<text x="552" y="520" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#334155" text-anchor="middle">${botLine2}</text>`
          : ''
      }

      <text x="36" y="${height - 12}" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#475569">
        ${safeSeries} · Ch. ${chapterNum}
      </text>
      <text x="${width - 36}" y="${height - 12}" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#0f172a" text-anchor="end">
        Page ${pageNum}
      </text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
