import type { Dimension, Gender, LocalizedText } from './types';

export type AnswerType = 'ordinal' | 'categorical';

export interface QuestionOption {
  value: string;
  label: LocalizedText;
}

export interface QuestionDef {
  key: string;
  dimension: Dimension;
  type: AnswerType;
  /** Short topic name used in reasons and topic coverage, e.g. "Children". */
  topic: LocalizedText;
  text: LocalizedText;
  /** Prompt about the partner, used when setting `accept`. */
  partnerText: LocalizedText;
  options: QuestionOption[];
  /** If set, only this gender answers about themselves; the other gender only sets a preference. */
  selfFor?: Gender;
  /** One of the 15 core marriage topics tracked in conversations. */
  coreTopic?: boolean;
  /** Included in the onboarding starter set. */
  starter?: boolean;
  /** Partial credit for categorical mismatches: partial[a][b] in 0..1 (symmetric lookups are applied). */
  partial?: Record<string, Record<string, number>>;
  /** Natural reason template when aligned. `{value}` is replaced by the option label. */
  aligned?: LocalizedText;
}

const t = (en: string, ar_m: string, ar_f: string = ar_m): LocalizedText => ({ en, ar_m, ar_f });
const o = (value: string, en: string, ar: string, ar_f?: string): QuestionOption => ({
  value,
  label: t(en, ar, ar_f ?? ar),
});

