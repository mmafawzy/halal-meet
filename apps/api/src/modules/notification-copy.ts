/**
 * Server-side push copy (EN/AR). The in-app inbox renders its own localised copy from `kind` + payload; pushes
 * need text at send time. Wording is calm and never shows message content on the lock screen. Arabic avoids
 * gendered verbs because the recipient's and the actor's genders are not known here.
 */
export interface PushCopy {
  title: string;
  body: string;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v.trim() ? v : fallback);

export function pushCopy(kind: string, payload: Record<string, unknown>, locale: string): PushCopy {
  const ar = locale === 'ar';
  const name = str(payload.firstName);
  const guardian = str(payload.guardianName);
  switch (kind) {
    case 'match':
      return ar
        ? { title: 'اهتمام متبادل', body: name ? `هناك اهتمام متبادل بينك وبين ${name}. ابدأ بالسلام متى شئت.` : 'لديك اهتمام متبادل جديد.' }
        : { title: "It's a match", body: name ? `You and ${name} are both interested. Say salam when you're ready.` : 'You have a new mutual match.' };
    case 'message': {
      const n = typeof payload.count === 'number' ? payload.count : 1;
      if (ar) return { title: name || 'رسالة جديدة', body: n > 1 ? `${n} رسائل جديدة` : 'رسالة جديدة في محادثتكما' };
      return { title: name || 'New message', body: n > 1 ? `${n} new messages` : 'Sent you a message' };
    }
    case 'interest':
      if (payload.countOnly) return ar ? { title: 'اهتمام جديد', body: 'هناك من أبدى اهتمامه بك.' } : { title: 'New interest', body: 'Someone is interested in you.' };
      return ar
        ? { title: 'اهتمام جديد', body: name ? `اهتمام جديد من ${name}.` : 'هناك من أبدى اهتمامه بك.' }
        : { title: 'New interest', body: name ? `${name} is interested in you.` : 'Someone is interested in you.' };
    case 'serious_interest':
      return ar
        ? { title: '⭐ اهتمام جاد', body: name ? `اهتمام جاد من ${name}.` : 'هناك من يرغب بجدية في التعرف عليك.' }
        : { title: '⭐ Serious interest', body: name ? `${name} is seriously interested in you.` : 'Someone is seriously interested in you.' };
    case 'guardian_accepted':
      return ar
        ? { title: 'العائلة', body: guardian ? `تم قبول دعوتك من ${guardian}.` : 'تم قبول دعوتك للعائلة.' }
        : { title: 'Family', body: guardian ? `${guardian} accepted your invitation.` : 'Your family invitation was accepted.' };
    case 'guardian_opinion':
      return ar
        ? { title: 'العائلة', body: guardian ? `رأي جديد من ${guardian}.` : 'رأي جديد من عائلتك.' }
        : { title: 'Family', body: guardian ? `${guardian} shared a thought on one of your introductions.` : 'Your family shared a thought.' };
    case 'guardian_stage_decision': {
      const approved = payload.decision === 'approve';
      if (ar) return { title: 'العائلة', body: approved ? `موافقة من ${guardian || 'عائلتك'} على المرحلة التالية.` : `طلب ${guardian || 'أحد أفراد عائلتك'} النقاش أولًا.` };
      return { title: 'Family', body: approved ? `${guardian || 'Your family'} approved the next step.` : `${guardian || 'Your family'} would like to talk first.` };
    }
    case 'guardian_removed':
      return ar ? { title: 'العائلة', body: 'تم تحديث صلاحيات العائلة لديك.' } : { title: 'Family', body: 'Your family access was updated.' };
    case 'top_picks':
      return ar ? { title: 'اختياراتك المميزة', body: 'اختيارات اليوم المميزة جاهزة.' } : { title: 'Top Picks', body: 'Your Top Picks are ready.' };
    case 'photo_request':
      return ar
        ? { title: 'طلب رؤية صورة', body: name ? `يطلب ${name} رؤية صورتك. القرار لك.` : 'هناك طلب لرؤية صورتك. القرار لك.' }
        : { title: 'Photo request', body: name ? `${name} asked to see your photo. It is your choice.` : 'Someone asked to see your photo. It is your choice.' };
    case 'photo_approved':
      return ar
        ? { title: 'صورة مشتركة', body: name ? `شارك ${name} صورته معك.` : 'تمت مشاركة صورة معك.' }
        : { title: 'Photo shared', body: name ? `${name} shared their photo with you.` : 'A photo was shared with you.' };
    case 'moderation':
      return moderationCopy(str(payload.type), ar);
    case 'billing':
      return billingCopy(str(payload.event), ar);
    case 'account_deletion_scheduled':
      return ar
        ? { title: 'حذف الحساب', body: 'تمت جدولة حذف حسابك. يمكنك التراجع خلال فترة السماح.' }
        : { title: 'Account deletion', body: 'Your account is scheduled for deletion. You can cancel during the grace period.' };
    case 'account_deletion_cancelled':
      return ar ? { title: 'حسابك', body: 'تم إلغاء حذف حسابك. مرحبًا بعودتك.' } : { title: 'Your account', body: 'Your account deletion was cancelled. Welcome back.' };
    default:
      return ar ? { title: 'Halal Meet', body: 'لديك إشعار جديد.' } : { title: 'Halal Meet', body: 'You have a new notification.' };
  }
}

