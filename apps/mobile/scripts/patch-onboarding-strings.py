import io

p = r'G:\Code\halal-meet\apps\mobile\src\i18n\strings\onboarding.ts'
s = io.open(p, encoding='utf-8').read()
orig = s

# ---------------- EN ----------------
s = s.replace("""    acceptTitle: 'Which modes are you comfortable matching with?',
    acceptHint: 'Your own mode is always included.',
  },""",
"""    acceptTitle: 'Which modes are you comfortable matching with?',
    acceptHint: 'Your own mode is always included.',
    mode: {
      private: {
        b1: 'Direct conversation between the two of you',
        b2: 'Etiquette reminders and privacy controls',
        b3: 'A guardian can be added at any time',
      },
      guided: {
        b1: 'Six structured stages, with suggested questions',
        b2: 'Photos and outside contact wait until you are both ready',
        b3: 'Gentle reminders if a conversation goes quiet',
      },
      wali: {
        b1: 'Your guardian sees the information you approve',
        b2: 'They can join conversations and confirm each stage',
        b3: 'Their presence is always visible to the other person',
      },
    },
  },""")

s = s.replace("""    permissionDenied: 'Photo access was not allowed. You can enable it in your device settings, or skip for now.',
  },""",
"""    permissionDenied: 'Photo access was not allowed. You can enable it in your device settings, or skip for now.',
    skip: 'Skip for now',
    state: {
      visible: 'Your photo is visible',
      blurred: 'Shown blurred until you approve',
      locked: 'Hidden - shared by your guardian',
    },
    verifiedNote: 'A verified photo is never shown to anyone without your permission.',
  },""")

s = s.replace("""    consentOn: 'Turn on religious matching',
  },""",
"""    consentOn: 'Turn on religious matching',
    intro: 'Answer as much or as little as you like - each answer sharpens your introductions.',
    about: 'About you',
    aboutSpouse: 'About the person you hope to marry',
    preferenceSpouse: 'What you would accept in a spouse: {{values}}',
    none: 'Not set',
    explained: 'Your note: {{text}}',
  },""")

s = s.replace("""    doneCount: 'Questions answered: {{n}}',
  },""",
"""    doneCount: 'Questions answered: {{n}}',
    answered: '{{n}} of {{total}} answered',
    note: 'Explain more (optional)',
    notePlaceholder: 'Add a sentence if your answer needs context...',
    next: 'Next question',
    answeredShort: 'Answered',
  },""")

s = s.replace("""    counterError: "We couldn't count right now - that's okay, you can continue.",
  },""",
"""    counterError: "We couldn't count right now - that's okay, you can continue.",
    countTitle: 'Your dealbreakers',
    reason: 'Why this matters (optional)',
    reasonPlaceholder: 'Private - never shown to anyone...',
    relaxTitle: 'Widen your reach',
    relaxBody: 'Making one or two of these "Important" instead keeps them in mind without hiding people.',
    reviewHint: 'Tap a card to change its importance or add a private reason.',
  },""")

s = s.replace("""    finish: 'Finish setup',
  },""",
"""    finish: 'Finish setup',
    timesLabel: 'Top Picks refresh',
    notifValue: 'New mutual matches, replies from your matches and your daily Top Picks - and nothing else.',
    guardianSoon: 'Preview',
  },""")

s = s.replace("""    note: 'Your feed is always open. Top Picks refresh every evening.',
    cta: 'Start discovering',
  },""",
"""    note: 'Your feed is always open. Top Picks refresh every evening.',
    cta: 'Start discovering',
    strength: 'Profile strength {{pct}}%',
    strengthHint: 'A strong profile is shown to more people who fit.',
    saved: 'Your profile and answers are saved.',
  },""")

