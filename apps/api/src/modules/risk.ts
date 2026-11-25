/** Risk detection for message bodies (spec 01 §38, spec 05 §5). Keyword lists in English + Arabic. */
export type RiskWarning = 'money' | 'off_platform' | 'explicit' | 'aggression';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

interface Rule {
  warning: RiskWarning;
  patterns: RegExp[];
}

function normalize(text: string): string {
  let out = text.toLowerCase();
  for (let i = 0; i < ARABIC_DIGITS.length; i++) out = out.split(ARABIC_DIGITS[i]!).join(String(i));
  return out
    .replace(/[ً-ْٰـ]/g, '') // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[.,!?،؛:()[\]{}"'`«»]/g, ' ');
}

const RULES: Rule[] = [
  {
    warning: 'money',
    patterns: [
      /\bsend (me )?(some )?money\b/,
      /\bsend (me )?(some )?(cash|usdt|btc|bitcoin|eth|crypto)\b/,
      /\bwestern union\b/,
      /\bmoney ?gram\b/,
      /\bwire transfer\b/,
      /\bbank transfer\b/,
      /\b(usdt|btc|bitcoin|ethereum|crypto|binance|wallet address)\b/,
      /\blend me\b/,
      /\b(borrow|lend)\b.*\b(money|cash|\$)\b/,
      /\bneed (money|cash|funds|\$)\b/,
      /\bfinancial help\b/,
      /\bsupport me financially\b/,
      /\bvisa fee\b/,
      /\bpay for (my )?(visa|ticket|tickets)\b/,
      /\bgift card\b/,
      /\bwesternunion\b/,
      /\bحوّل\b/,
      /\bتحويل\b/,
      /\bفلوس\b/,
      /\bسلفة\b/,
      /\bسلفني\b/,
      /\bمحتاج (مبلغ|مال|فلوس)\b/,
      /\bمحتاجه (مبلغ|مال|فلوس)\b/,
      /\bفيزا\b/,
      /\bمصاريف الفيزا\b/,
      /\bارسل (لي )?(مبلغ|فلوس|دولار)\b/,
      /\bبيتكوين\b/,
      /\bعملات رقميه\b/,
      /\bكاش\b/,
      /\bدفع رسوم\b/,
      /\bويسترن يونيون\b/,
      /\bحساب بنكي\b/,
    ],
  },
  {
    warning: 'off_platform',
    patterns: [
      /\bwhats ?app\b/,
      /\bwhatsapp\b/,
      /\btelegram\b/,
      /\bsnap(chat)?\b/,
      /\bsignal\b/,
      /\binstagram\b/,
      /\bfacebook\b/,
      /\bimessage\b/,
      /\badd me on\b/,
      /\bmy number is\b/,
      /\bmy (phone|cell) (number|num)\b/,
      /(?:\+?\d[\s().-]?){8,}/,
      /\bواتس\b/,
      /\bواتساب\b/,
      /\bتلجرام\b/,
      /\bتلغرام\b/,
      /\bسناب\b/,
      /\bانستجرام\b/,
      /\bرقمي\b/,
      /\bرقم جوالي\b/,
      /\bنتكلم برا\b/,
      /\bخارج التطبيق\b/,
    ],
  },
  {
    warning: 'explicit',
    patterns: [/\bnudes?\b/, /\bsext/, /\bsex(ting|y)?\b/, /\bnaked\b/, /\bxxx\b/, /\bعاري/, /\bجنس\b/, /\bمثير\b/],
  },
  {
    warning: 'aggression',
    patterns: [/\bidiot\b/, /\bstupid\b/ , /\bshut up\b/, /\byou('| a)re worthless\b/, /\bkill you\b/, /\bthreat/, /\bغبي/, /\bحقير/, /\bاخرس/, /\bاهددك\b/],
  },
];

/** Returns the highest-priority warning found in the text, or null. */
export function detectRisk(body: string): RiskWarning | null {
  const text = normalize(body);
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      if (p.test(text)) return rule.warning;
    }
  }
  return null;
}