/** Neutral wording for moderation outcomes; never names the other person or the report details. */
function moderationCopy(type: string, ar: boolean): PushCopy {
  const t = ar ? 'رسالة من فريق الأمان' : 'From the safety team';
  const body: Record<string, [string, string]> = {
    warning: ['A reminder about our community guidelines. Please keep conversations respectful.', 'تذكير بإرشادات المجتمع. نرجو أن تبقى المحادثات محترمة.'],
    message_removed: ['One of your messages was removed because it did not follow our guidelines.', 'أُزيلت إحدى رسائلك لأنها لا تتوافق مع إرشاداتنا.'],
    suspended: ['Your account is temporarily suspended. Open the app for details.', 'تم إيقاف حسابك مؤقتًا. افتح التطبيق لمعرفة التفاصيل.'],
    banned: ['Your account has been closed for breaking our guidelines.', 'تم إغلاق حسابك لمخالفة الإرشادات.'],
    reinstated: ['Your account is active again.', 'أصبح حسابك نشطًا من جديد.'],
    photo_not_approved: ['One of your photos was not approved. You can upload another.', 'لم تتم الموافقة على إحدى صورك. يمكنك رفع صورة أخرى.'],
    report_reviewed: ['Thank you — we reviewed your report.', 'شكرًا لك — راجعنا بلاغك.'],
  };
  const pair = body[type] ?? ['You have an update from the safety team.', 'لديك تحديث من فريق الأمان.'];
  return { title: t, body: ar ? pair[1] : pair[0] };
}

/** Transparent billing notices (spec 02 §9: no pressure tactics). */
function billingCopy(event: string, ar: boolean): PushCopy {
  const t = ar ? 'اشتراكك' : 'Your subscription';
  const body: Record<string, [string, string]> = {
    purchased: ['Thank you — your plan is active.', 'شكرًا لك — اشتراكك مفعّل.'],
    renewed: ['Your plan renewed.', 'تم تجديد اشتراكك.'],
    renewal_off: ['Auto-renew is off. You keep your plan until the end of the period.', 'التجديد التلقائي متوقف، ويبقى اشتراكك حتى نهاية المدة.'],
    expired: ['Your plan has ended. Everything free stays free.', 'انتهى اشتراكك، وتبقى الميزات المجانية متاحة.'],
    billing_issue: ['There was a problem with your payment. Please check it in your store account.', 'حدثت مشكلة في الدفع. يُرجى مراجعتها من حساب المتجر.'],
    refunded: ['Your refund was processed.', 'تمت معالجة استرداد المبلغ.'],
    paused: ['Your subscription is paused.', 'اشتراكك متوقف مؤقتًا.'],
  };
  const pair = body[event] ?? ['Your subscription was updated.', 'تم تحديث اشتراكك.'];
  return { title: t, body: ar ? pair[1] : pair[0] };
}