export const QUESTIONS: QuestionDef[] = [
  // ───────── Religion ─────────
  {
    key: 'prayer',
    dimension: 'religion',
    type: 'ordinal',
    starter: true,
    topic: t('Prayer', 'الصلاة'),
    text: t('How often do you pray?', 'كم مرة تصلي؟', 'كم مرة تصلين؟'),
    partnerText: t('How often should your spouse pray?', 'كم مرة تفضّل أن تصلي زوجتك؟', 'كم مرة تفضّلين أن يصلي زوجك؟'),
    options: [
      o('five_daily', 'All 5 daily prayers', 'الصلوات الخمس يوميًا'),
      o('usually', 'Usually', 'غالبًا'),
      o('sometimes', 'Sometimes', 'أحيانًا'),
      o('rarely', 'Rarely', 'نادرًا'),
    ],
    aligned: t('Similar prayer practice', 'التزام متقارب بالصلاة'),
  },
  {
    key: 'fasting',
    dimension: 'religion',
    type: 'ordinal',
    topic: t('Fasting', 'الصيام'),
    text: t('How do you approach fasting?', 'ما علاقتك بالصيام؟', 'ما علاقتكِ بالصيام؟'),
    partnerText: t('What fasting practice would you like in a spouse?', 'ما الذي تفضّله في صيام زوجتك؟', 'ما الذي تفضّلينه في صيام زوجك؟'),
    options: [
      o('ramadan_plus', 'Ramadan + voluntary fasts', 'رمضان وصيام التطوع'),
      o('ramadan', 'Ramadan', 'رمضان'),
      o('occasionally', 'Occasionally', 'أحيانًا'),
      o('not_currently', 'Not currently', 'لا أصوم حاليًا', 'لا أصوم حاليًا'),
    ],
  },
  {
    key: 'orientation',
    dimension: 'religion',
    type: 'categorical',
    topic: t('Islamic orientation', 'التوجه الإسلامي'),
    text: t('Your Islamic orientation (optional)', 'توجهك الإسلامي (اختياري)', 'توجهكِ الإسلامي (اختياري)'),
    partnerText: t('Which orientations are you open to?', 'ما التوجهات التي تقبلها؟', 'ما التوجهات التي تقبلينها؟'),
    options: [
      o('sunni', 'Sunni', 'سنّي', 'سنّية'),
      o('shia', 'Shia', 'شيعي', 'شيعية'),
      o('other', 'Other', 'أخرى'),
      o('prefer_not', 'Prefer not to say', 'أفضّل عدم الإجابة'),
    ],
  },
  {
    key: 'hijab',
    dimension: 'religion',
    type: 'ordinal',
    selfFor: 'female',
    topic: t('Hijab', 'الحجاب'),
    text: t('Do you wear hijab?', 'هل ترتدين الحجاب؟', 'هل ترتدين الحجاب؟'),
    partnerText: t('What is your hijab preference for your wife?', 'ما تفضيلك بشأن حجاب زوجتك؟', 'ما تفضيلك بشأن حجاب زوجتك؟'),
    options: [
      o('niqab', 'Niqab', 'نقاب'),
      o('hijab', 'Hijab', 'حجاب'),
      o('sometimes', 'Sometimes', 'أحيانًا'),
      o('no', 'No', 'لا'),
    ],
  },
  {
    key: 'beard',
    dimension: 'religion',
    type: 'ordinal',
    selfFor: 'male',
    topic: t('Beard', 'اللحية'),
    text: t('Do you keep a beard?', 'هل تطلق لحيتك؟', 'هل تطلق لحيتك؟'),
    partnerText: t('What is your beard preference for your husband?', 'ما تفضيلك بشأن لحية زوجك؟', 'ما تفضيلكِ بشأن لحية زوجكِ؟'),
    options: [
      o('full', 'Full beard', 'لحية كاملة'),
      o('trimmed', 'Trimmed', 'لحية خفيفة'),
      o('none', 'No beard', 'بدون لحية'),
    ],
  },
  {
    key: 'mosque',
    dimension: 'religion',
    type: 'ordinal',
    topic: t('Mosque attendance', 'الذهاب إلى المسجد'),
    text: t('How often do you attend the mosque?', 'كم مرة تذهب إلى المسجد؟', 'كم مرة تذهبين إلى المسجد؟'),
    partnerText: t('How important is mosque attendance in a spouse?', 'ما أهمية ارتياد المسجد لدى زوجتك؟', 'ما أهمية ارتياد المسجد لدى زوجكِ؟'),
    options: [
      o('weekly_plus', 'Several times a week', 'عدة مرات أسبوعيًا'),
      o('jumuah', "Jumu'ah / weekly", 'الجمعة / أسبوعيًا'),
      o('occasionally', 'Occasionally', 'أحيانًا'),
      o('rarely', 'Rarely', 'نادرًا'),
    ],
  },
  {
    key: 'music',
    dimension: 'religion',
    type: 'ordinal',
    topic: t('Music', 'الموسيقى'),
    text: t('Your view on music', 'رأيك في الموسيقى', 'رأيكِ في الموسيقى'),
    partnerText: t("Your spouse's view on music", 'رأي شريكة حياتك في الموسيقى', 'رأي شريك حياتكِ في الموسيقى'),
    options: [
      o('avoid', 'I avoid music', 'أتجنب الموسيقى'),
      o('some', 'Some, selectively', 'أستمع أحيانًا بانتقاء'),
      o('comfortable', 'Comfortable with music', 'لا مانع لدي'),
    ],
  },
  {
    key: 'gender_mixing',
    dimension: 'religion',
    type: 'ordinal',
    topic: t('Mixed environments', 'الاختلاط'),
    text: t('How do you approach mixed-gender environments?', 'ما موقفك من البيئات المختلطة؟', 'ما موقفكِ من البيئات المختلطة؟'),
    partnerText: t('What would you prefer for your spouse?', 'ماذا تفضّل لزوجتك؟', 'ماذا تفضّلين لزوجكِ؟'),
    options: [
      o('avoid', 'Avoid where possible', 'أتجنبها قدر الإمكان'),
      o('limited', 'Limited / professional only', 'في حدود العمل والضرورة'),
      o('comfortable', 'Comfortable', 'لا مانع لدي'),
    ],
  },
  // ───────── Lifestyle ─────────
  {
    key: 'smoking',
    dimension: 'lifestyle',
    type: 'ordinal',
    starter: true,
    topic: t('Smoking', 'التدخين'),
    text: t('Do you smoke?', 'هل تدخّن؟', 'هل تدخّنين؟'),
    partnerText: t('Is smoking acceptable in a spouse?', 'هل تقبل أن تكون زوجتك مدخّنة؟', 'هل تقبلين أن يكون زوجكِ مدخّنًا؟'),
    options: [
      o('never', 'Never', 'لا أدخّن'),
      o('trying_to_quit', 'Trying to quit', 'أحاول الإقلاع'),
      o('regularly', 'Regularly', 'بانتظام'),
    ],
    aligned: t('Same view on smoking', 'رأي متفق في التدخين'),
  },
  {
    key: 'social_life',
    dimension: 'lifestyle',
    type: 'ordinal',
    coreTopic: true,
    topic: t('Social life', 'الحياة الاجتماعية'),
    text: t('How social are you?', 'ما مدى اجتماعيتك؟', 'ما مدى اجتماعيتكِ؟'),
    partnerText: t('What social life would suit you in a spouse?', 'ما نمط الحياة الاجتماعية الذي يناسبك في زوجتك؟', 'ما نمط الحياة الاجتماعية الذي يناسبكِ في زوجكِ؟'),
    options: [
      o('homebody', 'Homebody', 'أحب البقاء في البيت'),
      o('balanced', 'Balanced', 'متوازن', 'متوازنة'),
      o('very_social', 'Very social', 'اجتماعي جدًا', 'اجتماعية جدًا'),
    ],
  },
  {
    key: 'travel',
    dimension: 'lifestyle',
    type: 'ordinal',
    topic: t('Travel', 'السفر'),
    text: t('How much do you enjoy travelling?', 'إلى أي مدى تحب السفر؟', 'إلى أي مدى تحبين السفر؟'),
    partnerText: t('How much travel would you like together?', 'كم تحب أن تسافرا معًا؟', 'كم تحبين أن تسافرا معًا؟'),
    options: [
      o('love', 'Love it', 'أحبه كثيرًا'),
      o('sometimes', 'Sometimes', 'أحيانًا'),
      o('rarely', 'Rarely', 'نادرًا'),
    ],
    aligned: t('Similar love of travel', 'حب متقارب للسفر'),
  },
  {
    key: 'conflict_style',
    dimension: 'lifestyle',
    type: 'categorical',
    coreTopic: true,
    starter: true,
    topic: t('Resolving disagreements', 'حل الخلافات'),
    text: t('When you disagree with someone close, you usually…', 'عند الخلاف مع شخص قريب، عادةً…', 'عند الخلاف مع شخص قريب، عادةً…'),
    partnerText: t('How would you like your spouse to handle disagreements?', 'كيف تفضّل أن تتعامل زوجتك مع الخلافات؟', 'كيف تفضّلين أن يتعامل زوجكِ مع الخلافات؟'),
    options: [
      o('talk_now', 'Talk it through right away', 'نتحدث فورًا'),
      o('cool_off', 'Cool off, then talk', 'أهدأ أولًا ثم نتحدث'),
      o('involve_family', 'Seek advice from family', 'أستشير الأهل'),
    ],
    partial: { talk_now: { cool_off: 0.6 }, cool_off: { involve_family: 0.5 } },
    aligned: t('Similar way of resolving disagreements', 'أسلوب متقارب في حل الخلافات'),
  },
  // ───────── Children ─────────
  {
    key: 'want_children',
    dimension: 'children',
    type: 'categorical',
    coreTopic: true,
    starter: true,
    topic: t('Children', 'الأطفال'),
    text: t('Do you want children?', 'هل ترغب في إنجاب أطفال؟', 'هل ترغبين في إنجاب أطفال؟'),
    partnerText: t('Should your spouse want children?', 'هل يجب أن ترغب زوجتك في الإنجاب؟', 'هل يجب أن يرغب زوجكِ في الإنجاب؟'),
    options: [
      o('yes', 'Yes', 'نعم'),
      o('maybe', 'Maybe / open', 'ربما'),
      o('no', 'No', 'لا'),
    ],
    partial: { yes: { maybe: 0.5 }, maybe: { no: 0.4 } },
    aligned: t('Same view on having children', 'رأي متفق حول الإنجاب'),
  },
  {
    key: 'children_count',
    dimension: 'children',
    type: 'ordinal',
    coreTopic: true,
    starter: true,
    topic: t('Number of children', 'عدد الأطفال'),
    text: t('Ideally, how many children would you like?', 'كم طفلًا تتمنى أن يكون لديك؟', 'كم طفلًا تتمنين أن يكون لديكِ؟'),
    partnerText: t('How many children should your spouse want?', 'كم طفلًا تفضّل أن ترغب زوجتك فيه؟', 'كم طفلًا تفضّلين أن يرغب زوجكِ فيه؟'),
    options: [
      o('1', '1', '١'),
      o('2', '2', '٢'),
      o('3', '3', '٣'),
      o('4_plus', '4 or more', '٤ أو أكثر'),
    ],
    aligned: t('Both want {value} children', 'كلاكما يرغب في {value} من الأطفال'),
  },
  {
    key: 'children_when',
    dimension: 'children',
    type: 'ordinal',
    topic: t('When to have children', 'توقيت الإنجاب'),
    text: t('When would you like to have children?', 'متى تحب أن تنجب؟', 'متى تحبين أن تنجبي؟'),
    partnerText: t("What timing would suit you in a spouse?", 'ما التوقيت المناسب لك؟', 'ما التوقيت المناسب لكِ؟'),
    options: [
      o('asap', 'As soon as possible', 'في أقرب وقت'),
      o('1_2_years', 'In 1–2 years', 'خلال سنة إلى سنتين'),
      o('3_plus_years', 'In 3+ years', 'بعد ٣ سنوات أو أكثر'),
    ],
  },
  {
    key: 'kids_schooling',
    dimension: 'children',
    type: 'categorical',
    coreTopic: true,
    topic: t("Children's schooling", 'تعليم الأطفال'),
    text: t('What schooling would you prefer for your children?', 'أي نوع من التعليم تفضّل لأطفالك؟', 'أي نوع من التعليم تفضّلين لأطفالكِ؟'),
    partnerText: t('Which schooling preferences are you open to?', 'ما التفضيلات التعليمية التي تقبلها؟', 'ما التفضيلات التعليمية التي تقبلينها؟'),
    options: [
      o('islamic', 'Islamic school', 'مدرسة إسلامية'),
      o('private', 'Private / international', 'خاصة / دولية'),
      o('public', 'Public school', 'مدرسة حكومية'),
      o('homeschool', 'Homeschooling', 'التعليم المنزلي'),
      o('flexible', 'Flexible', 'مرن', 'مرنة'),
    ],
    partial: { flexible: { islamic: 0.8, private: 0.8, public: 0.8, homeschool: 0.8 }, private: { public: 0.4 } },
  },
  // ───────── Family ─────────
  {
    key: 'living_arrangement',
    dimension: 'family',
    type: 'categorical',
    coreTopic: true,
    starter: true,
    topic: t('Living arrangement', 'السكن بعد الزواج'),
    text: t('Where would you like to live after marriage?', 'أين تحب أن تسكن بعد الزواج؟', 'أين تحبين أن تسكني بعد الزواج؟'),
    partnerText: t('Which living arrangements are acceptable to you?', 'ما ترتيبات السكن المقبولة لديك؟', 'ما ترتيبات السكن المقبولة لديكِ؟'),
    options: [
      o('independent', 'Our own home', 'بيت مستقل'),
      o('near_parents', 'Near our parents', 'بالقرب من الأهل'),
      o('with_parents', 'With parents', 'مع الأهل'),
      o('flexible', 'Flexible', 'مرن', 'مرنة'),
    ],
    partial: {
      independent: { near_parents: 0.6, flexible: 0.8 },
      near_parents: { with_parents: 0.5, flexible: 0.8 },
      with_parents: { flexible: 0.7 },
    },
    aligned: t('Both prefer: {value}', 'كلاكما يفضّل: {value}'),
  },
  {
    key: 'parents_involvement',
    dimension: 'family',
    type: 'ordinal',
    coreTopic: true,
    topic: t("Parents' involvement", 'دور الأهل'),
    text: t('How involved should parents be in your married life?', 'ما مدى مشاركة الأهل في حياتك الزوجية؟', 'ما مدى مشاركة الأهل في حياتكِ الزوجية؟'),
    partnerText: t('What level of parental involvement suits you?', 'ما مستوى مشاركة الأهل الذي يناسبك؟', 'ما مستوى مشاركة الأهل الذي يناسبكِ؟'),
    options: [
      o('high', 'Very involved', 'مشاركة كبيرة'),
      o('moderate', 'Moderately involved', 'مشاركة معتدلة'),
      o('low', 'Mostly independent', 'استقلالية في الغالب'),
    ],
  },
  {
    key: 'family_visits',
    dimension: 'family',
    type: 'ordinal',
    coreTopic: true,
    topic: t('Family visits', 'زيارات الأهل'),
    text: t('How often would you like to see extended family?', 'كم مرة تحب زيارة الأهل والأقارب؟', 'كم مرة تحبين زيارة الأهل والأقارب؟'),
    partnerText: t('What visit frequency suits you?', 'ما معدل الزيارات المناسب لك؟', 'ما معدل الزيارات المناسب لكِ؟'),
    options: [
      o('weekly', 'Weekly', 'أسبوعيًا'),
      o('monthly', 'Monthly', 'شهريًا'),
      o('occasionally', 'Occasionally', 'أحيانًا'),
    ],
  },
  {
    key: 'wedding_size',
    dimension: 'family',
    type: 'ordinal',
    coreTopic: true,
    topic: t('Wedding expectations', 'توقعات حفل الزفاف'),
    text: t('What kind of wedding do you imagine?', 'أي نوع من حفلات الزفاف تتخيل؟', 'أي نوع من حفلات الزفاف تتخيلين؟'),
    partnerText: t('What wedding size suits you?', 'ما حجم الحفل المناسب لك؟', 'ما حجم الحفل المناسب لكِ؟'),
    options: [
      o('small', 'Small and simple', 'صغير وبسيط'),
      o('medium', 'Medium', 'متوسط'),
      o('large', 'Large celebration', 'احتفال كبير'),
    ],
  },
  // ───────── Career & roles ─────────
  {
    key: 'spouses_working',
    dimension: 'career',
    type: 'categorical',
    coreTopic: true,
    starter: true,
    topic: t('Working after marriage', 'العمل بعد الزواج'),
    text: t('After marriage, who should work?', 'بعد الزواج، من يعمل؟', 'بعد الزواج، من يعمل؟'),
    partnerText: t('Which views on working are acceptable to you?', 'ما الآراء المقبولة لديك حول العمل؟', 'ما الآراء المقبولة لديكِ حول العمل؟'),
    options: [
      o('both', 'Both spouses', 'كلا الزوجين'),
      o('husband_only', 'Husband only', 'الزوج فقط'),
      o('wife_choice', "Wife's choice", 'حسب رغبة الزوجة'),
      o('flexible', 'Flexible', 'مرن', 'مرنة'),
    ],
    partial: {
      both: { wife_choice: 0.7, flexible: 0.8 },
      husband_only: { wife_choice: 0.5, flexible: 0.6 },
      wife_choice: { flexible: 0.9 },
    },
    aligned: t('Aligned on working after marriage', 'رؤية متفقة حول العمل بعد الزواج'),
  },
  {
    key: 'household_roles',
    dimension: 'career',
    type: 'categorical',
    coreTopic: true,
    topic: t('Household responsibilities', 'مسؤوليات المنزل'),
    text: t('How should household responsibilities be shared?', 'كيف تُقسَّم مسؤوليات المنزل؟', 'كيف تُقسَّم مسؤوليات المنزل؟'),
    partnerText: t('Which approaches are acceptable to you?', 'ما الأساليب المقبولة لديك؟', 'ما الأساليب المقبولة لديكِ؟'),
    options: [
      o('traditional', 'Traditional roles', 'أدوار تقليدية'),
      o('shared', 'Shared equally', 'مشاركة متساوية'),
      o('flexible', 'Flexible', 'مرن', 'مرنة'),
    ],
    partial: { traditional: { flexible: 0.6 }, shared: { flexible: 0.8 } },
  },
  {
    key: 'career_ambition',
    dimension: 'career',
    type: 'ordinal',
    coreTopic: true,
    topic: t('Career ambitions', 'الطموح المهني'),
    text: t('How would you describe your career ambitions?', 'كيف تصف طموحك المهني؟', 'كيف تصفين طموحكِ المهني؟'),
    partnerText: t('What career ambition suits you in a spouse?', 'ما الطموح المهني الذي يناسبك في زوجتك؟', 'ما الطموح المهني الذي يناسبكِ في زوجكِ؟'),
    options: [
      o('very_high', 'Very ambitious', 'طموح جدًا', 'طموحة جدًا'),
      o('balanced', 'Balanced with family', 'متوازن مع الأسرة', 'متوازنة مع الأسرة'),
      o('family_first', 'Family comes first', 'الأسرة أولًا'),
    ],
  },
  // ───────── Finance ─────────
  {
    key: 'finances',
    dimension: 'finance',
    type: 'categorical',
    coreTopic: true,
    starter: true,
    topic: t('Managing finances', 'إدارة المال'),
    text: t('How would you manage money as a couple?', 'كيف تديران المال كزوجين؟', 'كيف تديران المال كزوجين؟'),
    partnerText: t('Which approaches are acceptable to you?', 'ما الأساليب المقبولة لديك؟', 'ما الأساليب المقبولة لديكِ؟'),
    options: [
      o('joint', 'Joint finances', 'ميزانية مشتركة'),
      o('separate', 'Separate finances', 'ميزانية منفصلة'),
      o('mixed', 'A mix of both', 'مزيج من الاثنين'),
    ],
    partial: { joint: { mixed: 0.6 }, separate: { mixed: 0.6 } },
    aligned: t('Similar approach to money', 'نظرة متقاربة لإدارة المال'),
  },
  {
    key: 'saving_spending',
    dimension: 'finance',
    type: 'ordinal',
    topic: t('Saving vs spending', 'الادخار والإنفاق'),
    text: t('Are you more of a saver or a spender?', 'هل تميل إلى الادخار أم الإنفاق؟', 'هل تميلين إلى الادخار أم الإنفاق؟'),
    partnerText: t('What would suit you in a spouse?', 'ما الذي يناسبك في زوجتك؟', 'ما الذي يناسبكِ في زوجكِ؟'),
    options: [
      o('saver', 'Saver', 'أميل إلى الادخار'),
      o('balanced', 'Balanced', 'متوازن', 'متوازنة'),
      o('spender', 'Spender', 'أميل إلى الإنفاق'),
    ],
  },
  {
    key: 'debt_attitude',
    dimension: 'finance',
    type: 'categorical',
    topic: t('Attitude to debt', 'الموقف من الديون'),
    text: t('What is your attitude to debt and financing?', 'ما موقفك من الديون والتمويل؟', 'ما موقفكِ من الديون والتمويل؟'),
    partnerText: t('Which attitudes are acceptable to you?', 'ما المواقف المقبولة لديك؟', 'ما المواقف المقبولة لديكِ؟'),
    options: [
      o('avoid_all', 'Avoid all debt', 'أتجنب أي دين'),
      o('islamic_finance', 'Islamic financing only', 'التمويل الإسلامي فقط'),
      o('flexible', 'Flexible', 'مرن', 'مرنة'),
    ],
    partial: { avoid_all: { islamic_finance: 0.6 }, islamic_finance: { flexible: 0.5 } },
  },
  // ───────── Location ─────────
  {
    key: 'relocation',
    dimension: 'location',
    type: 'ordinal',
    coreTopic: true,
    starter: true,
    topic: t('Relocation', 'الانتقال'),
    text: t('Would you relocate for marriage?', 'هل تنتقل للعيش في مكان آخر من أجل الزواج؟', 'هل تنتقلين للعيش في مكان آخر من أجل الزواج؟'),
    partnerText: t("What about your spouse's willingness to relocate?", 'ماذا عن استعداد زوجتك للانتقال؟', 'ماذا عن استعداد زوجكِ للانتقال؟'),
    options: [
      o('anywhere', 'Yes, anywhere', 'نعم، إلى أي مكان'),
      o('within_country', 'Within my country', 'داخل بلدي'),
      o('no', 'No', 'لا'),
    ],
    aligned: t('Similar openness to relocating', 'استعداد متقارب للانتقال'),
  },
];

export const QUESTIONS_BY_KEY: Record<string, QuestionDef> = Object.fromEntries(
  QUESTIONS.map((q) => [q.key, q]),
);

export const STARTER_QUESTION_KEYS = QUESTIONS.filter((q) => q.starter).map((q) => q.key);
export const CORE_TOPIC_KEYS = QUESTIONS.filter((q) => q.coreTopic).map((q) => q.key);

/**
 * Every gender sees every question. `selfFor` questions (hijab, beard) are answered about oneself
 * by that gender only; the other gender sets a partner preference. The UI uses these two helpers
 * to decide which half to render.
 */
export function canAnswerSelf(q: QuestionDef, gender: Gender): boolean {
  return !q.selfFor || q.selfFor === gender;
}

export function canSetPreference(q: QuestionDef, gender: Gender): boolean {
  return !q.selfFor || q.selfFor !== gender;
}