# ---------------- AR ----------------
s = s.replace("""    acceptTitle: 'ما الأوضاع التي ترتاح للتوافق معها؟',
    acceptHint: 'وضعك أنت مُضمَّن دائمًا.',
  },""",
"""    acceptTitle: 'ما الأوضاع التي ترتاح للتوافق معها؟',
    acceptHint: 'وضعك أنت مُضمَّن دائمًا.',
    mode: {
      private: {
        b1: 'محادثة مباشرة بينكما',
        b2: 'تذكير بآداب الحوار وأدوات للخصوصية',
        b3: 'يمكن إضافة وليّ في أي وقت',
      },
      guided: {
        b1: 'ست مراحل منظّمة مع أسئلة مقترحة',
        b2: 'الصور والتواصل الخارجي ينتظران حتى تكونا مستعدَّين',
        b3: 'تذكير لطيف إن سكنت المحادثة',
      },
      wali: {
        b1: 'يطّلع وليّك على المعلومات التي توافق عليها',
        b2: 'يمكنه الانضمام إلى المحادثات وتأكيد كل مرحلة',
        b3: 'حضوره ظاهر دائمًا للطرف الآخر',
      },
    },
  },""")

s = s.replace("""    permissionDenied: 'لم يُسمح بالوصول إلى الصور. يمكنك تفعيله من إعدادات جهازك، أو التخطي الآن.',
  },""",
"""    permissionDenied: 'لم يُسمح بالوصول إلى الصور. يمكنك تفعيله من إعدادات جهازك، أو التخطي الآن.',
    skip: 'تخطٍّ الآن',
    state: {
      visible: 'صورتك ظاهرة',
      blurred: 'تظهر مموّهة حتى توافق',
      locked: 'مخفية — يشاركها وليّك',
    },
    verifiedNote: 'الصورة الموثّقة لا تظهر لأي أحد دون إذنك.',
  },""")

s = s.replace("""    consentOn: 'تفعيل التوافق الديني',
  },""",
"""    consentOn: 'تفعيل التوافق الديني',
    intro: 'أجب عمّا تشاء — كل إجابة تجعل ترشيحاتك أدق.',
    about: 'عنك',
    aboutSpouse: 'عن من تتمنى الارتباط به',
    preferenceSpouse: 'ما تقبله في شريك الحياة: {{values}}',
    none: 'غير محدد',
    explained: 'ملاحظتك: {{text}}',
  },""")

s = s.replace("""    doneCount: 'عدد الإجابات: {{n}}',
  },""",
"""    doneCount: 'عدد الإجابات: {{n}}',
    answered: 'تمت الإجابة عن {{n}} من {{total}}',
    note: 'اشرح أكثر (اختياري)',
    notePlaceholder: 'أضف جملة إن كانت إجابتك تحتاج توضيحًا…',
    next: 'السؤال التالي',
    answeredShort: 'تمت الإجابة',
  },""")

s = s.replace("""    counterError: 'تعذّر الحساب الآن — لا بأس، يمكنك المتابعة.',
  },""",
"""    counterError: 'تعذّر الحساب الآن — لا بأس، يمكنك المتابعة.',
    countTitle: 'شروطك الأساسية',
    reason: 'لماذا يهمّك هذا؟ (اختياري)',
    reasonPlaceholder: 'خاص — لن يظهر لأحد…',
    relaxTitle: 'وسّع نطاقك',
    relaxBody: 'اجعل شرطًا أو اثنين «مهمًّا» بدلًا من «شرط أساسي» ليظل في الحسبان دون أن يحجب أشخاصًا.',
    reviewHint: 'اضغط على أي بطاقة لتغيير أهميتها أو إضافة سبب خاص.',
  },""")

s = s.replace("""    finish: 'إنهاء الإعداد',
  },""",
"""    finish: 'إنهاء الإعداد',
    timesLabel: 'موعد تجدد أفضل الترشيحات',
    notifValue: 'التوافقات المتبادلة الجديدة، وردود من تتوافق معهم، وأفضل ترشيحاتك اليومية — لا شيء غير ذلك.',
    guardianSoon: 'معاينة',
  },""")

s = s.replace("""    note: 'صفحة الاكتشاف متاحة دائمًا، وأفضل الترشيحات تتجدد كل مساء.',
    cta: 'ابدأ الاكتشاف',
  },""",
"""    note: 'صفحة الاكتشاف متاحة دائمًا، وأفضل الترشيحات تتجدد كل مساء.',
    cta: 'ابدأ الاكتشاف',
    strength: 'قوة الملف {{pct}}%',
    strengthHint: 'الملف القوي يُعرض على عدد أكبر ممن يناسبونك.',
    saved: 'تم حفظ ملفك وإجاباتك.',
  },""")

assert s != orig, 'no replacements applied'
io.open(p, 'w', encoding='utf-8').write(s)
print('ok')
