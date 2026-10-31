import fs from 'fs';
import {
  Series,
  Chapter,
  Comment,
  SeriesRequest,
  ReadingProgress,
  UserSession,
  ModerationReport,
  SeriesOrigin,
  SeriesType,
} from './types';
import { createCoverSvg, createReaderPanelSvg } from './svg-covers';
import { buildProxiedImageUrl, DiscoveredMangaDexChapter } from './internet-manga';

const PERSIST_STATE_FILE = '/tmp/panelverse-library-state-v4.json';

interface PersistedLibraryState {
  seriesOverrides: Record<string, Series>;
  deletedSeriesIds: string[];
  chapterOverrides: Record<string, Chapter>;
  deletedChapterIds: string[];
}

class DatabaseStore {
  private series: Series[] = [];
  private chapters: Chapter[] = [];
  private comments: Comment[] = [];
  private requests: SeriesRequest[] = [];
  private progress: Map<string, ReadingProgress[]> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private keyToSession: Map<string, string> = new Map();
  private reports: ModerationReport[] = [];
  private seriesOverrides: Map<string, Series> = new Map();
  private deletedSeriesIds: Set<string> = new Set();
  private chapterOverrides: Map<string, Chapter> = new Map();
  private deletedChapterIds: Set<string> = new Set();

  constructor() {
    this.seedInitialData();
    this.loadPersistedState();
  }

  private loadPersistedState() {
    try {
      if (!fs.existsSync(PERSIST_STATE_FILE)) return;
      const raw = fs.readFileSync(PERSIST_STATE_FILE, 'utf-8');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedLibraryState>;

      if (Array.isArray(parsed.deletedSeriesIds)) {
        parsed.deletedSeriesIds.forEach((id) => {
          this.deletedSeriesIds.add(id);
          this.series = this.series.filter((s) => s.id !== id);
          this.chapters = this.chapters.filter((c) => c.seriesId !== id);
        });
      }

      if (parsed.seriesOverrides && typeof parsed.seriesOverrides === 'object') {
        for (const [id, override] of Object.entries(parsed.seriesOverrides)) {
          if (this.deletedSeriesIds.has(id)) continue;
          this.seriesOverrides.set(id, override);
          const idx = this.series.findIndex((s) => s.id === id);
          if (idx >= 0) {
            this.series[idx] = { ...this.series[idx], ...override };
          } else {
            this.series.unshift(override);
          }
        }
      }

      if (Array.isArray(parsed.deletedChapterIds)) {
        parsed.deletedChapterIds.forEach((id) => {
          this.deletedChapterIds.add(id);
          this.chapters = this.chapters.filter((c) => c.id !== id);
        });
      }

      if (parsed.chapterOverrides && typeof parsed.chapterOverrides === 'object') {
        for (const [id, chOverride] of Object.entries(parsed.chapterOverrides)) {
          if (this.deletedChapterIds.has(id) || this.deletedSeriesIds.has(chOverride.seriesId)) {
            continue;
          }
          this.chapterOverrides.set(id, chOverride);
          const idx = this.chapters.findIndex((c) => c.id === id);
          if (idx >= 0) {
            this.chapters[idx] = { ...this.chapters[idx], ...chOverride };
          } else {
            this.chapters.push(chOverride);
          }
        }
      }

      this.recomputeSeriesChapterCounts();
    } catch (e) {
      console.error('Failed to load persisted library state:', e);
    }
  }

  private savePersistedState() {
    try {
      const payload: PersistedLibraryState = {
        seriesOverrides: Object.fromEntries(this.seriesOverrides.entries()),
        deletedSeriesIds: Array.from(this.deletedSeriesIds),
        chapterOverrides: Object.fromEntries(this.chapterOverrides.entries()),
        deletedChapterIds: Array.from(this.deletedChapterIds),
      };
      fs.writeFileSync(PERSIST_STATE_FILE, JSON.stringify(payload), 'utf-8');
    } catch (e) {
      console.error('Failed to save persisted library state:', e);
    }
  }

  private recomputeSeriesChapterCounts() {
    for (const s of this.series) {
      const chs = this.chapters
        .filter((c) => c.seriesId === s.id)
        .sort((a, b) => a.chapterNumber - b.chapterNumber);
      s.chaptersCount = chs.length;
      if (chs.length > 0) {
        s.latestChapterId = chs[chs.length - 1].id;
      }
    }
  }

  private seedInitialData() {
    this.series = [
      // ==================== KOREAN MANHWA & WEBTOONS ====================
      {
        id: 'series-solo-leveling',
        slug: 'solo-leveling',
        title: 'Solo Leveling',
        origin: 'manhwa',
        koreanTitle: '나 혼자만 레벨업',
        malayalamTitle: 'സോളോ ലെവലിംഗ് (Solo Leveling)',
        malayalamSynopsis:
          'പത്ത് വർഷങ്ങൾക്ക് മുമ്പ് മറ്റ് ലോകങ്ങളിലേക്കുള്ള കവാടം തുറക്കപ്പെട്ടപ്പോൾ, ഏറ്റവും ദുർബലനായ ഇ-റാങ്ക് ഹണ്ടർ സങ് ജിൻ-വൂ ഒരു രഹസ്യ ഇരട്ട ഡൺജിയണിൽ മരണത്തെ അഭിമുഖീകരിക്കുകയും നിഗൂഢമായ സിസ്റ്റം വഴി ഷാഡോ മൊണാർക്കായി ഉയരുകയും ചെയ്യുന്നു.',
        author: 'Chugong',
        artist: 'DUBU (Redice Studio)',
        type: 'webtoon',
        genres: ['Action', 'System', 'Fantasy'],
        status: 'Completed',
        synopsis:
          'Ten years ago, after "the Gate" that connected the real world with the monster world opened, ordinary people received the power to hunt monsters within the Gate. Sung Jinwoo, notoriously known as the Weakest Hunter of All Mankind, awakens a secret Player System inside a deadly double dungeon.',
        coverImage: buildProxiedImageUrl(
          'https://cdn.myanimelist.net/images/manga/3/222295l.jpg',
          'SOLO LEVELING',
          'webtoon',
          'shadow'
        ),
        rating: 4.97,
        totalViews: 4850000,
        releaseDay: 'Wednesday',
        chaptersCount: 3,
        latestChapterId: 'ch-solo-leveling-3',
        featured: true,
        mangadexId: '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0',
        malId: 121496,
      },
      {
        id: 'series-addicted-to-stepmom',
        slug: 'addicted-to-stepmom',
        title: 'Addicted to Stepmom',
        origin: 'manhwa',
        koreanTitle: '엄마중독',
        malayalamTitle: 'അഡിക്റ്റഡ് ടു സ്റ്റെപ്മോം (Addicted to Stepmom)',
        malayalamSynopsis:
          'തന്റെ കുടുംബത്തിലേക്ക് പുതിയതായി കടന്നുവന്ന വളർത്തമ്മയോട് ജിവോൺ എന്ന യുവാവിന് തോന്നുന്ന തീവ്രവും നിഗൂഢവുമായ ആകർഷണത്തിന്റെയും വൈകാരിക സംഘർഷങ്ങളുടെയും കഥ.',
        author: 'YaGyung',
        artist: 'Dong-heon Lee (Nadan)',
        type: 'webtoon',
        genres: ['Romance', 'Drama'],
        status: 'Ongoing',
        synopsis:
          'Centered on Jiwon, a young man who develops an intense, all-consuming fixation on his captivating new stepmother. Caught between emotional conflict and escalating household tension, he spirals deeper into a secretive dynamic that tests every boundary.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/48d2bfb4-3109-4af9-bab2-d2ca8bbfac35/fc78fb42-2228-42a4-947b-a3db8698f0f6.jpg.512.jpg',
          'ADDICTED TO STEPMOM',
          'webtoon',
          'crimson'
        ),
        rating: 4.92,
        totalViews: 1420000,
        releaseDay: 'Friday',
        chaptersCount: 10,
        latestChapterId: 'ch-addicted-to-stepmom-10',
        featured: false,
        mangadexId: '48d2bfb4-3109-4af9-bab2-d2ca8bbfac35',
      },
      {
        id: 'series-omniscient-reader',
        slug: 'omniscient-readers-viewpoint',
        title: "Omniscient Reader's Viewpoint",
        origin: 'manhwa',
        koreanTitle: '전지적 독자 시점',
        malayalamTitle: 'ഓംനിസിയന്റ് റീഡേഴ്സ് വ്യൂപോയിന്റ്',
        malayalamSynopsis:
          'താൻ പത്ത് വർഷമായി വായിച്ചുകൊണ്ടിരുന്ന നോവൽ യാഥാർത്ഥ്യമായി മാറുമ്പോൾ, ലോകത്തിന്റെ അവസാനം എങ്ങനെ സംഭവിക്കുമെന്ന് അറിയാവുന്ന ഒരേയൊരു വ്യക്തി കിം ഡോക്ജ മാത്രമാണ്.',
        author: 'sing N song',
        artist: 'Sleepy-C (Redice Studio)',
        type: 'webtoon',
        genres: ['Action', 'System', 'Fantasy'],
        status: 'Ongoing',
        synopsis:
          'Kim Dokja does not consider himself the protagonist of his own life. One day, the apocalyptic web novel he alone read for ten years—"Three Ways to Survive in a Ruined World"—suddenly becomes reality on his subway train home, and constellations begin sponsoring incarnations.',
        coverImage: buildProxiedImageUrl(
          'https://cdn.myanimelist.net/images/manga/2/232022l.jpg',
          'OMNISCIENT READER',
          'webtoon',
          'celestial'
        ),
        rating: 4.95,
        totalViews: 3620000,
        releaseDay: 'Tuesday',
        chaptersCount: 3,
        latestChapterId: 'ch-omniscient-reader-3',
        featured: true,
        mangadexId: '3df1a9a3-a1be-47a3-9e90-9b3e55b1d0ac',
        malId: 132214,
      },
      {
        id: 'series-tower-of-god',
        slug: 'tower-of-god',
        title: 'Tower of God',
        origin: 'manhwa',
        koreanTitle: '신의 탑',
        malayalamTitle: 'ടവർ ഓഫ് ഗോഡ് (Tower of God)',
        malayalamSynopsis:
          'സമ്പത്തും അധികാരവും മാന്ത്രികശക്തിയും എല്ലാം മുകളിലുണ്ടെന്ന് വിശ്വസിക്കപ്പെടുന്ന നിഗൂഢമായ ഗോപുരത്തിലേക്ക് തന്റെ പ്രിയ സുഹൃത്ത് റേച്ചലിനെ തേടി ഇരുപത്തിയഞ്ചാം ബാം പ്രവേശിക്കുന്നു.',
        author: 'SIU',
        artist: 'SIU',
        type: 'webtoon',
        genres: ['Fantasy', 'Adventure', 'Action'],
        status: 'Ongoing',
        synopsis:
          'What do you desire? Money and wealth? Honor and pride? Authority and power? Revenge? Or something that transcends them all? Whatever you desire—it is in here. Twenty-Fifth Bam enters the mysterious Tower as an Irregular to reunite with his only friend, Rachel.',
        coverImage: buildProxiedImageUrl(
          'https://cdn.myanimelist.net/images/manga/2/204832l.jpg',
          'TOWER OF GOD',
          'webtoon',
          'dungeon'
        ),
        rating: 4.89,
        totalViews: 2980000,
        releaseDay: 'Monday',
        chaptersCount: 3,
        latestChapterId: 'ch-tower-of-god-3',
        featured: false,
        mangadexId: '57e1d491-1dc9-4854-83bf-7a9379566fb2',
        malId: 122663,
      },
      {
        id: 'series-tbate',
        slug: 'the-beginning-after-the-end',
        title: 'The Beginning After The End',
        origin: 'manhwa',
        koreanTitle: '끝이 아닌 시작',
        malayalamTitle: 'ദി ബിഗിനിംഗ് ആഫ്റ്റർ ദി എൻഡ്',
        malayalamSynopsis:
          'സമാനതകളില്ലാത്ത ശക്തിയുള്ള ഗ്രേ രാജാവ് മാന്ത്രികതയും ഡ്രാഗണുകളും നിറഞ്ഞ ഡിക്കാത്തെൻ ഭൂഖണ്ഡത്തിൽ ആർതർ ലെയ്‌വിൻ എന്ന പേരിൽ പുനർജനിക്കുന്നു.',
        author: 'TurtleMe',
        artist: 'Fuyuki23',
        type: 'webtoon',
        genres: ['Fantasy', 'Action', 'Adventure'],
        status: 'Ongoing',
        synopsis:
          'King Grey has unrivaled strength, wealth, and prestige in a world governed by martial ability. However, solitude lingers closely behind those with great power. Reincarnated into a new world filled with magic and monsters as Arthur Leywin, the king has a second chance to relive his life.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/4ada20eb-085a-491a-8c49-477ab42014d7/4298e756-edf0-4bd6-9b83-340bfdb27771.jpg.512.jpg',
          'TBATE',
          'webtoon',
          'celestial'
        ),
        rating: 4.91,
        totalViews: 2740000,
        releaseDay: 'Friday',
        chaptersCount: 3,
        latestChapterId: 'ch-tbate-3',
        featured: false,
        mangadexId: '4ada20eb-085a-491a-8c49-477ab42014d7',
      },

