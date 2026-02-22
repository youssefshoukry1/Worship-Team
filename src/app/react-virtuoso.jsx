"use client";

import { Virtuoso } from "react-virtuoso";

export default function EasyVirtualList({ items }) {
    // 1. تأكد أن items ليست فارغة لتجنب أخطاء الرندر
    if (!items || items.length === 0) return <div className="p-4 text-white">لا توجد بيانات للعرض</div>;

    return (
        <Virtuoso
            // 2. الـ height مهم جداً، لو عاوزه ياخد مساحة الشاشة كلها استخدم 100vh
            style={{ height: "600px", width: "100%" }}
            data={items}
            // 3. إضافة الـ computeItemKey بتخلي السكرول ناعم جداً ومستقر
            computeItemKey={(index, item) => item.id || index}
            itemContent={(index, item) => (
                // 4. ده شكل العنصر (تأكد من استخدام بياناتك الحقيقية هنا)
                <div className="p-4 border-b border-slate-800 text-white hover:bg-slate-900 transition-colors">
                    <span className="opacity-50 mr-2">{index + 1}.</span>
                    {item.title || item.name} {/* جرب item.title أو أي خاصية عندك */}
                </div>
            )}
        />
    );
}