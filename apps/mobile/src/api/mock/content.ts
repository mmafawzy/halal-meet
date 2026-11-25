/** Bilingual content used to make the mock world feel real. Arabic is gendered by the *author*. */
import type { Gender, Locale } from '@halal-meet/core';

export interface Bi {
  en: string;
  ar_m: string;
  ar_f: string;
}

const b = (en: string, ar_m: string, ar_f: string = ar_m): Bi => ({ en, ar_m, ar_f });

/** Picks text written *by* a person of `author` gender. */
export function byAuthor(text: Bi, locale: Locale, author: Gender): string {
  if (locale === 'en') return text.en;
  return author === 'female' ? text.ar_f : text.ar_m;
}

export const MALE_NAMES: Array<[string, string]> = [
  ['Ahmed', 'أحمد'], ['Omar', 'عمر'], ['Youssef', 'يوسف'], ['Khaled', 'خالد'], ['Mahmoud', 'محمود'],
  ['Mostafa', 'مصطفى'], ['Ibrahim', 'إبراهيم'], ['Hamza', 'حمزة'], ['Bilal', 'بلال'], ['Tariq', 'طارق'],
  ['Karim', 'كريم'], ['Ali', 'علي'], ['Hassan', 'حسن'], ['Abdullah', 'عبدالله'], ['Abdulrahman', 'عبدالرحمن'],
  ['Faisal', 'فيصل'], ['Saud', 'سعود'], ['Nasser', 'ناصر'], ['Majed', 'ماجد'], ['Anas', 'أنس'],
  ['Zaid', 'زيد'], ['Yahya', 'يحيى'], ['Idris', 'إدريس'], ['Ilyas', 'إلياس'], ['Adam', 'آدم'],
  ['Rayan', 'ريان'], ['Sami', 'سامي'], ['Walid', 'وليد'], ['Hisham', 'هشام'], ['Amir', 'أمير'],
  ['Mohamed', 'محمد'], ['Salman', 'سلمان'], ['Imran', 'عمران'], ['Zakariya', 'زكريا'], ['Ismail', 'إسماعيل'],
  ['Mehdi', 'مهدي'], ['Yassine', 'ياسين'], ['Nabil', 'نبيل'], ['Suleiman', 'سليمان'], ['Hussein', 'حسين'],
];

export const FEMALE_NAMES: Array<[string, string]> = [
  ['Sara', 'سارة'], ['Mariam', 'مريم'], ['Fatima', 'فاطمة'], ['Aisha', 'عائشة'], ['Khadija', 'خديجة'],
  ['Nour', 'نور'], ['Layla', 'ليلى'], ['Hana', 'هنا'], ['Salma', 'سلمى'], ['Yasmin', 'ياسمين'],
  ['Amina', 'أمينة'], ['Zainab', 'زينب'], ['Huda', 'هدى'], ['Reem', 'ريم'], ['Dina', 'دينا'],
  ['Asmaa', 'أسماء'], ['Rania', 'رانيا'], ['Malak', 'ملك'], ['Jana', 'جنى'], ['Lina', 'لينا'],
  ['Ruqayya', 'رقية'], ['Safiya', 'صفية'], ['Hafsa', 'حفصة'], ['Sumaya', 'سمية'], ['Iman', 'إيمان'],
  ['Noura', 'نورة'], ['Lujain', 'لجين'], ['Shahd', 'شهد'], ['Rahma', 'رحمة'], ['Alaa', 'آلاء'],
  ['Basma', 'بسمة'], ['Heba', 'هبة'], ['Ghada', 'غادة'], ['Samira', 'سميرة'], ['Inès', 'إيناس'],
  ['Yousra', 'يسرى'], ['Kenza', 'كنزة'], ['Amal', 'أمل'], ['Leen', 'لين'], ['Maryam', 'مريم'],
];