      // ==================== JAPANESE MANGA (RTL PAGED) ====================
      {
        id: 'series-one-piece',
        slug: 'one-piece',
        title: 'One Piece',
        origin: 'manga',
        japaneseTitle: 'ワンピース',
        malayalamTitle: 'വൺ പീസ് (One Piece)',
        malayalamSynopsis:
          'കടൽക്കൊള്ളക്കാരുടെ രാജാവാകാൻ കൊതിക്കുന്ന മങ്കി ഡി. ലൂഫിയും സ്ട്രോ ഹാറ്റ് പൈറേറ്റ്സും ഇതിഹാസ നിധിയായ വൺ പീസ് തേടി ഗ്രാൻഡ് ലൈനിലൂടെ നടത്തുന്ന സാഹസിക യാത്ര.',
        author: 'Eiichiro Oda',
        artist: 'Eiichiro Oda',
        type: 'manga',
        genres: ['Shonen', 'Adventure', 'Action'],
        status: 'Ongoing',
        synopsis:
          'Gol D. Roger, the King of the Pirates, declared before his execution that his legendary treasure, One Piece, lay hidden at the end of the Grand Line. Monkey D. Luffy, a boy whose body gained the properties of rubber after eating the Gomu Gomu Devil Fruit, sets sail with the Straw Hat Crew.',
        coverImage: buildProxiedImageUrl(
          'https://cdn.myanimelist.net/images/manga/2/253146l.jpg',
          'ONE PIECE',
          'manga',
          'cyberpunk'
        ),
        rating: 4.98,
        totalViews: 6150000,
        releaseDay: 'Sunday',
        chaptersCount: 3,
        latestChapterId: 'ch-one-piece-3',
        featured: true,
        mangadexId: 'a1c7c817-4e59-43b7-9365-09675a149a6f',
        malId: 13,
      },
      {
        id: 'series-jujutsu-kaisen',
        slug: 'jujutsu-kaisen',
        title: 'Jujutsu Kaisen',
        origin: 'manga',
        japaneseTitle: '呪術廻戦',
        malayalamTitle: 'ജുജുത്സു കൈസെൻ (Jujutsu Kaisen)',
        malayalamSynopsis:
          'തന്റെ സുഹൃത്തുക്കളെ രക്ഷിക്കാൻ ശപിക്കപ്പെട്ട റയോമെൻ സുകുനയുടെ വിരൽ വിഴുങ്ങുന്ന യുജി ഇറ്റാഡോരി ടോക്കിയോ ജുജുത്സു ഹൈസ്കൂളിലെ മാന്ത്രിക പോരാട്ടങ്ങളിലേക്ക് പ്രവേശിക്കുന്നു.',
        author: 'Gege Akutami',
        artist: 'Gege Akutami',
        type: 'manga',
        genres: ['Shonen', 'Supernatural', 'Action'],
        status: 'Completed',
        synopsis:
          'Idly indulging in baseless paranormal activities with the Occult Club, high schooler Yuuji Itadori swallows a rotting cursed talisman—the finger of Ryomen Sukuna, the undisputed King of Curses—and is inducted into Tokyo Jujutsu High under Satoru Gojo.',
        coverImage: buildProxiedImageUrl(
          'https://cdn.myanimelist.net/images/manga/3/210341l.jpg',
          'JUJUTSU KAISEN',
          'manga',
          'shadow'
        ),
        rating: 4.92,
        totalViews: 4120000,
        releaseDay: 'Sunday',
        chaptersCount: 3,
        latestChapterId: 'ch-jujutsu-kaisen-3',
        featured: false,
        mangadexId: 'c52b2ce3-7f95-469c-96b0-479524fb7a1a',
        malId: 113138,
      },
      {
        id: 'series-berserk',
        slug: 'berserk',
        title: 'Berserk',
        origin: 'manga',
        japaneseTitle: 'ベルセルク',
        malayalamTitle: 'ബെർസെർക്ക് (Berserk)',
        malayalamSynopsis:
          'ഭീമാകാരമായ ഡ്രാഗൺ സ്ലേയർ വാളേന്തി ശപിക്കപ്പെട്ട മുദ്രയുമായി അന്ധകാര ശക്തികളോട് പോരാടുന്ന കറുത്ത വാൾപ്പയറ്റുകാരൻ ഗട്ട്സിന്റെ ഇതിഹാസ കാവ്യം.',
        author: 'Kentaro Miura',
        artist: 'Kentaro Miura / Studio Gaga',
        type: 'manga',
        genres: ['Seinen', 'Dark Fantasy', 'Action'],
        status: 'Ongoing',
        synopsis:
          'Guts, a former mercenary now known as the "Black Swordsman," is out for revenge. Marked with a deadly Brand of Sacrifice that attracts demonic apostles of the God Hand every night, he wields the colossal Dragon Slayer slab of iron across a dark medieval realm.',
        coverImage: buildProxiedImageUrl(
          'https://cdn.myanimelist.net/images/manga/1/157897l.jpg',
          'BERSERK',
          'manga',
          'mecha'
        ),
        rating: 4.99,
        totalViews: 5340000,
        releaseDay: 'Friday',
        chaptersCount: 3,
        latestChapterId: 'ch-berserk-3',
        featured: false,
        mangadexId: '801513ba-a712-498c-8f57-cae55b38cc92',
        malId: 2,
      },
      {
        id: 'series-chainsaw-man',
        slug: 'chainsaw-man',
        title: 'Chainsaw Man',
        origin: 'manga',
        japaneseTitle: 'チェンソーマン',
        malayalamTitle: 'ചെയിൻസോ മാൻ (Chainsaw Man)',
        malayalamSynopsis:
          'തന്റെ വളർത്തു ചെയിൻസോ ഡെവിൾ പൊച്ചീറ്റയുമായി ലയിച്ച് ചെയിൻസോ മാനായി മാറുന്ന ഡെൻജി പബ്ലിക് സേഫ്റ്റി ഡെവിൾ ഹണ്ടേഴ്സിന്റെ ഭാഗമാകുന്നു.',
        author: 'Tatsuki Fujimoto',
        artist: 'Tatsuki Fujimoto',
        type: 'manga',
        genres: ['Shonen', 'Action', 'Supernatural'],
        status: 'Ongoing',
        synopsis:
          'Denji has a simple dream—to live a happy and peaceful life. Betrayed by the yakuza he worked for to pay off his deceased father\'s debt, his pet devil Pochita merges with his heart, granting him the power to pull the cord on his chest and transform into Chainsaw Man.',
        coverImage: buildProxiedImageUrl(
          'https://cdn.myanimelist.net/images/manga/3/216464l.jpg',
          'CHAINSAW MAN',
          'manga',
          'cyberpunk'
        ),
        rating: 4.91,
        totalViews: 3890000,
        releaseDay: 'Tuesday',
        chaptersCount: 3,
        latestChapterId: 'ch-chainsaw-man-3',
        featured: false,
        mangadexId: 'a77742b1-befd-49a4-bff5-1ad4e6b0ef7b',
        malId: 116778,
      },
      {
        id: 'series-horimiya',
        slug: 'horimiya',
        title: 'Horimiya',
        origin: 'manga',
        japaneseTitle: 'ホリミヤ',
        malayalamTitle: 'ഹൊറിമിയ (Horimiya)',
        malayalamSynopsis:
          'സ്കൂളിൽ തിളങ്ങുന്ന ക്യോക്കോ ഹോറിയും ശാന്തനായ ഇസുമി മിയാമുറയും സ്കൂളിന് പുറത്തുള്ള തങ്ങളുടെ യഥാർത്ഥ രഹസ്യ ജീവിതം പരസ്പരം തിരിച്ചറിയുമ്പോൾ വിരിയുന്ന സൗഹൃദവും പ്രണയവും.',
        author: 'HERO',
        artist: 'Daisuke Hagiwara',
        type: 'manga',
        genres: ['Romance', 'Slice of Life', 'Comedy'],
        status: 'Completed',
        synopsis:
          'Although admired at school for her amiability and academic prowess, high school student Kyouko Hori has been hiding another side of herself. One afternoon, a pierced and tattooed boy brings her little brother home—revealing himself to be her quiet, bespectacled classmate Izumi Miyamura.',
        coverImage: buildProxiedImageUrl(
          'https://cdn.myanimelist.net/images/manga/2/169878l.jpg',
          'HORIMIYA',
          'manga',
          'cafe'
        ),
        rating: 4.88,
        totalViews: 1940000,
        releaseDay: 'Saturday',
        chaptersCount: 3,
        latestChapterId: 'ch-horimiya-3',
        featured: false,
        mangadexId: 'a25e46ec-30f7-4db6-89df-cacbc1d9a900',
        malId: 42451,
      },

