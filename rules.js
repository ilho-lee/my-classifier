/* 규칙 분류기 — AI 없이 criteria.json 과 keywords.json 만으로 가른다. 이 점수가 기준선이다.
 * 낱말과 정답은 이 파일에 적지 않는다. */
(function (root) {
  "use strict";

  function hit(text, words) {
    return (words || []).find(w => text.includes(w)) || null;
  }

  // 받은 문장은 이미 가린 문장이어야 한다
  function classify(maskedText, criteria, keywords) {
    const text = String(maskedText || "");

    const order = criteria.priority;
    let category = order[order.length - 1];
    let categoryWord = null;
    for (const name of order) {
      const w = hit(text, keywords.categories[name]);
      if (w) { category = name; categoryWord = w; break; }
    }

    let urgency = keywords.urgency_default;
    let urgencyWord = null;
    for (const level of criteria.urgency.map(u => u.name)) {
      const w = hit(text, keywords.urgency[level]);
      if (w) { urgency = level; urgencyWord = w; break; }
    }

    const a = categoryWord ? `«${categoryWord}» → ${category}` : `칸 낱말 없음 → ${category}`;
    const b = urgencyWord ? `«${urgencyWord}» → ${urgency}` : `긴급도 낱말 없음 → ${urgency}`;
    return { category, urgency, reason: `${a} · ${b}` };
  }

  // rows = [{ text, 칸, 긴급도 }] — 채점도 가린 문장으로 한다
  function score(rows, criteria, keywords, mask) {
    let categoryRight = 0, urgencyRight = 0, bothRight = 0;
    const wrong = [];
    for (const r of rows) {
      const masked = mask(r.text);
      const p = classify(masked, criteria, keywords);
      const c = p.category === r["칸"];
      const u = p.urgency === r["긴급도"];
      if (c) categoryRight++;
      if (u) urgencyRight++;
      if (c && u) bothRight++;
      else wrong.push({ id: r.id, text: masked, answer: { category: r["칸"], urgency: r["긴급도"] }, predicted: p, categoryOk: c, urgencyOk: u });
    }
    return { total: rows.length, categoryRight, urgencyRight, bothRight, wrong };
  }

  const api = { classify, score };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Rules = api;
})(this);