export const PROFESSIONS: Bi[] = [
  b('Software engineer', 'مهندس برمجيات', 'مهندسة برمجيات'),
  b('Pharmacist', 'صيدلي', 'صيدلانية'),
  b('Doctor', 'طبيب', 'طبيبة'),
  b('Teacher', 'معلّم', 'معلّمة'),
  b('Accountant', 'محاسب', 'محاسبة'),
  b('Architect', 'مهندس معماري', 'مهندسة معمارية'),
  b('Dentist', 'طبيب أسنان', 'طبيبة أسنان'),
  b('Marketing manager', 'مدير تسويق', 'مديرة تسويق'),
  b('Civil engineer', 'مهندس مدني', 'مهندسة مدنية'),
  b('Researcher', 'باحث', 'باحثة'),
  b('Entrepreneur', 'رائد أعمال', 'رائدة أعمال'),
  b('Lawyer', 'محامٍ', 'محامية'),
  b('Nurse', 'ممرض', 'ممرضة'),
  b('Graphic designer', 'مصمم جرافيك', 'مصممة جرافيك'),
  b('Financial analyst', 'محلل مالي', 'محللة مالية'),
  b('Product manager', 'مدير منتجات', 'مديرة منتجات'),
];

export const EDUCATION: Bi[] = [
  b("Bachelor's degree", 'بكالوريوس'),
  b("Master's degree", 'ماجستير'),
  b('PhD', 'دكتوراه'),
  b('Diploma', 'دبلوم'),
];

export const ABOUT: Bi[] = [
  b(
    'I value honesty, family and a calm home. I enjoy reading, long walks and learning something new every week.',
    'أقدّر الصدق والعائلة والبيت الهادئ. أحب القراءة والمشي الطويل وتعلّم شيء جديد كل أسبوع.',
  ),
  b(
    'Close to my family and practising. Looking for a partner to grow with in deen and dunya.',
    'قريب من عائلتي وملتزم، وأبحث عن شريكة أنمو معها في الدين والدنيا.',
    'قريبة من عائلتي وملتزمة، وأبحث عن شريك أنمو معه في الدين والدنيا.',
  ),
  b(
    "Weekends are for family lunches, sport and the occasional road trip. I'd love a home full of laughter and good manners.",
    'عطلة نهاية الأسبوع للغداء العائلي والرياضة ورحلة بين الحين والآخر. أتمنى بيتًا مليئًا بالضحك وحسن الخلق.',
  ),
  b(
    'I work hard, pray on time and try to be a better person every day. Looking for someone kind, sincere and ready.',
    'أعمل بجد وأحافظ على الصلاة وأحاول أن أكون أفضل كل يوم. أبحث عن إنسانة طيبة وصادقة ومستعدة.',
    'أعمل بجد وأحافظ على الصلاة وأحاول أن أكون أفضل كل يوم. أبحث عن إنسان طيب وصادق ومستعد.',
  ),
  b(
    'Recently moved back home after studying abroad. I love cooking, Quran circles and volunteering.',
    'عدت مؤخرًا إلى بلدي بعد الدراسة في الخارج. أحب الطبخ وحلقات القرآن والعمل التطوعي.',
  ),
  b(
    'Calm, organised and a big believer in good communication. Family means everything to me.',
    'هادئ ومنظّم وأؤمن كثيرًا بأهمية الحوار الجيد. العائلة تعني لي كل شيء.',
    'هادئة ومنظّمة وأؤمن كثيرًا بأهمية الحوار الجيد. العائلة تعني لي كل شيء.',
  ),
];

/** Canned replies in a respectful tone. */
export const REPLIES: Bi[] = [
  b(
    "Wa alaikum assalam! Thank you for reaching out, it's nice to meet you.",
    'وعليكم السلام ورحمة الله! شكرًا لتواصلك، سعيد بالتعرف عليك.',
    'وعليكم السلام ورحمة الله! شكرًا لتواصلك، سعيدة بالتعرف عليك.',
  ),
  b(
    "That's a good question. Family is very important to me — I'm close to my parents and siblings.",
    'سؤال جميل. العائلة مهمة جدًا بالنسبة لي، وأنا قريب من والديّ وإخوتي.',
    'سؤال جميل. العائلة مهمة جدًا بالنسبة لي، وأنا قريبة من والديّ وإخوتي.',
  ),
  b(
    'I agree. Clear communication from the start makes everything easier, in sha Allah.',
    'أوافقك الرأي. الوضوح من البداية يسهّل كل شيء بإذن الله.',
  ),
  b(
    "I'd like to know more about how you imagine daily life after marriage.",
    'أودّ أن أعرف أكثر عن تصوّرك للحياة اليومية بعد الزواج.',
  ),
  b('JazakAllahu khairan for sharing that. It means a lot.', 'جزاك الله خيرًا على مشاركتي ذلك، هذا يعني لي الكثير.'),
  b(
    'I sent you one of the topic cards — curious to see if we answered the same way!',
    'أرسلت لك إحدى بطاقات المواضيع، فضولي أن أعرف إن كانت إجاباتنا متشابهة!',
    'أرسلت لك إحدى بطاقات المواضيع، فضولية أن أعرف إن كانت إجاباتنا متشابهة!',
  ),
];

