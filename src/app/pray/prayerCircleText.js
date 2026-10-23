const copy = {
    en: { newPrayer: 'New prayer', newReply: 'New reply', replied: 'Replied', youReplied: 'You replied', sent: 'Sent', received: 'Received', unread: 'Unread', all: 'All', circle: 'Prayer Circle', anonymous: 'Anonymous', sentPrayer: 'Sent you a prayer', sentAnonymous: 'Sent you an anonymous prayer', replyFrom: 'Reply from', sentTo: 'Sent to', sentAnonymouslyTo: 'Sent anonymously to', noUnread: 'You’re all caught up', updates: 'new updates', viewUpdates: 'View new updates', replyFailed: 'Could not send your reply. Please try again.' },
    ar: { newPrayer: 'صلاة جديدة', newReply: 'رد جديد', replied: 'تم الرد', youReplied: 'لقد رددت', sent: 'المرسلة', received: 'الواردة', unread: 'غير المقروءة', all: 'الكل', circle: 'دائرة الصلاة', anonymous: 'مجهول', sentPrayer: 'أرسل إليك صلاة', sentAnonymous: 'أرسل إليك صلاة مجهولة', replyFrom: 'رد من', sentTo: 'أُرسلت إلى', sentAnonymouslyTo: 'أُرسلت بشكل مجهول إلى', noUnread: 'قرأت كل التحديثات', updates: 'تحديثات جديدة', viewUpdates: 'عرض التحديثات الجديدة', replyFailed: 'تعذّر إرسال ردك. حاول مرة أخرى.' },
    de: { newPrayer: 'Neues Gebet', newReply: 'Neue Antwort', replied: 'Beantwortet', youReplied: 'Du hast geantwortet', sent: 'Gesendet', received: 'Empfangen', unread: 'Ungelesen', all: 'Alle', circle: 'Gebetskreis', anonymous: 'Anonym', sentPrayer: 'Hat dir ein Gebet gesendet', sentAnonymous: 'Hat dir ein anonymes Gebet gesendet', replyFrom: 'Antwort von', sentTo: 'Gesendet an', sentAnonymouslyTo: 'Anonym gesendet an', noUnread: 'Du bist auf dem neuesten Stand', updates: 'neue Updates', viewUpdates: 'Neue Updates anzeigen', replyFailed: 'Deine Antwort konnte nicht gesendet werden. Bitte versuche es erneut.' },
};
copy.en.deleteForEveryone = 'Delete this prayer for both of you?';
copy.en.deleteFailed = 'Could not delete this prayer. Please check your connection and try again within one minute of sending.';
copy.ar.deleteForEveryone = 'حذف هذه الصلاة عندك وعند صديقك؟';
copy.ar.deleteFailed = 'تعذّر حذف الصلاة. تحقّق من اتصالك وحاول مجدداً خلال دقيقة من الإرسال.';
copy.de.deleteForEveryone = 'Dieses Gebet für euch beide löschen?';
copy.de.deleteFailed = 'Das Gebet konnte nicht gelöscht werden. Prüfe deine Verbindung und versuche es innerhalb einer Minute nach dem Senden erneut.';
export const prayerCircleText = language => copy[language] || copy.en;
const formats = new Map();
export function formatActivityTime(value, language) {
    if (!value) return '';
    const locale = { ar: 'ar-EG', de: 'de-DE', en: 'en-GB' }[language] || 'en-GB';
    if (!formats.has(locale)) formats.set(locale, new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
    return formats.get(locale).format(value);
}