      // ==================== CHINESE MANHUA ====================
      {
        id: 'series-tales-of-demons-and-gods',
        slug: 'tales-of-demons-and-gods',
        title: 'Tales of Demons and Gods',
        origin: 'manhua',
        chineseTitle: '妖神记',
        malayalamTitle: 'ടെയിൽസ് ഓഫ് ഡെമൺസ് ആൻഡ് ഗോഡ്സ്',
        malayalamSynopsis:
          'സേജ് എംപററുമായുള്ള യുദ്ധത്തിൽ കൊല്ലപ്പെട്ട നീ ലീ, ടെമ്പറൽ ഡെമൺ സ്പിരിറ്റ് ബുക്കിന്റെ സഹായത്തോടെ തന്റെ പതിമൂന്നാം വയസ്സിലേക്ക് പുനർജനിച്ച് ഗ്ലോറി സിറ്റിയെ രക്ഷിക്കാൻ ഒരുങ്ങുന്നു.',
        author: 'Mad Snail',
        artist: 'Jiang Ruotai',
        type: 'webtoon',
        genres: ['Cultivation', 'Martial Arts', 'Wuxia'],
        status: 'Ongoing',
        synopsis:
          'Killed by a Sage Emperor and reborn as his 13-year-old self through the mystical Temporal Demon Spirit Book, Nie Li is given a second chance to cultivate from the lowest bronze rank and protect Glory City and his beloved Ye Ziyun from destruction.',
        coverImage: buildProxiedImageUrl(
          'https://cdn.myanimelist.net/images/manga/1/191295l.jpg',
          'DEMONS AND GODS',
          'webtoon',
          'dungeon'
        ),
        rating: 4.86,
        totalViews: 2450000,
        releaseDay: 'Thursday',
        chaptersCount: 3,
        latestChapterId: 'ch-tales-of-demons-and-gods-3',
        featured: false,
        mangadexId: '812f9696-048f-496d-9ed4-84c99345d1fb',
        malId: 93357,
      },
      {
        id: 'series-martial-peak',
        slug: 'martial-peak',
        title: 'Martial Peak',
        origin: 'manhua',
        chineseTitle: '武炼巅峰',
        malayalamTitle: 'മാർഷ്യൽ പീക്ക് (Martial Peak)',
        malayalamSynopsis:
          'ഹൈ ഹെവൻ പവിലിയനിലെ തൂപ്പുകാരനായ യാങ് കൈ നിഗൂഢമായ കറുത്ത ഗ്രന്ഥം കണ്ടെത്തുകയും ആയോധനകലയുടെ കൊടുമുടിയിലേക്ക് കഠിനമായ പരീക്ഷണങ്ങളിലൂടെ കയറുകയും ചെയ്യുന്നു.',
        author: 'Momo',
        artist: 'Pikapi',
        type: 'webtoon',
        genres: ['Cultivation', 'Martial Arts', 'Action'],
        status: 'Ongoing',
        synopsis:
          'The journey to the martial peak is a lonely, solitary and long one. High Heaven Pavilion trial disciple and humble sweeper Yang Kai obtains a mysterious black stone book that sets him on a relentless path through the Star Boundary and Outer Universe.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/b1461071-bfbb-43e7-a5b6-a7ba5904649f/d175e74d-4ab7-47f4-8196-371aa51d8c2d.png.512.jpg',
          'MARTIAL PEAK',
          'webtoon',
          'shadow'
        ),
        rating: 4.84,
        totalViews: 3110000,
        releaseDay: 'Saturday',
        chaptersCount: 3,
        latestChapterId: 'ch-martial-peak-3',
        featured: false,
        mangadexId: 'b1461071-bfbb-43e7-a5b6-a7ba5904649f',
      },
      {
        id: 'series-apotheosis',
        slug: 'apotheosis',
        title: 'Apotheosis',
        origin: 'manhua',
        chineseTitle: '百炼成神',
        malayalamTitle: 'അപ്പോത്തിയോസിസ് (Apotheosis)',
        malayalamSynopsis:
          'തന്റെ കുടുംബത്തിന്റെ പതനത്തിന് ശേഷം അടിമയാക്കപ്പെട്ട ലുവോ സെങ്, പുരാതന ദൈവിക ശുദ്ധീകരണ ഗ്രന്ഥത്തിലൂടെ സ്വന്തം ശരീരത്തെ തന്നെ ഒരു ദിവ്യ ആയുധമായി മാറ്റിയെടുക്കുന്നു.',
        author: 'Ranzai Studio',
        artist: 'Ranzai Studio',
        type: 'webtoon',
        genres: ['Cultivation', 'Wuxia', 'Fantasy'],
        status: 'Ongoing',
        synopsis:
          'Luo Zheng, formerly the young master of the Luo family, was degraded to a humble family target dummy after his father was betrayed. Through a supreme ancient cauldron refinement scripture left behind by his father, he refines his mortal flesh into an indestructible divine artifact.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/cdae359d-5fa9-4d4e-b11a-69dd32b09742/601a10fc-61aa-4102-9387-f6bf613fb934.jpg.512.jpg',
          'APOTHEOSIS',
          'webtoon',
          'celestial'
        ),
        rating: 4.81,
        totalViews: 1890000,
        releaseDay: 'Monday',
        chaptersCount: 3,
        latestChapterId: 'ch-apotheosis-3',
        featured: false,
        mangadexId: 'cdae359d-5fa9-4d4e-b11a-69dd32b09742',
      },

      // ==================== EXPANDED KOREAN MANHWA & WEBTOONS ====================
      {
        id: 'series-return-of-mount-hua',
        slug: 'return-of-the-mount-hua-sect',
        title: 'Return of the Blossoming Blade',
        origin: 'manhwa',
        koreanTitle: '화산귀환',
        malayalamTitle: 'റിട്ടേൺ ഓഫ് ദി മൗണ്ട് ഹുവ സെക്റ്റ്',
        malayalamSynopsis:
          'പൈശാചിക കൾട്ട് നേതാവിനെ പരാജയപ്പെടുത്തി നൂറുവർഷത്തിനുശേഷം പുനർജനിക്കുന്ന പ്ലം ബ്ലോസം വാൾപ്പയറ്റുകാരൻ ചങ് മ്യുങ് തകർന്നുപോയ മൗണ്ട് ഹുവ വിഭാഗത്തെ വീണ്ടും പ്രതാപത്തിലേക്ക് ഉയർത്തുന്നു.',
        author: 'Biga',
        artist: 'LICO',
        type: 'webtoon',
        genres: ['Martial Arts', 'Action', 'Comedy'],
        status: 'Ongoing',
        synopsis:
          'Chung Myung, the 13th Disciple of the Great Flowery Mountain Sect and the Plum Blossom Sword Saint, slays the Heavenly Demon only to awaken a hundred years later in the body of a beggar boy—discovering his beloved sect has fallen into complete ruin.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/f0f62b75-5989-4f32-9b59-ab56abe35fc1/e06dc49c-60d3-41c1-8026-30e9c197c9c0.jpg.512.jpg',
          'BLOSSOMING BLADE',
          'webtoon',
          'crimson'
        ),
        rating: 4.96,
        totalViews: 3450000,
        releaseDay: 'Wednesday',
        chaptersCount: 3,
        latestChapterId: 'ch-return-of-mount-hua-3',
        featured: false,
        mangadexId: 'f0f62b75-5989-4f32-9b59-ab56abe35fc1',
      },
      {
        id: 'series-nano-machine',
        slug: 'nano-machine',
        title: 'Nano Machine',
        origin: 'manhwa',
        koreanTitle: '나노마신',
        malayalamTitle: 'നാനോ മെഷീൻ (Nano Machine)',
        malayalamSynopsis:
          'ഭാവിയിൽ നിന്നുള്ള ഒരു പിൻഗാമി കുത്തിവെച്ച നാനോ മെഷീനുകളുടെ സഹായത്തോടെ പൈശാചിക കൾട്ടിലെ അനാഥ രാജകുമാരൻ ചിയോൻ ഇയോ-വൂൺ പരമോന്നത ആയോധനകലാകാരനായി മാറുന്നു.',
        author: 'Han-Joong-Wol-Ya',
        artist: 'Geum-Gang-Bul-Goe',
        type: 'webtoon',
        genres: ['Martial Arts', 'Action', 'System'],
        status: 'Ongoing',
        synopsis:
          'After being held in disdain and having his life put in danger inside the Demonic Cult, an orphan prince named Cheon Yeo-Woon receives a mysterious nanomachine injection from a descendant from the future—unlocking an AI combat system inside his brain.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/6e4805a6-75ab-462d-883c-4ddedb8e4df6/16406b53-9224-4639-8511-9951484ad99a.jpg.512.jpg',
          'NANO MACHINE',
          'webtoon',
          'cyberpunk'
        ),
        rating: 4.91,
        totalViews: 3120000,
        releaseDay: 'Thursday',
        chaptersCount: 3,
        latestChapterId: 'ch-nano-machine-3',
        featured: false,
        mangadexId: '6e4805a6-75ab-462d-883c-4ddedb8e4df6',
      },
      {
        id: 'series-eleceed',
        slug: 'eleceed',
        title: 'Eleceed',
        origin: 'manhwa',
        koreanTitle: '일렉시드',
        malayalamTitle: 'ഇലക്സീഡ് (Eleceed)',
        malayalamSynopsis:
          'മിന്നൽ വേഗതയുള്ള സൗമ്യനായ സ്കൂൾ വിദ്യാർത്ഥി ജിയിയോയും തടിച്ച പൂച്ചയുടെ ശരീരത്തിൽ കുടുങ്ങിപ്പോയ ലോകത്തിലെ ഏറ്റവും ശക്തനായ എവെയ്ക്കനർ കെയ്ഡനും ചേർന്ന് നടത്തുന്ന പോരാട്ടങ്ങൾ.',
        author: 'Son Jeho',
        artist: 'ZHENA',
        type: 'webtoon',
        genres: ['Action', 'Supernatural', 'Comedy'],
        status: 'Ongoing',
        synopsis:
          'Jiwoo is a kind-hearted young man who harnesses the lightning-fast reflexes of a cat to secretly make the world a better place. Kayden is a fugitive supreme Awakener who winds up trapped inside the body of a chubby orange street cat.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/7e544761-7d3d-4fce-8137-719814d7d138/52cf193d-6862-43e8-9de4-1025c0e6e297.jpg.512.jpg',
          'ELECEED',
          'webtoon',
          'celestial'
        ),
        rating: 4.94,
        totalViews: 2890000,
        releaseDay: 'Tuesday',
        chaptersCount: 3,
        latestChapterId: 'ch-eleceed-3',
        featured: false,
        mangadexId: '7e544761-7d3d-4fce-8137-719814d7d138',
      },
      {
        id: 'series-greatest-estate-developer',
        slug: 'the-greatest-estate-developer',
        title: 'The Greatest Estate Developer',
        origin: 'manhwa',
        koreanTitle: '역대급 영지 설계사',
        malayalamTitle: 'ദി ഗ്രേറ്റസ്റ്റ് എസ്റ്റേറ്റ് ഡെവലപ്പർ',
        malayalamSynopsis:
          'സിവിൽ എഞ്ചിനീയറിംഗ് വിദ്യാർത്ഥിയായ സുഹോ കിം ഒരു ഫാന്റസി നോവലിലെ കടക്കെണിയിലായ പ്രഭുവായി പുനർജനിച്ച് ആധുനിക നിർമ്മാണ വിദ്യകളിലൂടെ സാമ്രാജ്യം പണിയുന്നു.',
        author: 'BK_Moon',
        artist: 'Lee Hyunmin / Kim Hyunsoo',
        type: 'webtoon',
        genres: ['Comedy', 'Fantasy', 'System'],
        status: 'Ongoing',
        synopsis:
          'When civil engineering student Suho Kim falls asleep reading a fantasy novel, he wakes up as Lloyd Frontera, a lazy noble in a debt-ridden fiefdom. Armed with modern engineering blueprints and a monstrous shovel, he schemes his way into riches.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/d7f56ace-cd30-48b9-8b64-afeca0077fca/c2613a1e-426f-4ee3-a6f7-caf003324dc7.jpg.512.jpg',
          'ESTATE DEVELOPER',
          'webtoon',
          'dungeon'
        ),
        rating: 4.97,
        totalViews: 3290000,
        releaseDay: 'Friday',
        chaptersCount: 3,
        latestChapterId: 'ch-greatest-estate-developer-3',
        featured: false,
        mangadexId: 'd7f56ace-cd30-48b9-8b64-afeca0077fca',
      },
      {
        id: 'series-northern-blade',
        slug: 'legend-of-the-northern-blade',
        title: 'Legend of the Northern Blade',
        origin: 'manhwa',
        koreanTitle: '북검전기',
        malayalamTitle: 'ലെജൻഡ് ഓഫ് ദി നോർത്തേൺ ബ്ലേഡ്',
        malayalamSynopsis:
          'വടക്കൻ സ്വർഗ്ഗീയ വിഭാഗത്തിന്റെ അവസാന പിൻഗാമിയായ ജിൻ മു-വോൺ രഹസ്യമായി വാൾവിദ്യ അഭ്യസിച്ച് തന്റെ പിതാവിനെ ചതിച്ചവർക്കെതിരെ പ്രതികാരം ചെയ്യാൻ ഇറങ്ങുന്നു.',
        author: 'Woo-Gak',
        artist: 'Hae-Min',
        type: 'webtoon',
        genres: ['Martial Arts', 'Action', 'Wuxia'],
        status: 'Completed',
        synopsis:
          'After the Northern Heavenly Sect is betrayed by the Central Heavenly Alliance and its leader is forced to take his own life, his sole son Jin Mu-Won is left behind under constant surveillance—secretly mastering the lost martial arts carved into the sect walls.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/9ed16bc9-f570-4e71-8dda-aebc098b683b/8a917622-1853-47b7-9114-997da510a8a2.jpg.512.jpg',
          'NORTHERN BLADE',
          'webtoon',
          'shadow'
        ),
        rating: 4.95,
        totalViews: 2940000,
        releaseDay: 'Wednesday',
        chaptersCount: 3,
        latestChapterId: 'ch-northern-blade-3',
        featured: false,
        mangadexId: '9ed16bc9-f570-4e71-8dda-aebc098b683b',
      },
      {
        id: 'series-sss-suicide-hunter',
        slug: 'sss-class-suicide-hunter',
        title: 'SSS-Class Revival Hunter',
        origin: 'manhwa',
        koreanTitle: 'SSS급 죽어야 사는 헌터',
        malayalamTitle: 'SSS-ക്ലാസ് റിവൈവൽ ഹണ്ടർ',
        malayalamSynopsis:
          'തന്നെ കൊല്ലുന്നവരുടെ കഴിവ് പകർത്താനും മരണശേഷം 24 മണിക്കൂർ പിന്നോട്ട് സഞ്ചരിക്കാനും സാധിക്കുന്ന എഫ്-റാങ്ക് ഹണ്ടർ കിം ഗോങ്-ജ ഗോപുരത്തിന്റെ മുകളിലേക്ക് കയറുന്നു.',
        author: 'Shin Noah',
        artist: 'Bill K',
        type: 'webtoon',
        genres: ['Action', 'System', 'Fantasy'],
        status: 'Ongoing',
        synopsis:
          'Confucius Kim, an envious F-Rank hunter at the bottom of the Tower, awakens an S-Rank skill that copies one ability from whoever kills him—combined with a regressor skill that rewinds time by 24 hours upon death.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/4a973243-952e-44d7-a50f-883b4b7c9cc2/9adafa19-0424-4677-aab4-93a07a01a591.jpg.512.jpg',
          'SSS REVIVAL HUNTER',
          'webtoon',
          'crimson'
        ),
        rating: 4.93,
        totalViews: 2680000,
        releaseDay: 'Thursday',
        chaptersCount: 3,
        latestChapterId: 'ch-sss-suicide-hunter-3',
        featured: false,
        mangadexId: '4a973243-952e-44d7-a50f-883b4b7c9cc2',
      },
      {
        id: 'series-mercenary-enrollment',
        slug: 'mercenary-enrollment',
        title: 'Teenage Mercenary',
        origin: 'manhwa',
        koreanTitle: '입학용병',
        malayalamTitle: 'ടീനേജ് മെർസിനറി (Mercenary Enrollment)',
        malayalamSynopsis:
          'വിമാനാപകടത്തിൽ രക്ഷപ്പെട്ട് പത്ത് വർഷക്കാലം കൂലിപ്പടയാളിയായി ജീവിച്ച യു ഇജിൻ തന്റെ കുടുംബത്തെയും സഹോദരിയെയും സംരക്ഷിക്കാൻ കൊറിയയിലേക്ക് മടങ്ങിയെത്തുന്നു.',
        author: 'YC',
        artist: 'Rakyeon',
        type: 'webtoon',
        genres: ['Action', 'Drama', 'Slice of Life'],
        status: 'Ongoing',
        synopsis:
          'At the age of eight, Ijin Yu lost his parents in a plane crash and became stranded in a foreign warzone, forced to become elite child mercenary Number 001 in order to survive. Ten years later, he returns home to Korea to protect his grandfather and little sister.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/9ecd208c-c592-4462-9f57-4d7d4a9f956f/75e7fac6-c9f4-43ce-ae0e-cbf06f28f99b.jpg.512.jpg',
          'TEENAGE MERCENARY',
          'webtoon',
          'mecha'
        ),
        rating: 4.89,
        totalViews: 2510000,
        releaseDay: 'Saturday',
        chaptersCount: 3,
        latestChapterId: 'ch-mercenary-enrollment-3',
        featured: false,
        mangadexId: '9ecd208c-c592-4462-9f57-4d7d4a9f956f',
      },
      {
        id: 'series-lookism',
        slug: 'lookism',
        title: 'Lookism',
        origin: 'manhwa',
        koreanTitle: '외모지상주의',
        malayalamTitle: 'ലുക്കിസം (Lookism)',
        malayalamSynopsis:
          'സ്കൂളിൽ പരിഹാസപാത്രമായിരുന്ന പാർക്ക് ഹ്യോങ്-സോക്കിന് ഉറക്കമുണരുമ്പോൾ മാറിമാറി ഉപയോഗിക്കാൻ കഴിയുന്ന സുന്ദരവും കരുത്തുറ്റതുമായ രണ്ടാമതൊരു ശരീരം ലഭിക്കുന്നു.',
        author: 'Park Tae-jun',
        artist: 'Park Tae-jun',
        type: 'webtoon',
        genres: ['Action', 'Drama', 'Supernatural'],
        status: 'Ongoing',
        synopsis:
          'Daniel Park is an overweight, relentlessly bullied high schooler until he miraculously wakes up one morning in a second, tall, athletic, and impossibly handsome body—switching consciousness between his two bodies whenever one falls asleep.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/596191eb-69ee-4401-983e-cc07e277fa17/6df15145-f15b-43f0-b87b-22fd3694eaca.jpg.512.jpg',
          'LOOKISM',
          'webtoon',
          'cyberpunk'
        ),
        rating: 4.87,
        totalViews: 3040000,
        releaseDay: 'Friday',
        chaptersCount: 3,
        latestChapterId: 'ch-lookism-3',
        featured: false,
        mangadexId: '596191eb-69ee-4401-983e-cc07e277fa17',
      },
      {
        id: 'series-doom-breaker',
        slug: 'doom-breaker',
        title: 'Doom Breaker',
        origin: 'manhwa',
        koreanTitle: '투신전생기',
        malayalamTitle: 'ഡൂം ബ്രേക്കർ (Doom Breaker)',
        malayalamSynopsis:
          'മനുഷ്യരാശിയുടെ അവസാന പോരാളിയായ സെഫിർ ടാർട്ടറസിനോട് പരാജയപ്പെടുമ്പോൾ ദൈവങ്ങൾ അവനെ പത്ത് വർഷം പിന്നോട്ട് അയച്ച് വിധി തിരുത്തിയെഴുതാൻ അവസരം നൽകുന്നു.',
        author: 'Cheongdam',
        artist: 'Cheongdam',
        type: 'webtoon',
        genres: ['Action', 'Fantasy', 'Adventure'],
        status: 'Ongoing',
        synopsis:
          'Zephyr is the last human fighting evil in a world abandoned by the gods. When he is slain in battle by Tartarus, the God of Destruction, the gods find his defiance amusing enough to send him ten years into the past to rewrite humanity\'s fate.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/773c2211-750b-4fff-bd64-c914986e4637/cf60f76c-19fa-441f-b20d-9528180aaff7.jpg.512.jpg',
          'DOOM BREAKER',
          'webtoon',
          'crimson'
        ),
        rating: 4.90,
        totalViews: 2150000,
        releaseDay: 'Sunday',
        chaptersCount: 3,
        latestChapterId: 'ch-doom-breaker-3',
        featured: false,
        mangadexId: '773c2211-750b-4fff-bd64-c914986e4637',
      },
      {
        id: 'series-leviathan',
        slug: 'leviathan',
        title: 'Leviathan',
        origin: 'manhwa',
        koreanTitle: '심해수',
        malayalamTitle: 'ലെവിയാത്തൻ (Leviathan)',
        malayalamSynopsis:
          'സമുദ്രനിരപ്പ് ഉയർന്ന് ഭൂമി മുഴുവൻ വെള്ളത്തിനടിയിലായ ഭാവിയിൽ ഭീമാകാരമായ കടൽ രാക്ഷസന്മാരിൽ നിന്ന് രക്ഷപ്പെടാൻ പൊരുതുന്ന ബോത്തയുടെയും റീത്തയുടെയും അതിജീവന കഥ.',
        author: 'Lee Gyuntak',
        artist: 'Noh Miyoung',
        type: 'webtoon',
        genres: ['Action', 'Adventure', 'Dark Fantasy'],
        status: 'Completed',
        synopsis:
          'In a post-apocalyptic Earth completely submerged beneath a boundless ocean, monstrous deep-sea leviathans rule the waters. Young Bota and his sister Rita fight to survive alongside harpoon hunters aboard drifting salvage vessels.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/274a8e39-71a8-4bd2-af19-4572518fe44f/272c092f-3933-4ab8-92e4-6a61606178bf.png.512.jpg',
          'LEVIATHAN',
          'webtoon',
          'dungeon'
        ),
        rating: 4.91,
        totalViews: 1920000,
        releaseDay: 'Monday',
        chaptersCount: 3,
        latestChapterId: 'ch-leviathan-3',
        featured: false,
        mangadexId: '274a8e39-71a8-4bd2-af19-4572518fe44f',
      },
      {
        id: 'series-latna-saga',
        slug: 'latna-saga',
        title: 'Latna Saga: Survival of a Sword King',
        origin: 'manhwa',
        koreanTitle: '이계 검왕 생존기',
        malayalamTitle: 'ലാറ്റ്ന സാഗ: സർവൈവൽ ഓഫ് എ സ്വോർഡ് കിംഗ്',
        malayalamSynopsis:
          'തകരാറിലായ ഗൈഡ്‌ലൈൻ കാരണം ഇരുപത്തിരണ്ട് വർഷം നരകതുല്യമായ മലനിരകളിൽ കുടുങ്ങിപ്പോയ റ്യൂ ഹാൻ-ബിൻ അമാനുഷിക കരുത്തുമായി രഥ്‌ന ലോകത്തേക്ക് ഇറങ്ങുന്നു.',
        author: 'Kwon Sun-kyu',
        artist: 'Studio Khit',
        type: 'webtoon',
        genres: ['Action', 'Fantasy', 'Adventure'],
        status: 'Ongoing',
        synopsis:
          'Discharged soldier Ryu Han-Bin is summoned to the fantasy world of Rath\'na, but a glitched system guideline traps him in a tutorial mountain filled with hellhounds for 22 years—turning him into an unstoppable level-5 colossus of pure Aura.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/478e6926-b8bc-465c-9694-2bae1dbaf32b/cdfef0bf-c380-4880-9d89-683f0cd12440.png.512.jpg',
          'LATNA SAGA',
          'webtoon',
          'mecha'
        ),
        rating: 4.88,
        totalViews: 2080000,
        releaseDay: 'Tuesday',
        chaptersCount: 3,
        latestChapterId: 'ch-latna-saga-3',
        featured: false,
        mangadexId: '478e6926-b8bc-465c-9694-2bae1dbaf32b',
      },
      {
        id: 'series-pick-me-up',
        slug: 'pick-me-up-infinite-gacha',
        title: 'Pick Me Up, Infinite Gacha',
        origin: 'manhwa',
        koreanTitle: '픽 미 업!',
        malayalamTitle: 'പിക്ക് മീ അപ്പ്, ഇൻഫിനിറ്റ് ഗാച്ച',
        malayalamSynopsis:
          'ലോകത്തിലെ ഏറ്റവും കഠിനമായ മൊബൈൽ ഗാച്ച ഗെയിമിലെ വൺ-സ്റ്റാർ ഹീറോ ആയി ഗെയിമിനുള്ളിലേക്ക് വലിച്ചെറിയപ്പെടുന്ന ടോപ്പ് പ്ലെയർ ലോക്കി അതിജീവനത്തിനായി പോരാടുന്നു.',
        author: 'Hermod',
        artist: 'Utoon',
        type: 'webtoon',
        genres: ['Action', 'System', 'Fantasy'],
        status: 'Ongoing',
        synopsis:
          'Loki, the world\'s 5th-ranked master of the brutal mobile game "Pick Me Up!", loses consciousness mid-dungeon and wakes up inside the game Lobby as "Han Islat"—a disposable 1-star hero under a novice summoner where hero death is permanent.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/58167656-a065-4b49-b499-bd73d00555d5/a9392e62-78b1-4b08-beed-ea2e5088c0a2.jpg.512.jpg',
          'PICK ME UP',
          'webtoon',
          'shadow'
        ),
        rating: 4.92,
        totalViews: 2340000,
        releaseDay: 'Wednesday',
        chaptersCount: 3,
        latestChapterId: 'ch-pick-me-up-3',
        featured: false,
        mangadexId: '58167656-a065-4b49-b499-bd73d00555d5',
      },
      {
        id: 'series-overgeared',
        slug: 'overgeared',
        title: 'Overgeared',
        origin: 'manhwa',
        koreanTitle: '템빨',
        malayalamTitle: 'ഓവർഗിയേർഡ് (Overgeared)',
        malayalamSynopsis:
          'സാറ്റിസ്ഫൈ എന്ന വിആർ ഗെയിമിൽ ഇതിഹാസ കമ്മാരനായ പഗ്മയുടെ പിൻഗാമി ക്ലാസ് നേടുന്ന ഗ്രിഡ് സ്വന്തമായി നിർമ്മിക്കുന്ന ദിവ്യ ആയുധങ്ങളിലൂടെ ലോകത്തെ കീഴടക്കുന്നു.',
        author: 'Park Saenal',
        artist: 'Team Argo (Redice Studio)',
        type: 'webtoon',
        genres: ['Action', 'System', 'Adventure'],
        status: 'Ongoing',
        synopsis:
          'Shin Youngwoo is an unlucky debt-ridden player in the world\'s top VRMMORPG "Satisfy" until he stumbles upon Pagma\'s Rare Book—unlocking the first Legendary Blacksmith class capable of forging divine-grade equipment.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/3fc308c9-4b00-4dc3-943e-1f39242bc708/2af0c6f7-cd3d-4c59-afee-a8ff471e0561.jpg.512.jpg',
          'OVERGEARED',
          'webtoon',
          'celestial'
        ),
        rating: 4.85,
        totalViews: 2210000,
        releaseDay: 'Saturday',
        chaptersCount: 3,
        latestChapterId: 'ch-overgeared-3',
        featured: false,
        mangadexId: '3fc308c9-4b00-4dc3-943e-1f39242bc708',
      },
      {
        id: 'series-second-life-ranker',
        slug: 'second-life-ranker',
        title: 'Second Life Ranker',
        origin: 'manhwa',
        koreanTitle: '두 번째 삶은 랭커',
        malayalamTitle: 'സെക്കൻഡ് ലൈഫ് റാങ്കർ',
        malayalamSynopsis:
          'ഒബെലിസ്ക് ഗോപുരത്തിൽ ചതിക്കപ്പെട്ട് കൊല്ലപ്പെട്ട തന്റെ ഇരട്ട സഹോദരന്റെ പോക്കറ്റ് വാച്ചിലെ ഡയറിക്കുറിപ്പുകളുമായി യോൺ-വൂ പ്രതികാരത്തിനായി ഗോപുരത്തിൽ പ്രവേശിക്കുന്നു.',
        author: 'Sadoyeon',
        artist: 'Nongnong',
        type: 'webtoon',
        genres: ['Action', 'System', 'Fantasy'],
        status: 'Ongoing',
        synopsis:
          'Yeon-woo\'s twin brother disappeared five years ago, only for his pocket watch to return containing a hidden audio diary of how he was betrayed inside the Obelisk, the Tower of the Sun God. Wearing a cold mask, Yeon-woo enters the Tower to hunt down every conspirator.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/1ffca916-3ad7-46d2-9591-a9b39e639971/60aef1af-2df0-46aa-8270-e1ad9d287289.jpg.512.jpg',
          'SECOND LIFE RANKER',
          'webtoon',
          'shadow'
        ),
        rating: 4.86,
        totalViews: 1990000,
        releaseDay: 'Thursday',
        chaptersCount: 3,
        latestChapterId: 'ch-second-life-ranker-3',
        featured: false,
        mangadexId: '1ffca916-3ad7-46d2-9591-a9b39e639971',
      },
      {
        id: 'series-villains-destined-to-die',
        slug: 'villains-are-destined-to-die',
        title: 'Villains Are Destined to Die',
        origin: 'manhwa',
        koreanTitle: '악역의 엔딩은 죽음뿐',
        malayalamTitle: 'വില്ലൻസ് ആർ ഡെസ്റ്റിൻഡ് ടു ഡൈ',
        malayalamSynopsis:
          'ഒരു റൊമാൻസ് ഗെയിമിലെ ഹാർഡ് മോഡ് വില്ലത്തിയായ പെനെലോപ്പ് എക്കാർട്ടായി ഉണരുന്ന യുവതി മരണത്തിൽ നിന്ന് രക്ഷപ്പെടാൻ അഞ്ച് അപകടകാരികളായ നായകന്മാരുടെ പ്രീതി നേടാൻ ശ്രമിക്കുന്നു.',
        author: 'Gwon Gyeoeul',
        artist: 'SUOL',
        type: 'webtoon',
        genres: ['Romance', 'Fantasy', 'Drama'],
        status: 'Ongoing',
        synopsis:
          'Reincarnated into a reverse-harem dating sim on Hard Mode as Penelope Eckhart—the despised adopted daughter of Duke Eckhart—every wrong dialogue choice leads to immediate execution unless she raises a male lead\'s favorability before the real daughter returns.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/14569f2f-f66a-4c67-ac7f-a37823a0fa23/622ee7fa-b3fc-423d-85ad-7ecfaea85bef.png.512.jpg',
          'VILLAINS DESTINED TO DIE',
          'webtoon',
          'crimson'
        ),
        rating: 4.93,
        totalViews: 2430000,
        releaseDay: 'Friday',
        chaptersCount: 3,
        latestChapterId: 'ch-villains-destined-to-die-3',
        featured: false,
        mangadexId: '14569f2f-f66a-4c67-ac7f-a37823a0fa23',
      },
      {
        id: 'series-who-made-me-a-princess',
        slug: 'who-made-me-a-princess',
        title: 'Who Made Me a Princess',
        origin: 'manhwa',
        koreanTitle: '어느 날 공주가 되어버렸다',
        malayalamTitle: 'ഹൂ മെയ്ഡ് മീ എ പ്രിൻസസ്',
        malayalamSynopsis:
          'ക്രൂരനായ ക്ലോഡ് ചക്രവർത്തിയുടെ കൈകളാൽ പതിനെട്ടാം വയസ്സിൽ കൊല്ലപ്പെടാൻ വിധിക്കപ്പെട്ട അത്തനേഷ്യ രാജകുമാരിയായി പുനർജനിക്കുന്ന യുവതി തന്റെ വിധി മാറ്റിയെഴുതുന്നു.',
        author: 'Plutus',
        artist: 'Spoon',
        type: 'webtoon',
        genres: ['Romance', 'Fantasy', 'Comedy'],
        status: 'Completed',
        synopsis:
          'After waking up as Athanasia de Alger Obelia, an abandoned imperial princess fated to be executed by her cold-blooded father Emperor Claude on her 18th birthday, she resolves to survive through charm, secret gold stashes, and magic.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/722a45c0-5e55-40f2-929b-ff69b0989edb/1b24d6dc-04a2-466b-a5d7-b86dde5087d3.jpg.512.jpg',
          'WHO MADE ME A PRINCESS',
          'webtoon',
          'cafe'
        ),
        rating: 4.91,
        totalViews: 2560000,
        releaseDay: 'Sunday',
        chaptersCount: 3,
        latestChapterId: 'ch-who-made-me-a-princess-3',
        featured: false,
        mangadexId: '722a45c0-5e55-40f2-929b-ff69b0989edb',
      },

      // ==================== EXPANDED JAPANESE MANGA ====================
      {
        id: 'series-vagabond',
        slug: 'vagabond',
        title: 'Vagabond',
        origin: 'manga',
        japaneseTitle: 'バガボンド',
        malayalamTitle: 'വാഗബോണ്ട് (Vagabond)',
        malayalamSynopsis:
          'സെക്കിഗഹാര യുദ്ധത്തിന് ശേഷം ഷിൻമെൻ തകെസോ എന്ന പേരുപേക്ഷിച്ച് മിയാമോട്ടോ മുസാഷിയായി മാറുന്ന വാൾപ്പയറ്റുകാരൻ അജയ്യതയുടെ അർത്ഥം തേടി നടത്തുന്ന യാത്ര.',
        author: 'Takehiko Inoue',
        artist: 'Takehiko Inoue',
        type: 'manga',
        genres: ['Seinen', 'Martial Arts', 'Action'],
        status: 'Ongoing',
        synopsis:
          'In 16th-century Sengoku Japan, wild youth Shinmen Takezou survives the Battle of Sekigahara and rechristens himself Miyamoto Musashi, embarking on a blood-soaked pilgrimage of self-discovery to understand what it truly means to be "Invincible Under the Sun."',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/d1a9fdeb-f713-407f-960c-8326b586e6fd/05f8dcb4-8ea1-48db-a0b1-3a8fbf695e5a.jpg.512.jpg',
          'VAGABOND',
          'manga',
          'mecha'
        ),
        rating: 4.98,
        totalViews: 4410000,
        releaseDay: 'Thursday',
        chaptersCount: 3,
        latestChapterId: 'ch-vagabond-3',
        featured: false,
        mangadexId: 'd1a9fdeb-f713-407f-960c-8326b586e6fd',
        malId: 656,
      },
      {
        id: 'series-vinland-saga',
        slug: 'vinland-saga',
        title: 'Vinland Saga',
        origin: 'manga',
        japaneseTitle: 'ヴィンランド・サガ',
        malayalamTitle: 'വിൻലാൻഡ് സാഗ (Vinland Saga)',
        malayalamSynopsis:
          'തന്റെ പിതാവ് തോർസിനെ കൊലപ്പെടുത്തിയ വൈക്കിംഗ് കമാൻഡർ അസ്കെലാഡിനോട് പ്രതികാരം ചെയ്യാൻ യുദ്ധക്കളങ്ങളിലൂടെ സഞ്ചരിക്കുന്ന തോർഫിൻ സമാധാനത്തിന്റെ നാടായ വിൻലാൻഡ് തേടുന്നു.',
        author: 'Makoto Yukimura',
        artist: 'Makoto Yukimura',
        type: 'manga',
        genres: ['Seinen', 'Action', 'Adventure'],
        status: 'Ongoing',
        synopsis:
          'Young Icelandic boy Thorfinn joins the mercenary band of the cunning Viking leader Askeladd solely to earn the right to kill him in an honorable duel for murdering his father Thors—before awakening to a far greater quest for a land without slavery or war.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/5d1fc77e-706a-4fc5-bea8-486c9be0145d/7fa60f5d-285a-40c5-8a1d-9cf375eaf897.jpg.512.jpg',
          'VINLAND SAGA',
          'manga',
          'dungeon'
        ),
        rating: 4.96,
        totalViews: 3780000,
        releaseDay: 'Monday',
        chaptersCount: 3,
        latestChapterId: 'ch-vinland-saga-3',
        featured: false,
        mangadexId: '5d1fc77e-706a-4fc5-bea8-486c9be0145d',
        malId: 642,
      },
      {
        id: 'series-attack-on-titan',
        slug: 'attack-on-titan',
        title: 'Attack on Titan',
        origin: 'manga',
        japaneseTitle: '進撃の巨人',
        malayalamTitle: 'അറ്റാക്ക് ഓൺ ടൈറ്റൻ (Attack on Titan)',
        malayalamSynopsis:
          'ഭീമാകാരമായ ടൈറ്റനുകളിൽ നിന്ന് രക്ഷപ്പെടാൻ കൂറ്റൻ മതിലുകൾക്കുള്ളിൽ കഴിഞ്ഞ മനുഷ്യരാശിക്ക് വേണ്ടി എറൻ യേഗറും സർവേ കോർപ്സും സ്വാതന്ത്ര്യത്തിനായി പോരാടുന്നു.',
        author: 'Hajime Isayama',
        artist: 'Hajime Isayama',
        type: 'manga',
        genres: ['Shonen', 'Dark Fantasy', 'Action'],
        status: 'Completed',
        synopsis:
          'For a century, the remnants of humanity lived behind three concentric walls safe from man-eating Titans—until the Colossal Titan breaches Wall Maria, igniting Eren Yeager\'s relentless march toward freedom and the truth in his father\'s basement.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/304ceac3-8cdb-4fe7-acf7-2b6ff7a60613/29f82b1d-b37f-455a-b630-e42bccb1422a.jpg.512.jpg',
          'ATTACK ON TITAN',
          'manga',
          'crimson'
        ),
        rating: 4.95,
        totalViews: 5120000,
        releaseDay: 'Saturday',
        chaptersCount: 3,
        latestChapterId: 'ch-attack-on-titan-3',
        featured: false,
        mangadexId: '304ceac3-8cdb-4fe7-acf7-2b6ff7a60613',
        malId: 23390,
      },
      {
        id: 'series-death-note',
        slug: 'death-note',
        title: 'Death Note',
        origin: 'manga',
        japaneseTitle: 'デスノート',
        malayalamTitle: 'ഡെത്ത് നോട്ട് (Death Note)',
        malayalamSynopsis:
          'പേരെഴുതുന്ന ആരെയും കൊല്ലാൻ ശേഷിയുള്ള ഷിനിഗാമിയുടെ ഡെത്ത് നോട്ട് ലഭിക്കുന്ന പ്രതിഭാശാലിയായ വിദ്യാർത്ഥി ലൈറ്റ് യാഗാമിയും ഡിറ്റക്ടീവ് എല്ലും തമ്മിലുള്ള ബുദ്ധിപരമായ പോരാട്ടം.',
        author: 'Tsugumi Ohba',
        artist: 'Takeshi Obata',
        type: 'manga',
        genres: ['Supernatural', 'Drama', 'Shonen'],
        status: 'Completed',
        synopsis:
          'High school prodigy Light Yagami discovers a supernatural black notebook dropped by the Shinigami Ryuk that kills anyone whose name is written inside. Attempting to cleanse the world as the god-like "Kira," he enters a deadly cat-and-mouse game with master detective L.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/75ee72ab-c6bf-4b87-badd-de839156934c/d6555598-8202-477d-acde-303202cb3475.jpg.512.jpg',
          'DEATH NOTE',
          'manga',
          'shadow'
        ),
        rating: 4.94,
        totalViews: 4320000,
        releaseDay: 'Tuesday',
        chaptersCount: 3,
        latestChapterId: 'ch-death-note-3',
        featured: false,
        mangadexId: '75ee72ab-c6bf-4b87-badd-de839156934c',
        malId: 21,
      },
      {
        id: 'series-fullmetal-alchemist',
        slug: 'fullmetal-alchemist',
        title: 'Fullmetal Alchemist',
        origin: 'manga',
        japaneseTitle: '鋼の錬金術師',
        malayalamTitle: 'ഫുൾമെറ്റൽ ആൽകെമിസ്റ്റ്',
        malayalamSynopsis:
          'നിരോധിക്കപ്പെട്ട ആൽകെമി പരീക്ഷണത്തിൽ ശരീരഭാഗങ്ങൾ നഷ്ടപ്പെട്ട എഡ്വേർഡ്, അൽഫോൺസ് എൽറിക് സഹോദരന്മാർ ഫിലോസഫേഴ്സ് സ്റ്റോൺ തേടി നടത്തുന്ന യാത്ര.',
        author: 'Hiromu Arakawa',
        artist: 'Hiromu Arakawa',
        type: 'manga',
        genres: ['Shonen', 'Fantasy', 'Adventure'],
        status: 'Completed',
        synopsis:
          'After a forbidden human transmutation ritual to revive their mother costs Edward Elric two limbs and binds his brother Alphonse\'s soul to a suit of armor, the brothers search Amestris for the Philosopher\'s Stone to restore their bodies.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/dd8a907a-3850-4f95-ba03-ba201a8399e3/a9cd0207-1b86-4738-a2b5-3575c32d5315.jpg.512.jpg',
          'FULLMETAL ALCHEMIST',
          'manga',
          'mecha'
        ),
        rating: 4.97,
        totalViews: 4190000,
        releaseDay: 'Wednesday',
        chaptersCount: 3,
        latestChapterId: 'ch-fullmetal-alchemist-3',
        featured: false,
        mangadexId: 'dd8a907a-3850-4f95-ba03-ba201a8399e3',
        malId: 25,
      },
      {
        id: 'series-hunter-x-hunter',
        slug: 'hunter-x-hunter',
        title: 'Hunter x Hunter',
        origin: 'manga',
        japaneseTitle: 'ハンター×ハンター',
        malayalamTitle: 'ഹണ്ടർ x ഹണ്ടർ (Hunter x Hunter)',
        malayalamSynopsis:
          'ഇതിഹാസ ഹണ്ടറായ തന്റെ പിതാവ് ജിംഗിനെ കണ്ടെത്താൻ ഹണ്ടർ പരീക്ഷയിൽ പങ്കെടുക്കുന്ന ഗോൺ ഫ്രീക്സും സുഹൃത്തുക്കളായ കില്ലുവ, കുരാപിക്ക, ലിയോറിയോ എന്നിവരും.',
        author: 'Yoshihiro Togashi',
        artist: 'Yoshihiro Togashi',
        type: 'manga',
        genres: ['Shonen', 'Adventure', 'Action'],
        status: 'Ongoing',
        synopsis:
          'Twelve-year-old Gon Freecss leaves Whale Island to take the grueling Hunter Exam and follow in the footsteps of his legendary father Ging, forging an unbreakable bond with ex-assassin Killua Zoldyck, Kurapika, and Leorio.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/db692d58-4b13-4174-ae8c-30c515c0689c/aa112927-f1e5-4fe4-a4db-7fd4a1536e3c.jpg.512.jpg',
          'HUNTER X HUNTER',
          'manga',
          'celestial'
        ),
        rating: 4.95,
        totalViews: 4050000,
        releaseDay: 'Sunday',
        chaptersCount: 3,
        latestChapterId: 'ch-hunter-x-hunter-3',
        featured: false,
        mangadexId: 'db692d58-4b13-4174-ae8c-30c515c0689c',
        malId: 26,
      },
      {
        id: 'series-bleach',
        slug: 'bleach',
        title: 'Bleach',
        origin: 'manga',
        japaneseTitle: 'ブリーチ',
        malayalamTitle: 'ബ്ലീച്ച് (Bleach)',
        malayalamSynopsis:
          'ആത്മാക്കളെ കാണാൻ കഴിവുള്ള ഇച്ചിഗോ കുറോസാക്കി സോൾ റീപ്പറായ റൂക്കിയ കുച്ചിക്കിയിൽ നിന്ന് ശക്തികൾ സ്വീകരിച്ച് ഹോളോകളിൽ നിന്ന് ലോകത്തെയും സോൾ സൊസൈറ്റിയെയും സംരക്ഷിക്കുന്നു.',
        author: 'Tite Kubo',
        artist: 'Tite Kubo',
        type: 'manga',
        genres: ['Shonen', 'Supernatural', 'Action'],
        status: 'Completed',
        synopsis:
          'High schooler Ichigo Kurosaki has been able to see ghosts his entire life. That changes forever when he meets Rukia Kuchiki, a Soul Reaper who transfers her Zanpakuto powers to him during a Hollow attack on his family.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/239d6260-d71f-43b0-afff-074e3619e3de/032cc781-43eb-4281-956c-7cf991dd0a6a.jpg.512.jpg',
          'BLEACH',
          'manga',
          'shadow'
        ),
        rating: 4.89,
        totalViews: 3920000,
        releaseDay: 'Monday',
        chaptersCount: 3,
        latestChapterId: 'ch-bleach-3',
        featured: false,
        mangadexId: '239d6260-d71f-43b0-afff-074e3619e3de',
        malId: 12,
      },
      {
        id: 'series-demon-slayer',
        slug: 'demon-slayer-kimetsu-no-yaiba',
        title: 'Demon Slayer: Kimetsu no Yaiba',
        origin: 'manga',
        japaneseTitle: '鬼滅の刃',
        malayalamTitle: 'ഡെമൺ സ്ലേയർ: കിമെത്സു നോ യൈബ',
        malayalamSynopsis:
          'കുടുംബത്തെ കൊന്നൊടുക്കിയ പിശാചുക്കളോട് പ്രതികാരം ചെയ്യാനും പിശാചായി മാറിയ സഹോദരി നെസുക്കോയെ മനുഷ്യനാക്കി മാറ്റാനും തൻജിറോ കമാഡോ ഡെമൺ സ്ലേയർ കോർപ്സിൽ ചേരുന്നു.',
        author: 'Koyoharu Gotouge',
        artist: 'Koyoharu Gotouge',
        type: 'manga',
        genres: ['Shonen', 'Action', 'Supernatural'],
        status: 'Completed',
        synopsis:
          'After his family is slaughtered by demons and his younger sister Nezuko is turned into one, kind-hearted charcoal seller Tanjiro Kamado trains in Water and Sun Breathing to join the Demon Slayer Corps and cure his sister.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/789642f8-ca89-4e4e-8f7b-eee4d17ea08b/60530e72-f76f-45d5-b6f9-f95e05058fc3.png.512.jpg',
          'DEMON SLAYER',
          'manga',
          'crimson'
        ),
        rating: 4.91,
        totalViews: 4680000,
        releaseDay: 'Sunday',
        chaptersCount: 3,
        latestChapterId: 'ch-demon-slayer-3',
        featured: false,
        mangadexId: '789642f8-ca89-4e4e-8f7b-eee4d17ea08b',
        malId: 96792,
      },
      {
        id: 'series-spy-x-family',
        slug: 'spy-x-family',
        title: 'SPY×FAMILY',
        origin: 'manga',
        japaneseTitle: 'スパイファミリー',
        malayalamTitle: 'സ്പൈ x ഫാമിലി (SPY×FAMILY)',
        malayalamSynopsis:
          'ലോകസമാധാനത്തിനായുള്ള രഹസ്യ ദൗത്യത്തിനായി ചാരനായ ടൈ്വലൈറ്റും കൊലയാളിയായ യോറും മനസ്സ് വായിക്കാൻ കഴിവുള്ള അനിയയും ചേർന്ന് ഒരു വ്യാജ കുടുംബം രൂപീകരിക്കുന്നു.',
        author: 'Tatsuya Endo',
        artist: 'Tatsuya Endo',
        type: 'manga',
        genres: ['Comedy', 'Action', 'Slice of Life'],
        status: 'Ongoing',
        synopsis:
          'Master spy "Twilight" must build a fake family to infiltrate an elite private academy for Operation Strix—unaware that the wife he marries, Yor, is the assassin Thorn Princess and the daughter he adopts, Anya, is a telepath.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/6b958848-c885-4735-9201-12ee77abcb3c/91a35e78-62b2-41fe-9869-ce051f2d1070.jpg.512.jpg',
          'SPY X FAMILY',
          'manga',
          'cafe'
        ),
        rating: 4.92,
        totalViews: 3540000,
        releaseDay: 'Sunday',
        chaptersCount: 3,
        latestChapterId: 'ch-spy-x-family-3',
        featured: false,
        mangadexId: '6b958848-c885-4735-9201-12ee77abcb3c',
        malId: 119161,
      },
      {
        id: 'series-frieren',
        slug: 'frieren-beyond-journeys-end',
        title: "Frieren: Beyond Journey's End",
        origin: 'manga',
        japaneseTitle: '葬送のフリーレン',
        malayalamTitle: 'ഫ്രീറൻ: ബിയോണ്ട് ജേർണീസ് എൻഡ്',
        malayalamSynopsis:
          'ഡെമൺ കിംഗിനെ പരാജയപ്പെടുത്തിയ ശേഷം നൂറ്റാണ്ടുകളോളം ജീവിക്കുന്ന എൽഫ് മാന്ത്രികയായ ഫ്രീറൻ മനുഷ്യരുടെ വികാരങ്ങളെയും തന്റെ പഴയ സുഹൃത്തുക്കളുടെ ഓർമ്മകളെയും തേടി യാത്ര തിരിക്കുന്നു.',
        author: 'Kanehito Yamada',
        artist: 'Tsukasa Abe',
        type: 'manga',
        genres: ['Fantasy', 'Adventure', 'Slice of Life'],
        status: 'Ongoing',
        synopsis:
          'After a ten-year quest alongside Hero Himmel to defeat the Demon King, elven mage Frieren watches her mortal companions age and pass away—setting out on a new journey north with apprentice Fern to truly understand human hearts.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/b0b721ff-c388-4486-aa0f-c2b0bb321512/b9a049b0-186b-4714-a83e-bb965458914a.jpg.512.jpg',
          'FRIEREN',
          'manga',
          'celestial'
        ),
        rating: 4.97,
        totalViews: 3820000,
        releaseDay: 'Wednesday',
        chaptersCount: 3,
        latestChapterId: 'ch-frieren-3',
        featured: false,
        mangadexId: 'b0b721ff-c388-4486-aa0f-c2b0bb321512',
        malId: 126287,
      },
      {
        id: 'series-dandadan',
        slug: 'dandadan',
        title: 'Dandadan',
        origin: 'manga',
        japaneseTitle: 'ダンダダン',
        malayalamTitle: 'ദണ്ഡദാൻ (Dandadan)',
        malayalamSynopsis:
          'പ്രേതങ്ങളിൽ വിശ്വസിക്കുന്ന മോമോ അയാസെയും അന്യഗ്രഹജീവികളിൽ വിശ്വസിക്കുന്ന ഒക്കാറുണും അമാനുഷിക ശക്തികളെ നേരിടുന്ന ഭ്രാന്തമായ ആക്ഷൻ-കോമഡി സാഹസികത.',
        author: 'Yukinobu Tatsu',
        artist: 'Yukinobu Tatsu',
        type: 'manga',
        genres: ['Shonen', 'Supernatural', 'Action'],
        status: 'Ongoing',
        synopsis:
          'Momo Ayase believes in ghosts but not aliens, while her nerdy classmate Okarun believes in aliens but not ghosts. A bet to prove each other wrong leaves Okarun cursed by Turbo Granny and Momo awakening psychic powers.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/68112dc1-2b80-4f20-beb8-2f2a8716a430/971f79d4-ae64-4e9f-a874-2d2995eafafa.jpg.512.jpg',
          'DANDADAN',
          'manga',
          'cyberpunk'
        ),
        rating: 4.93,
        totalViews: 3310000,
        releaseDay: 'Tuesday',
        chaptersCount: 3,
        latestChapterId: 'ch-dandadan-3',
        featured: false,
        mangadexId: '68112dc1-2b80-4f20-beb8-2f2a8716a430',
        malId: 135496,
      },
      {
        id: 'series-blue-lock',
        slug: 'blue-lock',
        title: 'Blue Lock',
        origin: 'manga',
        japaneseTitle: 'ブルーロック',
        malayalamTitle: 'ബ്ലൂ ലോക്ക് (Blue Lock)',
        malayalamSynopsis:
          'ജപ്പാന് ലോകകപ്പ് നേടിക്കൊടുക്കാൻ ലോകത്തിലെ ഏറ്റവും സ്വാർത്ഥനായ സ്ട്രൈക്കറെ വാർത്തെടുക്കുന്ന ബ്ലൂ ലോക്ക് പ്രോജക്റ്റിൽ യോയിച്ചി ഇസാഗി മുന്നേറുന്നു.',
        author: 'Muneyuki Kaneshiro',
        artist: 'Yusuke Nomura',
        type: 'manga',
        genres: ['Shonen', 'Action', 'Drama'],
        status: 'Ongoing',
        synopsis:
          'Following Japan\'s elimination from the 2018 World Cup, eccentric coach Jinpachi Ego locks 300 high school forwards inside the "Blue Lock" facility—where 299 careers will be destroyed to forge the single most egoistic striker on Earth.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/4141c5dc-c525-4df5-afd7-cc7d192a832f/7ee723d4-b926-4a81-acd9-53adb3fbe461.jpg.512.jpg',
          'BLUE LOCK',
          'manga',
          'celestial'
        ),
        rating: 4.89,
        totalViews: 3180000,
        releaseDay: 'Wednesday',
        chaptersCount: 3,
        latestChapterId: 'ch-blue-lock-3',
        featured: false,
        mangadexId: '4141c5dc-c525-4df5-afd7-cc7d192a832f',
        malId: 114745,
      },
      {
        id: 'series-kaguya-sama',
        slug: 'kaguya-sama-love-is-war',
        title: 'Kaguya-sama: Love Is War',
        origin: 'manga',
        japaneseTitle: 'かぐや様は告らせたい',
        malayalamTitle: 'കഗുയ-സാമ: ലവ് ഈസ് വാർ',
        malayalamSynopsis:
          'ആദ്യം പ്രണയം തുറന്നുപറയുന്നവർ തോൽക്കുമെന്ന് വിശ്വസിക്കുന്ന സ്റ്റുഡന്റ് കൗൺസിൽ പ്രസിഡന്റ് മിയുക്കി ഷിറോഗാനെയും വൈസ് പ്രസിഡന്റ് കഗുയ ഷിനോമിയയും തമ്മിലുള്ള പ്രണയ യുദ്ധം.',
        author: 'Aka Akasaka',
        artist: 'Aka Akasaka',
        type: 'manga',
        genres: ['Romance', 'Comedy', 'Slice of Life'],
        status: 'Completed',
        synopsis:
          'At elite Shuchiin Academy, student council president Miyuki Shirogane and wealthy vice-president Kaguya Shinomiya view confessing love first as a sign of submission—turning everyday romance into psychological warfare.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/37f5cce0-8070-4ada-96e5-fa24b1bd4ff9/e21ca520-5054-4041-a07e-de8b7c683522.jpg.512.jpg',
          'KAGUYA SAMA',
          'manga',
          'crimson'
        ),
        rating: 4.93,
        totalViews: 2950000,
        releaseDay: 'Thursday',
        chaptersCount: 3,
        latestChapterId: 'ch-kaguya-sama-3',
        featured: false,
        mangadexId: '37f5cce0-8070-4ada-96e5-fa24b1bd4ff9',
        malId: 90125,
      },
      {
        id: 'series-sakamoto-days',
        slug: 'sakamoto-days',
        title: 'Sakamoto Days',
        origin: 'manga',
        japaneseTitle: 'サカモトデイズ',
        malayalamTitle: 'സക്കാമോട്ടോ ഡേയ്സ് (Sakamoto Days)',
        malayalamSynopsis:
          'പ്രണയത്തിലായതിനെ തുടർന്ന് വിരമിച്ച് പലചരക്ക് കട നടത്തുന്ന ഇതിഹാസ ഹിറ്റ്മാൻ ടാരോ സക്കാമോട്ടോ തന്റെ കുടുംബത്തിന്റെ സമാധാനം സംരക്ഷിക്കാൻ വീണ്ടും രംഗത്തിറങ്ങുന്നു.',
        author: 'Yuto Suzuki',
        artist: 'Yuto Suzuki',
        type: 'manga',
        genres: ['Shonen', 'Action', 'Comedy'],
        status: 'Ongoing',
        synopsis:
          'Taro Sakamoto was once the most feared legendary hitman in the underworld—until he fell in love at first sight, retired, got married, gained weight, and opened a neighborhood convenience store.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/9d9b04ad-9a83-49f4-8ae4-a9a3780fe9c0/f3f1d565-3a66-484a-be9b-28e1b03d9c51.jpg.512.jpg',
          'SAKAMOTO DAYS',
          'manga',
          'cafe'
        ),
        rating: 4.90,
        totalViews: 2790000,
        releaseDay: 'Sunday',
        chaptersCount: 3,
        latestChapterId: 'ch-sakamoto-days-3',
        featured: false,
        mangadexId: '9d9b04ad-9a83-49f4-8ae4-a9a3780fe9c0',
        malId: 131334,
      },

      // ==================== EXPANDED CHINESE MANHUA ====================
      {
        id: 'series-magic-emperor',
        slug: 'magic-emperor',
        title: 'Magic Emperor (Demonic Emperor)',
        origin: 'manhua',
        chineseTitle: '魔皇大管家',
        malayalamTitle: 'മാജിക് എംപറർ (Demonic Emperor)',
        malayalamSynopsis:
          'ശിഷ്യനാൽ ചതിക്കപ്പെട്ട ഡെമോണിക് എംപറർ ഷുവോയി ഫാൻ തകർന്നുപോയ ലുവോ കുടുംബത്തിന്റെ കാര്യസ്ഥനായ ഷുവോ ഫാനായി പുനർജനിച്ച് സാമ്രാജ്യങ്ങളെ വിറപ്പിക്കുന്നു.',
        author: 'Nightingale',
        artist: 'Wuer Manhua',
        type: 'webtoon',
        genres: ['Cultivation', 'Martial Arts', 'Action'],
        status: 'Ongoing',
        synopsis:
          'Betrayed by his trusted disciple for the ancient Nine Serenities Secret Record, Demonic Emperor Zhuo Yifan reincarnates into the body of a lowly family steward named Zhuo Fan—bound by a heart demon oath to elevate the declining Luo clan to the apex of the continent.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/69e218ec-93eb-4025-ae39-33d47b1160e0/b60fd7d0-d3b0-492b-8542-f22d2a9f2205.jpg.512.jpg',
          'MAGIC EMPEROR',
          'webtoon',
          'shadow'
        ),
        rating: 4.92,
        totalViews: 2870000,
        releaseDay: 'Friday',
        chaptersCount: 3,
        latestChapterId: 'ch-magic-emperor-3',
        featured: false,
        mangadexId: '69e218ec-93eb-4025-ae39-33d47b1160e0',
      },
      {
        id: 'series-battle-through-the-heavens',
        slug: 'battle-through-the-heavens',
        title: 'Battle Through the Heavens',
        origin: 'manhua',
        chineseTitle: '斗破苍穹',
        malayalamTitle: 'ബാറ്റിൽ ത്രൂ ദി ഹെവൻസ്',
        malayalamSynopsis:
          'തന്റെ അമ്മയുടെ മോതിരത്തിനുള്ളിൽ ഉറങ്ങിയിരുന്ന യാവോ ലാവോ എന്ന പരമോന്നത ആൽകെമിസ്റ്റിന്റെ സഹായത്തോടെ സിയാവോ യാൻ സ്വർഗ്ഗീയ ജ്വാലകൾ കീഴടക്കുന്നു.',
        author: 'Tian Can Tu Dou',
        artist: 'Ren Xiang',
        type: 'webtoon',
        genres: ['Cultivation', 'Wuxia', 'Fantasy'],
        status: 'Ongoing',
        synopsis:
          'Child prodigy Xiao Yan mysteriously loses all his Dou Qi for three years and suffers public humiliation when his engagement is annulled—until the spirit of supreme alchemist Yao Lao awakens from his mother\'s black ring.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/cee2ab81-2ab5-4c91-8715-92848ef5b2d4/33dc8d11-2a5d-421b-8c8d-d8257bf70cb0.png.512.jpg',
          'BATTLE THROUGH HEAVENS',
          'webtoon',
          'crimson'
        ),
        rating: 4.88,
        totalViews: 2640000,
        releaseDay: 'Saturday',
        chaptersCount: 3,
        latestChapterId: 'ch-battle-through-the-heavens-3',
        featured: false,
        mangadexId: 'cee2ab81-2ab5-4c91-8715-92848ef5b2d4',
      },
      {
        id: 'series-soul-land',
        slug: 'soul-land',
        title: 'Soul Land (Douluo Dalu)',
        origin: 'manhua',
        chineseTitle: '斗罗大陆',
        malayalamTitle: 'സോൾ ലാൻഡ് (Douluo Dalu)',
        malayalamSynopsis:
          'ടാങ് വിഭാഗത്തിന്റെ രഹസ്യ ആയോധനകലകളുമായി സ്പിരിറ്റ് മാസ്റ്റർമാരുടെ ലോകമായ ദൗലുവോ ഭൂഖണ്ഡത്തിൽ പുനർജനിക്കുന്ന ടാങ് സാൻ ഇരട്ട സ്പിരിറ്റുകൾ ഉണർത്തുന്നു.',
        author: 'Tang Jia San Shao',
        artist: 'Mu Fengchun',
        type: 'webtoon',
        genres: ['Cultivation', 'Fantasy', 'Adventure'],
        status: 'Ongoing',
        synopsis:
          'Tang Sect outer-disciple genius Tang San leaps from Hell\'s Peak and is reborn onto the Douluo Continent—a world of Spirit Masters where he awakens twin martial spirits: Blue Silver Grass and the Clear Sky Hammer.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/39d875a6-5df3-4323-a2da-3a0b50af429a/1ce4873a-7198-4452-9af5-b2f35c6df4ff.jpg.512.jpg',
          'SOUL LAND',
          'webtoon',
          'celestial'
        ),
        rating: 4.85,
        totalViews: 2490000,
        releaseDay: 'Tuesday',
        chaptersCount: 3,
        latestChapterId: 'ch-soul-land-3',
        featured: false,
        mangadexId: '39d875a6-5df3-4323-a2da-3a0b50af429a',
      },
      {
        id: 'series-yuan-zun',
        slug: 'yuan-zun',
        title: 'Yuan Zun (Dragon Prince Yuan)',
        origin: 'manhua',
        chineseTitle: '元尊',
        malayalamTitle: 'യുവാൻ സുൻ (Dragon Prince Yuan)',
        malayalamSynopsis:
          'ജനനസമയത്ത് വിശുദ്ധ ഡ്രാഗൺ ഭാഗ്യം കവർന്നെടുക്കപ്പെട്ട ഗ്രേറ്റ് ഷൗ രാജകുമാരൻ ഷൗ യുവാൻ പ്രാചീന റൂൺ തൂലികയുടെ ശക്തിയാൽ തന്റെ സിംഹാസനം തിരിച്ചുപിടിക്കുന്നു.',
        author: 'Tian Can Tu Dou',
        artist: 'Dr. Da Ji',
        type: 'webtoon',
        genres: ['Cultivation', 'Martial Arts', 'Wuxia'],
        status: 'Completed',
        synopsis:
          'Born with the Sacred Dragon Blessing snatched away by the usurper King Wu at birth, Great Zhou Crown Prince Zhou Yuan unlocks his blocked eight meridians with the Heaven Primal Brush and Yao Yao\'s ancestral formations.',
        coverImage: buildProxiedImageUrl(
          'https://uploads.mangadex.org/covers/11801062-d961-460a-b2b5-f0a477f45b66/288bb3b6-6b3f-4103-a3a7-45ac2d0fc86c.png.512.jpg',
          'YUAN ZUN',
          'webtoon',
          'dungeon'
        ),
        rating: 4.86,
        totalViews: 2190000,
        releaseDay: 'Monday',
        chaptersCount: 3,
        latestChapterId: 'ch-yuan-zun-3',
        featured: false,
        mangadexId: '11801062-d961-460a-b2b5-f0a477f45b66',
      },
    ];

    // Seed chapters for all real titles
    this.createChaptersForSeries(
      'series-addicted-to-stepmom',
      'Addicted to Stepmom',
      'webtoon',
      [
        {
          num: 1,
          title: 'Episode 1: New Household',
          mangadexChapterId: '64cf0506-0660-46c2-ba10-53e4961ef9a9',
          pagesCount: 25,
          language: 'EN',
          dialogues: ['Episode 1 — Live Streamed Webtoon'],
        },
        {
          num: 2,
          title: 'Episode 2: Unspoken Tension',
          mangadexChapterId: '71db0798-2708-4c6e-aaec-26b1d43052a0',
          pagesCount: 19,
          language: 'EN',
          dialogues: ['Episode 2 — Live Streamed Webtoon'],
        },
        {
          num: 3,
          title: 'Episode 3: Behind Closed Doors',
          mangadexChapterId: '03921628-c416-40a2-85a9-8f2b0857df92',
          pagesCount: 17,
          language: 'EN',
          dialogues: ['Episode 3 — Live Streamed Webtoon'],
        },
        {
          num: 4,
          title: 'Episode 4: Lingering Gaze',
          mangadexChapterId: '096e38f7-1010-4bef-bb54-49348571cb40',
          pagesCount: 15,
          language: 'EN',
          dialogues: ['Episode 4 — Live Streamed Webtoon'],
        },
        {
          num: 5,
          title: 'Episode 5: Late Night Encounter',
          mangadexChapterId: 'b4c855b5-e040-4eea-b6b7-3a6b54f288a1',
          pagesCount: 17,
          language: 'EN',
          dialogues: ['Episode 5 — Live Streamed Webtoon'],
        },
        {
          num: 6,
          title: 'Episode 6: Crossing the Line',
          mangadexChapterId: 'cf747af1-df37-49e3-9770-04f219c21d57',
          pagesCount: 18,
          language: 'EN',
          dialogues: ['Episode 6 — Live Streamed Webtoon'],
        },
        {
          num: 7,
          title: 'Episode 7: Shared Secret',
          mangadexChapterId: 'b8e1222e-417c-40d6-a408-cf22decf46ab',
          pagesCount: 18,
          language: 'EN',
          dialogues: ['Episode 7 — Live Streamed Webtoon'],
        },
        {
          num: 8,
          title: 'Episode 8: Deepening Obsession',
          mangadexChapterId: 'f759533c-bff9-43d9-92fa-f56a0e6ad6c0',
          pagesCount: 18,
          language: 'EN',
          dialogues: ['Episode 8 — Live Streamed Webtoon'],
        },
        {
          num: 9,
          title: 'Episode 9: Tangled Emotions',
          mangadexChapterId: '5f7f1d9b-fa46-4f99-807c-a196c503432b',
          pagesCount: 15,
          language: 'EN',
          dialogues: ['Episode 9 — Live Streamed Webtoon'],
        },
        {
          num: 10,
          title: 'Episode 10: Point of No Return',
          mangadexChapterId: 'afb67a40-ee14-4b88-88cb-eeb18a6d61ba',
          pagesCount: 16,
          language: 'EN',
          dialogues: ['Episode 10 — Live Streamed Webtoon'],
        },
      ]
    );

    this.createChaptersForSeries('series-solo-leveling', 'Solo Leveling', 'webtoon', [
      {
        num: 1,
        title: 'Episode 1: The Weakest E-Rank Hunter',
        dialogues: [
          'Hunter Sung Jinwoo, E-Rank. Don\'t fall behind the raid party!',
          'A hidden Double Dungeon inside a D-Rank gate?!',
          'The Cartenon Temple Commandments: First, Worship the Lord.',
          'Everyone get down! The Giant Statue\'s eyes just moved!',
        ],
      },
      {
        num: 2,
        title: 'Episode 2: The Secret Player Awakening',
        dialogues: [
          '[You have completed all requirements of the Secret Quest: Courage of the Weak.]',
          '[Will you accept as a Player? You have 0.02 seconds remaining.]',
          'I survived the altar... and this floating system window only appears to me.',
          '[Daily Quest: Strength Training has arrived. Penalty for failure: Survival Zone.]',
        ],
      },
      {
        num: 3,
        title: 'Episode 3: Arise, Monarch of Shadows',
        dialogues: [
          'Blood-Red Commander Igris has fallen. Job Change Quest complete.',
          'Class Transfer: Necromancer -> The Monarch of Shadows.',
          'Select your command keyword for Shadow Extraction...',
          '"ARISE."',
        ],
      },
    ]);

    this.createChaptersForSeries('series-omniscient-reader', "Omniscient Reader's Viewpoint", 'webtoon', [
      {
        num: 1,
        title: 'Episode 1: Prologue — Three Ways to Survive',
        dialogues: [
          '[The free service of planetary system 8612 has been terminated.]',
          '[The main scenario has arrived.]',
          'A Dokkaebi appeared inside Cabin 3807 of the Seoul Subway!',
          'I am the sole reader who finished all 3,149 chapters of this world.',
        ],
      },
      {
        num: 2,
        title: 'Episode 2: Main Scenario #1 — Proof of Value',
        dialogues: [
          '[Kill one or more living organisms within 30 minutes.]',
          '[The Constellation "Secretive Plotter" is watching your choice.]',
          'Wait—he didn\'t say it had to be a human! Look at the insect container!',
          '[You have achieved the First Kill bonus.]',
        ],
      },
      {
        num: 3,
        title: 'Episode 3: Encounter on Oksu Bridge',
        dialogues: [
          'Yoo Joonghyuk, the 3rd regression protagonist, is standing right there.',
          '[Exclusive Skill: "Omniscient Reader\'s Viewpoint" Stage 1 activated.]',
          '"Tell me, Prophet... how did you survive Cabin 3807?"',
          'Let us make a pact to clear the Star Stream together.',
        ],
      },
    ]);

    this.createChaptersForSeries('series-tower-of-god', 'Tower of God', 'webtoon', [
      {
        num: 1,
        title: 'Episode 1: Headon\'s 1st Floor Ball Test',
        dialogues: [
          'Welcome to the Tower, Twenty-Fifth Bam.',
          'To ascend to the next floor, you must pop the White Steel Eel\'s ball.',
          'Princess Yuri Jahad! Why is a High Ranker on the First Floor?!',
          'Take the Black March needle, boy. Show me a miracle.',
        ],
      },
      {
        num: 2,
        title: 'Episode 2: Evankhell\'s 2nd Floor Culling',
        dialogues: [
          '400 Regulars remain. Reduce your numbers to 200 in ten minutes!',
          'That blue-haired strategist... Khun Aguero Agnis.',
          'And a giant crocodile calling everyone "Turtles"—Rak Wraithraiser!',
          'Team Bam-Khun-Rak is officially formed.',
        ],
      },
      {
        num: 3,
        title: 'Episode 3: The Crown Game Begins',
        dialogues: [
          'Whoever holds the throne at the final round passes the Floor of Test immediately!',
          'Shinsu is responding to Bam without a Pocket contract!',
          'Protect the crown at all costs!',
        ],
      },
    ]);

    this.createChaptersForSeries('series-tbate', 'The Beginning After The End', 'webtoon', [
      {
        num: 1,
        title: 'Episode 1: The Light at the End of the Tunnel',
        dialogues: [
          'In my past life as King Grey, I stood at the pinnacle of martial might.',
          'Wait... why am I an infant being held by two adventurers?!',
          'Welcome to the continent of Dicathen, Arthur Leywin.',
        ],
      },
      {
        num: 2,
        title: 'Episode 2: Awakening the Mana Core',
        dialogues: [
          'By focusing ki breathing on ambient mana particles, the core condenses...',
          'BOOM! The entire house shook! Did a three-year-old just awaken a mana core?!',
          'Quadra-Elemental affinity unlocked.',
        ],
      },
      {
        num: 3,
        title: 'Episode 3: Sylvia\'s Dragon Will',
        dialogues: [
          'Fear not, little one. Though my time fades, my Dragon Will shall guide you.',
          'Take this feathered bond—Sylvie will hatch when you are ready.',
          'Realmheart physique inherited.',
        ],
      },
    ]);

    this.createChaptersForSeries('series-one-piece', 'One Piece', 'manga', [
      {
        num: 1,
        title: 'Chapter 1: Romance Dawn — The Dawn of the Adventure',
        dialogues: [
          'My wealth and treasures? If you want it, I\'ll let you have it... search for it!',
          'Shanks! Your arm—!!',
          '"It\'s just an arm, Luffy. I bet it on the New Era."',
          'I\'m going to become the King of the Pirates!',
        ],
      },
      {
        num: 2,
        title: 'Chapter 2: They Call Him "Straw Hat Luffy"',
        dialogues: [
          'Pirates Evaluator? No, I\'m looking for Pirate Hunter Roronoa Zoro!',
          'Gum-Gum... PISTOL!!',
          'Join my crew, Zoro! Let\'s sail to the Grand Line!',
        ],
      },
      {
        num: 3,
        title: 'Chapter 3: Enter "Pirate Hunter Zoro"',
        dialogues: [
          'Three-Sword Style: Oni Giri!!',
          'If you ever get in the way of my ambition to be the World\'s Greatest Swordsman...',
          'Welcome aboard the first mate of the Straw Hat Pirates!',
        ],
      },
    ]);

    this.createChaptersForSeries('series-jujutsu-kaisen', 'Jujutsu Kaisen', 'manga', [
      {
        num: 1,
        title: 'Chapter 1: Ryomen Sukuna',
        dialogues: [
          '"Yuji... you are strong, so help others when you can."',
          'A Special Grade cursed object?! The seal has been unwrapped!',
          'I just need Cursed Energy to save Fushiguro, right?! *Swallows Sukuna\'s Finger*',
          'BLACK FLASH!!',
        ],
      },
      {
        num: 2,
        title: 'Chapter 2: Secret Execution',
        dialogues: [
          'My name is Satoru Gojo, in charge of the first-years at Jujutsu High.',
          'Let me switch with Sukuna for ten seconds. Don\'t worry, I\'m the strongest.',
          'You have two choices: die now, or consume all twenty fingers first.',
        ],
      },
      {
        num: 3,
        title: 'Chapter 3: For Myself — Domain Expansion',
        dialogues: [
          'Domain Expansion: Unlimited Void.',
          'Everything you perceive is infinite information—you cannot move a muscle.',
          'Cursed Technique Reversal: Red!',
        ],
      },
    ]);

    this.createChaptersForSeries('series-berserk', 'Berserk', 'manga', [
      {
        num: 1,
        title: 'Chapter 1: The Black Swordsman',
        dialogues: [
          'That thing was too big to be called a sword. Too big, too thick, too heavy, and too rough.',
          'It was more like a large hunk of iron.',
          'The Brand on my neck is bleeding again... Apostles are near.',
        ],
      },
      {
        num: 2,
        title: 'Chapter 2: The Brand of Sacrifice',
        dialogues: [
          'When night falls, the spirits of the interstice swarm toward the Brand.',
          'Out of the way, Puck! My cannon arm isn\'t made for warning shots!',
          'Tell your masters in the God Hand that the Black Swordsman is coming.',
        ],
      },
      {
        num: 3,
        title: 'Chapter 3: The Guardians of Desire',
        dialogues: [
          'In this world, is the destiny of mankind controlled by some transcendental entity?',
          'At least it is true that man has no control, even over his own will.',
          'CLAAANG!!',
        ],
      },
    ]);

    this.createChaptersForSeries('series-chainsaw-man', 'Chainsaw Man', 'manga', [
      {
        num: 1,
        title: 'Chapter 1: Dog & Chainsaw',
        dialogues: [
          'Pochita, if we pay off this debt today, maybe we can afford bread with jam!',
          '"Denji... I always loved listening to your dreams. Give me your heart in exchange."',
          'VRRRRMMMMM!! Pull the starter cord!',
        ],
      },
      {
        num: 2,
        title: 'Chapter 2: The Place Where Pochita Is',
        dialogues: [
          'I am Makima, a Public Safety Devil Hunter.',
          'You have two options: be put down as a Devil, or be kept as my human.',
          'What do you put on toast at Public Safety? Butter AND jam?! I\'m in!',
        ],
      },
      {
        num: 3,
        title: 'Chapter 3: Arrival in Tokyo — Power the Blood Fiend',
        dialogues: [
          'Bow before me, human! My name is Power, the Blood Fiend!',
          'Aki Hayakawa\'s Special Division 4 patrol begins now.',
          'Kon.',
        ],
      },
    ]);

    this.createChaptersForSeries('series-horimiya', 'Horimiya', 'manga', [
      {
        num: 1,
        title: 'Chapter 1: A Tiny Happenstance',
        dialogues: [
          'Wait... you brought Souta home, but who are you with all those piercings?!',
          '"Hori-san? It\'s me, Miyamura from class 3-1."',
          'EHHHHH?! You\'re the quiet guy with glasses and long hair?!',
        ],
      },
      {
        num: 2,
        title: 'Chapter 2: You Wear More Than One Face',
        dialogues: [
          'This is our secret after-school side that nobody at Katagiri High knows.',
          'Miyamura came over again today to help make dinner with Souta.',
          'Somehow, having him here feels warmer than anything.',
        ],
      },
      {
        num: 3,
        title: 'Chapter 3: Underneath the Blossoms',
        dialogues: [
          'Did Miyamura just cut his hair?! Every girl in class is staring!',
          '"Even if the sky falls, I\'m glad I met you, Hori-san."',
        ],
      },
    ]);

    this.createChaptersForSeries('series-tales-of-demons-and-gods', 'Tales of Demons and Gods', 'webtoon', [
      {
        num: 1,
        title: 'Episode 1: Reborn Through the Temporal Demon Spirit Book',
        dialogues: [
          'The Sage Emperor\'s Golden Crow array shattered my soul... wait, where am I?',
          'Holy Orchid Institute?! I am thirteen years old again, before Glory City fell!',
          'With my past-life memories of divine inscriptions, I will rewrite history!',
        ],
      },
      {
        num: 2,
        title: 'Episode 2: Defying Teacher Shen Xiu',
        dialogues: [
          'The Sacred Family thinks commoners cannot reach Legend Rank?',
          'Watch as I fuse the Fanged Panda and Shadow Devil Demon Spirits!',
          'Soul Realm surging past 100 Soul Force in a single afternoon!',
        ],
      },
      {
        num: 3,
        title: 'Episode 3: The Ancient Orchid City Ruins',
        dialogues: [
          'Inside the Purple Mist Jungle lies the Nightmare Demon Pot.',
          'Ye Ziyun, stay behind my array formation!',
          'Bronze 5-Star breakthrough achieved!',
        ],
      },
    ]);

    this.createChaptersForSeries('series-martial-peak', 'Martial Peak', 'webtoon', [
      {
        num: 1,
        title: 'Episode 1: The Wordless Black Book',
        dialogues: [
          'Three years as a trial disciple at High Heaven Pavilion, beaten every week...',
          'Why is this black stone pillow emitting golden skeletal meridians?!',
          'Unyielding Golden Skeleton refined! Tempered Body 4th Stage!',
        ],
      },
      {
        num: 2,
        title: 'Episode 2: Nine Star Hegemon Fist',
        dialogues: [
          'Challenger Yang Kai steps into the outer sect arena!',
          'One punch shattered a 6th-Stage disciple\'s defensive qi?!',
          'True Yang Secret Art ignited!',
        ],
      },
      {
        num: 3,
        title: 'Episode 3: Entering the Black Wind Mountain Range',
        dialogues: [
          'A Fourth-Order Monster Core and Nine-Leaf Blood Lotus!',
          'Senior Sister Su Yan\'s Ice Phoenix Qi is resonating with my True Yang Yuan Qi!',
        ],
      },
    ]);

    this.createChaptersForSeries('series-apotheosis', 'Apotheosis', 'webtoon', [
      {
        num: 1,
        title: 'Episode 1: Refined as a Living Artifact',
        dialogues: [
          'Used as a flesh sandbag by the inner sect disciples of 青云宗 (Qingyun Sect)...',
          'The mysterious gold-threaded scripture in my mind is absorbing every blow!',
          'My body itself has tempered into a Lower-Grade Spirit Weapon!',
        ],
      },
      {
        num: 2,
        title: 'Episode 2: The Primordial Chaos Furnace',
        dialogues: [
          'Inside my dantian, a miniature starry universe is awakening!',
          'Dragon Scales Condensing: 100 Dragons of Raw Strength!',
        ],
      },
      {
        num: 3,
        title: 'Episode 3: Breaking the Purgatory Mountain Trial',
        dialogues: [
          'Luo Zheng has cleared the 9th Purgatory Pillar in a single breath!',
          'Even the Sect Master is rising from her throne in shock!',
        ],
      },
    ]);

    // Auto-seed 3 rich playable chapters for all newly added series in the catalog
    for (const s of this.series) {
      const hasChapters = this.chapters.some((c) => c.seriesId === s.id);
      if (!hasChapters) {
        const prefix = s.type === 'webtoon' ? 'Episode' : 'Chapter';
        this.createChaptersForSeries(s.id, s.title, s.type, [
          {
            num: 1,
            title: `${prefix} 1: Awakening of Destiny`,
            dialogues: [
              `The legend of ${s.title} begins here.`,
              s.synopsis.slice(0, 110) + '...',
              'Every choice from this moment forward will reshape the realm!',
            ],
          },
          {
            num: 2,
            title: `${prefix} 2: Trial by Fire`,
            dialogues: [
              `Step into the crucible of ${s.genres.join(' & ')}.`,
              'Those who stand in the way underestimate the power awakening within!',
              'Break through the limit!',
            ],
          },
          {
            num: 3,
            title: `${prefix} 3: Sovereign Ascent`,
            dialogues: [
              'A new rival emerges from the shadows.',
              `The true battle in ${s.title} is just getting started!`,
            ],
          },
        ]);
      }
    }

    // Seed Comments
    this.comments = [
      {
        id: 'c-1',
        chapterId: 'ch-solo-leveling-1',
        seriesId: 'series-solo-leveling',
        userId: 'usr_demo_1',
        username: 'ShadowMonarch_99',
        content:
          'Solo Leveling in vertical webtoon scroll is unmatched! The Double Dungeon statue grin still gives me chills every single reread.',
        createdAt: '1 hour ago',
        upvotes: 142,
        spoiler: false,
      },
      {
        id: 'c-2',
        chapterId: 'ch-solo-leveling-1',
        seriesId: 'series-solo-leveling',
        userId: 'usr_demo_2',
        username: 'IgrisKnight_401',
        content:
          'Wait until Episode 3 when he unlocks the Shadow Extraction command after defeating Blood-Red Commander Igris!',
        createdAt: '3 hours ago',
        upvotes: 88,
        spoiler: true,
      },
      {
        id: 'c-3',
        chapterId: 'ch-one-piece-1',
        seriesId: 'series-one-piece',
        userId: 'usr_demo_3',
        username: 'StrawHat_Navigator',
        content:
          'Reading Romance Dawn in authentic RTL paged mode feels just like holding the physical Shonen Jump tankobon volume.',
        createdAt: '5 hours ago',
        upvotes: 95,
        spoiler: false,
      },
      {
        id: 'c-4',
        chapterId: 'ch-omniscient-reader-1',
        seriesId: 'series-omniscient-reader',
        userId: 'usr_demo_4',
        username: 'UrielConstellation',
        content:
          '[The Constellation "Demon-like Judge of Fire" sponsors 500 coins for this platform!]',
        createdAt: '1 day ago',
        upvotes: 119,
        spoiler: false,
      },
    ];

    // Seed Community Requests
    this.requests = [
      {
        id: 'req-1',
        title: 'Return of the Mount Hua Sect (화산귀환)',
        type: 'webtoon',
        author: 'Biga / LICO',
        requestedBy: 'PlumBlossomSword_702',
        votes: 284,
        reason:
          'Chung Myung is the greatest murim protagonist ever written. Need Season 2 chapters added!',
        status: 'In Review',
        createdAt: '2 days ago',
      },
      {
        id: 'req-2',
        title: 'Vagabond (バガボンド)',
        type: 'manga',
        author: 'Takehiko Inoue',
        requestedBy: 'MusashiRonin_310',
        votes: 241,
        reason:
          'Inoue\'s brushwork in double-page spread RTL mode would look breathtaking.',
        status: 'Pending',
        createdAt: '4 days ago',
      },
      {
        id: 'req-3',
        title: 'Nano Machine (나노마신)',
        type: 'webtoon',
        author: 'Han-Joong-Wol-Ya',
        requestedBy: 'DemonicCultLeader_55',
        votes: 196,
        reason:
          'Sci-fi nanotech combined with martial arts cultivation—peak Korean manhwa action!',
        status: 'Acquired',
        createdAt: '1 week ago',
      },
    ];
  }

  private createChaptersForSeries(
    seriesId: string,
    seriesTitle: string,
    type: 'webtoon' | 'manga',
    chapterDefs: {
      num: number;
      title: string;
      dialogues: string[];
      mangadexChapterId?: string;
      pagesCount?: number;
      language?: string;
    }[]
  ) {
    chapterDefs.forEach((chDef) => {
      const chapterId = `ch-${seriesId.replace('series-', '')}-${chDef.num}`;
      const pagesCount = chDef.pagesCount || (type === 'webtoon' ? 8 : 10);
      const pages = Array.from({ length: pagesCount }, (_, i) => {
        const pageNum = i + 1;
        const dialogue = chDef.dialogues[i % chDef.dialogues.length];
        return {
          pageNumber: pageNum,
          imageUrl: createReaderPanelSvg(seriesTitle, chDef.num, pageNum, type, dialogue),
          caption: `Panel ${pageNum}`,
        };
      });

      this.chapters.push({
        id: chapterId,
        seriesId,
        chapterNumber: chDef.num,
        title: chDef.title,
        releaseDate: `${chDef.num} day${chDef.num === 1 ? '' : 's'} ago`,
        views: 42500 * chDef.num,
        pages,
        pagesCount,
        mangadexChapterId: chDef.mangadexChapterId,
        language: chDef.language,
      });
    });
  }

  // Series methods
  public getSeries(params?: {
    q?: string;
    type?: string;
    origin?: string;
    genre?: string;
    status?: string;
    sort?: string;
  }): Series[] {
    this.loadPersistedState();
    let result = [...this.series];

    if (params?.q) {
      const q = params.q.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q) ||
          (s.malayalamTitle && s.malayalamTitle.toLowerCase().includes(q)) ||
          (s.koreanTitle && s.koreanTitle.toLowerCase().includes(q)) ||
          (s.japaneseTitle && s.japaneseTitle.toLowerCase().includes(q)) ||
          (s.chineseTitle && s.chineseTitle.toLowerCase().includes(q)) ||
          s.genres.some((g) => g.toLowerCase().includes(q))
      );
    }

    if (params?.type && params.type !== 'all') {
      if (
        params.type === 'manhwa' ||
        params.type === 'manga' ||
        params.type === 'manhua'
      ) {
        result = result.filter(
          (s) => s.origin === params.type || s.type === params.type
        );
      } else {
        result = result.filter((s) => s.type === params.type);
      }
    }

    if (params?.origin && params.origin !== 'all') {
      result = result.filter((s) => s.origin === params.origin);
    }

    if (params?.genre && params.genre !== 'all') {
      result = result.filter((s) =>
        s.genres.some((g) => g.toLowerCase() === params.genre?.toLowerCase())
      );
    }

    if (params?.status && params.status !== 'all') {
      result = result.filter((s) => s.status.toLowerCase() === params.status?.toLowerCase());
    }

    if (params?.sort) {
      if (params.sort === 'popular') {
        result.sort((a, b) => b.totalViews - a.totalViews);
      } else if (params.sort === 'rating') {
        result.sort((a, b) => b.rating - a.rating);
      } else if (params.sort === 'title') {
        result.sort((a, b) => a.title.localeCompare(b.title));
      }
    }

    return result;
  }

  public getSeriesBySlug(slug: string): Series | undefined {
    this.loadPersistedState();
    // Support legacy aliases seamlessly
    if (slug === 'shadow-sovereign' || slug === 'series-shadow-sovereign') {
      return this.series.find((s) => s.slug === 'solo-leveling');
    }
    return this.series.find((s) => s.slug === slug || s.id === slug);
  }

  public getSeriesById(id: string): Series | undefined {
    this.loadPersistedState();
    if (id === 'series-shadow-sovereign') {
      return this.series.find((s) => s.id === 'series-solo-leveling');
    }
    return this.series.find((s) => s.id === id);
  }

  public addSeries(series: Series) {
    this.loadPersistedState();
    this.deletedSeriesIds.delete(series.id);
    const existingIdx = this.series.findIndex((s) => s.id === series.id);
    if (existingIdx >= 0) {
      this.series[existingIdx] = { ...this.series[existingIdx], ...series };
    } else {
      this.series.unshift(series);
    }

    // Create 1 starter episode if none exist yet for this series so it's immediately readable
    const existingChs = this.chapters.filter((c) => c.seriesId === series.id);
    if (existingChs.length === 0) {
      const chId = `ch-${series.slug || series.id.replace('series-', '')}-1`;
      const starterCh: Chapter = {
        id: chId,
        seriesId: series.id,
        chapterNumber: 1,
        title: `${series.type === 'webtoon' ? 'Episode' : 'Chapter'} 1: Prologue`,
        releaseDate: 'Just now',
        views: 1,
        pages: Array.from({ length: 6 }, (_, i) => ({
          pageNumber: i + 1,
          imageUrl: createReaderPanelSvg(
            series.title,
            1,
            i + 1,
            series.type,
            `Welcome to ${series.title}`
          ),
          caption: `Panel ${i + 1}`,
        })),
      };
      this.chapters.push(starterCh);
      this.chapterOverrides.set(starterCh.id, starterCh);
      series.chaptersCount = 1;
      series.latestChapterId = starterCh.id;
    }

    this.seriesOverrides.set(series.id, series);
    this.savePersistedState();
    return series;
  }

  public importInternetSeries(data: {
    title: string;
    author: string;
    origin: SeriesOrigin;
    type: SeriesType;
    genres: string[];
    status: 'Ongoing' | 'Completed';
    rating: number;
    synopsis: string;
    coverImage?: string;
    mangadexId?: string;
    malId?: number;
  }): Series {
    this.loadPersistedState();
    const slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const existing = this.series.find((s) => s.slug === slug);
    if (existing) {
      return existing;
    }

    const seriesId = `series-${slug}-${Date.now().toString().slice(-4)}`;
    const newSeries: Series = {
      id: seriesId,
      slug,
      title: data.title,
      origin: data.origin,
      author: data.author,
      artist: data.author,
      type: data.type,
      genres: data.genres,
      status: data.status,
      synopsis: data.synopsis,
      coverImage:
        data.coverImage ||
        createCoverSvg(data.title.slice(0, 20).toUpperCase(), 'shadow', data.type),
      rating: data.rating,
      totalViews: 125000,
      releaseDay: 'Friday',
      chaptersCount: 3,
      latestChapterId: `ch-${seriesId.replace('series-', '')}-3`,
      featured: false,
      mangadexId: data.mangadexId,
      malId: data.malId,
    };

    this.series.unshift(newSeries);
    this.seriesOverrides.set(seriesId, newSeries);

    this.createChaptersForSeries(seriesId, data.title, data.type, [
      {
        num: 1,
        title: `${data.type === 'webtoon' ? 'Episode' : 'Chapter'} 1: Awakening`,
        dialogues: [
          `Welcome to the world of ${data.title}!`,
          'A new destiny unfolds across the horizon...',
          'The power hidden within finally stirs!',
        ],
      },
      {
        num: 2,
        title: `${data.type === 'webtoon' ? 'Episode' : 'Chapter'} 2: First Trial`,
        dialogues: [
          'They underestimated our resolve.',
          'Break through the barrier with everything you have!',
          'Victory belongs to those who advance!',
        ],
      },
      {
        num: 3,
        title: `${data.type === 'webtoon' ? 'Episode' : 'Chapter'} 3: Sovereign Path`,
        dialogues: [
          'The true test begins on the next floor.',
          'Prepare for the upcoming battle!',
        ],
      },
    ]);

    this.chapters
      .filter((c) => c.seriesId === seriesId)
      .forEach((c) => this.chapterOverrides.set(c.id, c));
    this.savePersistedState();

    return newSeries;
  }

  public updateSeries(id: string, updates: Partial<Series>): Series | undefined {
    this.loadPersistedState();
    const index = this.series.findIndex((s) => s.id === id || s.slug === id);
    if (index === -1) return undefined;

    const current = this.series[index];
    const updated: Series = {
      ...current,
      ...updates,
      id: current.id,
      slug: updates.slug || current.slug,
      title: updates.title !== undefined ? updates.title : current.title,
      type: updates.type === 'manga' || updates.type === 'webtoon' ? updates.type : current.type,
      origin:
        updates.origin === 'manhwa' || updates.origin === 'manga' || updates.origin === 'manhua'
          ? updates.origin
          : current.origin,
      status:
        updates.status === 'Ongoing' || updates.status === 'Completed'
          ? updates.status
          : current.status,
      releaseDay: updates.releaseDay || current.releaseDay,
      author: updates.author !== undefined ? updates.author : current.author,
      artist: updates.artist !== undefined ? updates.artist : current.artist,
      genres:
        Array.isArray(updates.genres) && updates.genres.length > 0
          ? updates.genres
          : current.genres,
      synopsis: updates.synopsis !== undefined ? updates.synopsis : current.synopsis,
      coverImage: updates.coverImage || current.coverImage,
      featured: updates.featured !== undefined ? Boolean(updates.featured) : current.featured,
      rating:
        updates.rating !== undefined && !Number.isNaN(Number(updates.rating))
          ? Math.max(0, Math.min(5, Number(updates.rating)))
          : current.rating,
      malayalamTitle:
        updates.malayalamTitle !== undefined ? updates.malayalamTitle : current.malayalamTitle,
      malayalamSynopsis:
        updates.malayalamSynopsis !== undefined
          ? updates.malayalamSynopsis
          : current.malayalamSynopsis,
    };

    this.series[index] = updated;
    this.seriesOverrides.set(updated.id, updated);
    this.deletedSeriesIds.delete(updated.id);
    this.savePersistedState();
    return updated;
  }

  public deleteSeries(id: string): boolean {
    this.loadPersistedState();
    const s = this.getSeriesById(id) || this.getSeriesBySlug(id);
    if (!s) return false;
    const seriesId = s.id;
    this.series = this.series.filter((item) => item.id !== seriesId);
    const removedChapters = this.chapters.filter((ch) => ch.seriesId === seriesId);
    removedChapters.forEach((ch) => {
      this.deletedChapterIds.add(ch.id);
      this.chapterOverrides.delete(ch.id);
    });
    this.chapters = this.chapters.filter((ch) => ch.seriesId !== seriesId);
    this.comments = this.comments.filter((comm) => comm.seriesId !== seriesId);
    this.seriesOverrides.delete(seriesId);
    this.deletedSeriesIds.add(seriesId);
    this.savePersistedState();
    return true;
  }

  // Chapter methods
  public getChapterById(
    chapterId: string
  ): (Chapter & { series?: Series; prevChapterId?: string; nextChapterId?: string }) | undefined {
    this.loadPersistedState();
    // Support legacy chapter ID alias seamlessly
    const normalizedId = chapterId.startsWith('ch-shadow-')
      ? chapterId.replace('ch-shadow-', 'ch-solo-leveling-')
      : chapterId;

    const chapter = this.chapters.find((c) => c.id === normalizedId);
    if (!chapter) return undefined;

    const series = this.getSeriesById(chapter.seriesId);
    const seriesChapters = this.chapters
      .filter((c) => c.seriesId === chapter.seriesId)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

    const currentIndex = seriesChapters.findIndex((c) => c.id === normalizedId);
    const prevChapterId = currentIndex > 0 ? seriesChapters[currentIndex - 1].id : undefined;
    const nextChapterId =
      currentIndex < seriesChapters.length - 1 ? seriesChapters[currentIndex + 1].id : undefined;

    return {
      ...chapter,
      series,
      prevChapterId,
      nextChapterId,
    };
  }

  public getChaptersBySeriesId(seriesId: string): Chapter[] {
    this.loadPersistedState();
    const normalizedSeriesId =
      seriesId === 'series-shadow-sovereign' ? 'series-solo-leveling' : seriesId;
    return this.chapters
      .filter((c) => c.seriesId === normalizedSeriesId)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  public syncSeriesChaptersWithLiveFeed(
    seriesId: string,
    liveChapters: DiscoveredMangaDexChapter[]
  ): Chapter[] {
    this.loadPersistedState();
    const normalizedSeriesId =
      seriesId === 'series-shadow-sovereign' ? 'series-solo-leveling' : seriesId;
    const series = this.getSeriesById(normalizedSeriesId);
    if (!series || liveChapters.length === 0) {
      return this.getChaptersBySeriesId(normalizedSeriesId);
    }

    const baseSlug = normalizedSeriesId.replace('series-', '');
    const existingForSeries = this.getChaptersBySeriesId(normalizedSeriesId);

    liveChapters.forEach((live, idx) => {
      const slotNum = idx + 1;
      const chapterId = `ch-${baseSlug}-${slotNum}`;
      if (this.deletedChapterIds.has(chapterId)) {
        return;
      }

      const existing = existingForSeries.find(
        (c) => c.id === chapterId || c.chapterNumber === slotNum
      );

      if (existing) {
        if (!existing.hasCustomPages) {
          existing.mangadexChapterId = live.mangadexChapterId;
          existing.language = live.language;
          existing.pagesCount = live.pagesCount;
        }
        if (!existing.isCustomEdited) {
          if (live.releaseDate && live.releaseDate !== 'Recent') {
            existing.releaseDate = live.releaseDate;
          }
          if (slotNum > 3 && live.title) {
            existing.title = live.title;
          }
        }
      } else {
        const defaultPages = Array.from({ length: 8 }, (_, i) => ({
          pageNumber: i + 1,
          imageUrl: createReaderPanelSvg(
            series.title,
            slotNum,
            i + 1,
            series.type,
            live.title
          ),
          caption: `Panel ${i + 1}`,
        }));

        this.chapters.push({
          id: chapterId,
          seriesId: normalizedSeriesId,
          chapterNumber: slotNum,
          title: live.title,
          releaseDate: live.releaseDate,
          views: Math.max(12000, 95000 - slotNum * 2100),
          pages: defaultPages,
          mangadexChapterId: live.mangadexChapterId,
          language: live.language,
          pagesCount: live.pagesCount,
        });
      }
    });

    const updatedChapters = this.getChaptersBySeriesId(normalizedSeriesId);
    series.chaptersCount = updatedChapters.length;
    if (updatedChapters.length > 0) {
      series.latestChapterId = updatedChapters[updatedChapters.length - 1].id;
    }

    return updatedChapters;
  }

  public addChapter(chapter: Chapter) {
    this.loadPersistedState();
    this.deletedChapterIds.delete(chapter.id);
    const existingIdx = this.chapters.findIndex((c) => c.id === chapter.id);
    if (existingIdx >= 0) {
      this.chapters[existingIdx] = chapter;
    } else {
      this.chapters.push(chapter);
    }
    this.chapterOverrides.set(chapter.id, chapter);
    const series = this.getSeriesById(chapter.seriesId);
    if (series) {
      const seriesChs = this.getChaptersBySeriesId(chapter.seriesId);
      series.chaptersCount = seriesChs.length;
      series.latestChapterId = seriesChs[seriesChs.length - 1]?.id || chapter.id;
      this.seriesOverrides.set(series.id, series);
    }
    this.savePersistedState();
    return chapter;
  }

  public updateChapter(
    chapterId: string,
    updates: {
      chapterNumber?: number;
      title?: string;
      releaseDate?: string;
      panelUrls?: string[];
      pages?: Chapter['pages'];
    }
  ): Chapter | undefined {
    this.loadPersistedState();
    const index = this.chapters.findIndex((c) => c.id === chapterId);
    if (index === -1) return undefined;

    const current = this.chapters[index];
    let updatedPages = current.pages;
    let hasCustomPages = current.hasCustomPages;

    if (Array.isArray(updates.panelUrls) && updates.panelUrls.length > 0) {
      updatedPages = updates.panelUrls.map((url, idx) => ({
        pageNumber: idx + 1,
        imageUrl: url.trim(),
        caption: `Panel ${idx + 1}`,
      }));
      hasCustomPages = true;
    } else if (Array.isArray(updates.pages) && updates.pages.length > 0) {
      updatedPages = updates.pages.map((p, idx) => ({
        pageNumber: idx + 1,
        imageUrl: p.imageUrl,
        caption: p.caption || `Panel ${idx + 1}`,
      }));
      hasCustomPages = true;
    }

    const updated: Chapter = {
      ...current,
      chapterNumber:
        updates.chapterNumber !== undefined && !Number.isNaN(Number(updates.chapterNumber))
          ? Number(updates.chapterNumber)
          : current.chapterNumber,
      title: updates.title !== undefined && updates.title.trim() ? updates.title.trim() : current.title,
      releaseDate:
        updates.releaseDate !== undefined && updates.releaseDate.trim()
          ? updates.releaseDate.trim()
          : current.releaseDate,
      pages: updatedPages,
      pagesCount: updatedPages.length,
      hasCustomPages,
      isCustomEdited: true,
    };

    this.chapters[index] = updated;
    this.chapterOverrides.set(updated.id, updated);
    this.deletedChapterIds.delete(updated.id);

    const series = this.getSeriesById(updated.seriesId);
    if (series) {
      const seriesChs = this.getChaptersBySeriesId(updated.seriesId);
      series.chaptersCount = seriesChs.length;
      if (seriesChs.length > 0) {
        series.latestChapterId = seriesChs[seriesChs.length - 1].id;
      }
      this.seriesOverrides.set(series.id, series);
    }

    this.savePersistedState();
    return updated;
  }

  public deleteChapter(chapterId: string): boolean {
    this.loadPersistedState();
    const chapter = this.chapters.find((c) => c.id === chapterId);
    if (!chapter) return false;
    this.chapters = this.chapters.filter((c) => c.id !== chapterId);
    this.chapterOverrides.delete(chapterId);
    this.deletedChapterIds.add(chapterId);
    const series = this.getSeriesById(chapter.seriesId);
    if (series) {
      const remaining = this.getChaptersBySeriesId(chapter.seriesId);
      series.chaptersCount = remaining.length;
      series.latestChapterId =
        remaining.length > 0 ? remaining[remaining.length - 1].id : undefined;
      this.seriesOverrides.set(series.id, series);
    }
    this.savePersistedState();
    return true;
  }

  // Comments
  public getComments(chapterId: string): Comment[] {
    const normalizedId = chapterId.startsWith('ch-shadow-')
      ? chapterId.replace('ch-shadow-', 'ch-solo-leveling-')
      : chapterId;
    return this.comments
      .filter((c) => c.chapterId === normalizedId)
      .sort((a, b) => b.upvotes - a.upvotes);
  }

  public addComment(comment: Comment): Comment {
    this.comments.unshift(comment);
    return comment;
  }

  public upvoteComment(commentId: string): Comment | undefined {
    const comment = this.comments.find((c) => c.id === commentId);
    if (comment) {
      comment.upvotes += 1;
      comment.userUpvoted = true;
    }
    return comment;
  }

  public deleteComment(commentId: string): boolean {
    const initialLen = this.comments.length;
    this.comments = this.comments.filter((c) => c.id !== commentId);
    return this.comments.length < initialLen;
  }

  // Requests
  public getRequests(): SeriesRequest[] {
    return [...this.requests].sort((a, b) => b.votes - a.votes);
  }

  public addRequest(request: SeriesRequest): SeriesRequest {
    this.requests.unshift(request);
    return request;
  }

  public voteRequest(requestId: string): SeriesRequest | undefined {
    const req = this.requests.find((r) => r.id === requestId);
    if (req) {
      if (req.userVoted) {
        req.votes -= 1;
        req.userVoted = false;
      } else {
        req.votes += 1;
        req.userVoted = true;
      }
    }
    return req;
  }

  // Progress
  public getReadingProgress(userId: string): ReadingProgress[] {
    return this.progress.get(userId) || [];
  }

  public saveReadingProgress(userId: string, item: ReadingProgress) {
    const userProgress = this.progress.get(userId) || [];
    const index = userProgress.findIndex((p) => p.seriesId === item.seriesId);
    if (index >= 0) {
      userProgress[index] = { ...item, updatedAt: 'Just now' };
    } else {
      userProgress.unshift({ ...item, updatedAt: 'Just now' });
    }
    this.progress.set(userId, userProgress);
  }

  // User Sessions & Bookmarks
  public getSession(token: string): UserSession | undefined {
    return this.sessions.get(token);
  }

  public setSession(token: string, session: UserSession) {
    this.sessions.set(token, session);
  }

  public getSessionByRecoveryKeyHash(hash: string): UserSession | undefined {
    const token = this.keyToSession.get(hash);
    if (!token) return undefined;
    return this.sessions.get(token);
  }

  public mapRecoveryKeyHash(hash: string, token: string) {
    this.keyToSession.set(hash, token);
  }

  public toggleBookmark(userId: string, seriesId: string): string[] {
    for (const session of this.sessions.values()) {
      if (session.id === userId) {
        if (session.bookmarks.includes(seriesId)) {
          session.bookmarks = session.bookmarks.filter((id) => id !== seriesId);
        } else {
          session.bookmarks.push(seriesId);
        }
        return session.bookmarks;
      }
    }
    return [];
  }

  // Moderation
  public getReports(): ModerationReport[] {
    return this.reports;
  }

  public addReport(report: ModerationReport) {
    this.reports.unshift(report);
    return report;
  }

  public resolveReport(reportId: string, action: 'dismiss' | 'delete_comment'): boolean {
    const report = this.reports.find((r) => r.id === reportId);
    if (!report) return false;

    if (action === 'delete_comment' && report.targetType === 'comment') {
      this.deleteComment(report.targetId);
      report.status = 'Resolved';
    } else {
      report.status = 'Dismissed';
    }
    return true;
  }

  private adminPin: string = '1234';
  private adminSessions: Map<string, number> = new Map();

  public verifyAdminPin(pin: string): boolean {
    const trimmed = (pin || '').trim();
    if (!trimmed) return false;
    if (process.env.ADMIN_PIN && process.env.ADMIN_PIN.trim() === trimmed) {
      return true;
    }
    return this.adminPin === trimmed;
  }

  public setAdminPin(newPin: string): boolean {
    if (!newPin || newPin.trim().length < 4) return false;
    this.adminPin = newPin.trim();
    return true;
  }

  public createAdminSession(token: string, ttlMs: number): void {
    this.adminSessions.set(token, Date.now() + ttlMs);
  }

  public deleteAdminSession(token: string): void {
    this.adminSessions.delete(token);
  }

  public isAdminSessionValid(token: string): boolean {
    const expiry = this.adminSessions.get(token);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.adminSessions.delete(token);
      return false;
    }
    return true;
  }
}

// Versioned singleton key so updated curated catalog replaces any old in-memory instance immediately
const globalForDb = globalThis as unknown as { databaseStoreV4?: DatabaseStore };
export const dataStore = globalForDb.databaseStoreV4 ?? new DatabaseStore();
if (process.env.NODE_ENV !== 'production') {
  globalForDb.databaseStoreV4 = dataStore;
}