export const SAFE_REPLY: Bi = b(
  "I'd rather keep our conversation here on Halal Meet for now.",
  'أفضّل أن تبقى محادثتنا هنا على Halal Meet في الوقت الحالي.',
);

export const SEED_CONVERSATION: Array<{ fromMe: boolean; text: Bi }> = [
  { fromMe: true, text: b('Assalamu alaikum! Your answer about family closeness resonated with me.', 'السلام عليكم! أعجبتني إجابتك عن القرب من العائلة.') },
  REPLIES[0] ? { fromMe: false, text: REPLIES[0] } : { fromMe: false, text: b('', '') },
  { fromMe: true, text: b('What does a good weekend look like for you?', 'كيف تبدو عطلة نهاية الأسبوع المثالية بالنسبة لك؟') },
  {
    fromMe: false,
    text: b(
      'Family lunch on Friday after Jumu’ah, then a walk by the water. Simple things! And you?',
      'غداء عائلي يوم الجمعة بعد الصلاة، ثم نزهة قرب البحر. أشياء بسيطة! وأنت؟',
    ),
  },
];

export const INTEREST_NOTES: Bi[] = [
  b(
    'Your answer about family closeness resonated with me. I would be glad to get to know you, with good intentions.',
    'أعجبتني إجابتك عن القرب من العائلة، ويسعدني التعرف عليك بنيّة صادقة.',
  ),
  b(
    'We seem aligned on the things that matter most. I would love to learn more about your plans.',
    'يبدو أننا متفقان في الأمور الأهم، وأودّ أن أعرف أكثر عن خططك.',
  ),
];

export const RISK_KEYWORDS: Record<'money' | 'off_platform', RegExp> = {
  money:
    /\b(money|cash|transfer|western\s*union|moneygram|bank|iban|crypto|bitcoin|usdt|loan|invest(ment)?|gift\s*card|send me \$?\d+)\b|فلوس|تحويل (مبلغ|أموال|مال)|حوالة|حساب بنكي|رقم الحساب|قرض|بيتكوين|عملات رقمية|(أرسل|ارسل|أرسلي|ارسلي) لي (مبلغ|مال|المال)/i,
  off_platform:
    /\b(whats\s*app|telegram|snap(chat)?|instagram|insta|signal|wechat|viber|my number|phone number|call me on|text me on)\b|واتس|واتساب|تيليجرام|تلجرام|سناب|انستا|إنستغرام|رقمي|رقم هاتفي|رقم جوالي/i,
};

export function detectRisk(text: string): 'money' | 'off_platform' | null {
  if (RISK_KEYWORDS.money.test(text)) return 'money';
  if (RISK_KEYWORDS.off_platform.test(text)) return 'off_platform';
  return null;
}

export const STAGE_NAMES: Bi[] = [
  b('Introduction', 'التعارف'),
  b('Values', 'القيم'),
  b('Expectations', 'التوقعات'),
  b('Serious discussion', 'النقاش الجاد'),
  b('Family introduction', 'تعارف العائلتين'),
  b('Meeting', 'اللقاء'),
];

export const SYSTEM_TEXT = {
  stage: b('You both agreed to move to stage {n} · {name}', 'اتفقتما على الانتقال إلى المرحلة {n} · {name}'),
  closed: b('May Allah grant you what is best.', 'أسأل الله أن يكتب لك الخير حيث كان.'),
  matched: b("It's a match, in sha Allah. Start with salam.", 'تمّ التوافق بإذن الله. ابدأ بالسلام.', 'تمّ التوافق بإذن الله. ابدئي بالسلام.'),
};
