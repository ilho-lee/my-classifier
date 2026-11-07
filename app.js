/* 화면 — 기준과 낱말은 파일에서 읽고, 정답(data/answer.json)은 채점 단추를 누를 때만 읽는다.
 * AI에는 가린 문장만 보낸다. 넣은 문장은 저장하지 않는다. */
(function () {
  "use strict";

  const BATCH = 10;
  const NO_ANSWER = "답 없음";
  const $ = id => document.getElementById(id);
  let criteria = null, keywords = null, aiDownload = null;

  async function getJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} 를 읽지 못했습니다 (${res.status})`);
    return res.json();
  }

  function showError(err) {
    const el = $("load-error");
    el.textContent = location.protocol === "file:"
      ? "파일을 바로 열면 기준 파일을 읽지 못합니다. 로컬 서버로 띄워 주세요."
      : err.message;
    el.hidden = false;
  }

  function setTab(name) {
    for (const tab of ["classify", "score"]) {
      const on = tab === name;
      $(`tab-${tab}`).setAttribute("aria-selected", String(on));
      $(`panel-${tab}`).hidden = !on;
    }
  }

  async function ready() {
    if (criteria) return;
    const [c, k] = await Promise.all([getJson("criteria.json"), getJson("keywords.json")]);
    criteria = c;
    keywords = k;
    $("owner").textContent = `${c.owner} · version ${c.version}`;
  }

  // 언제나 { results, model, reason } 모양으로 돌려준다. 실패하면 results 가 null 이다
  async function askAI(maskedTexts) {
    try {
      const res = await fetch("api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: maskedTexts }),
      });
      if (!res.ok) return { results: null, reason: `서버 함수가 답하지 않았습니다 (${res.status})` };
      return await res.json();
    } catch (err) {
      return { results: null, reason: "서버 함수에 닿지 못했습니다" };
    }
  }

  // ── 분류 ──────────────────────────────────────────
  async function onClassify(e) {
    e.preventDefault();
    const out = $("classify-result");
    const text = $("sentence").value.trim();
    if (!text) { out.hidden = true; return; }
    const btn = $("classify-btn");
    btn.disabled = true;
    try {
      await ready();
      const masked = Mask.mask(text);
      const ai = await askAI([masked]);
      const got = ai.results && ai.results[0];
      const r = got || Rules.classify(masked, criteria, keywords);
      $("r-masked").textContent = masked;
      $("r-category").textContent = r.category;
      $("r-urgency").textContent = r.urgency;
      $("r-reason").textContent = r.reason;
      $("r-by").textContent = got ? `AI · ${ai.model || ""}` : "규칙";
      $("r-note").hidden = !!got;
      $("r-note-why").textContent = got ? "" : (ai.reason || "AI가 이 문장에 답하지 않았습니다");
      out.hidden = false;
    } catch (err) {
      showError(err);
    } finally {
      btn.disabled = false;
    }
  }

  // ── 채점 ──────────────────────────────────────────
  function percent(n, total) {
    return total ? `${Math.round((n / total) * 100)}%` : "-";
  }

  function fillColumn(who, s) {
    $(`${who}-category`).textContent = `${s.categoryRight}/${s.total} (${percent(s.categoryRight, s.total)})`;
    $(`${who}-urgency`).textContent = `${s.urgencyRight}/${s.total} (${percent(s.urgencyRight, s.total)})`;
    $(`${who}-both`).textContent = `${s.bothRight}/${s.total}`;
    $("score-result").hidden = false;
  }

  function wrongItem(w) {
    const li = document.createElement("li");
    const text = document.createElement("p");
    text.textContent = w.text;
    const line = document.createElement("p");
    line.className = "wrong-line";
    const parts = [];
    if (!w.categoryOk) parts.push(`칸: ${w.answer.category} → ${w.predicted.category}`);
    if (!w.urgencyOk) parts.push(`긴급도: ${w.answer.urgency} → ${w.predicted.urgency}`);
    line.textContent = parts.join(" · ");
    li.append(text, line);
    return li;
  }

  function showWrong(label, wrong) {
    $("s-wrong-who").textContent = label;
    $("s-wrong-count").textContent = String(wrong.length);
    $("s-wrong").replaceChildren(...wrong.map(wrongItem));
  }

  function scoreRules(answers) {
    const s = Rules.score(answers, criteria, keywords, Mask.mask);
    fillColumn("rule", s);
    return s;
  }

  // 답을 못 받은 문장은 빼지 않고 오답으로 센다
  function scoreAI(answers, masked, results) {
    const s = { total: answers.length, categoryRight: 0, urgencyRight: 0, bothRight: 0, wrong: [] };
    answers.forEach((r, i) => {
      const p = results[i] || { category: NO_ANSWER, urgency: NO_ANSWER };
      const c = p.category === r["칸"];
      const u = p.urgency === r["긴급도"];
      if (c) s.categoryRight++;
      if (u) s.urgencyRight++;
      if (c && u) s.bothRight++;
      else s.wrong.push({ id: r.id, text: masked[i], answer: { category: r["칸"], urgency: r["긴급도"] }, predicted: p, categoryOk: c, urgencyOk: u });
    });
    return s;
  }

  async function withAnswers(work) {
    const buttons = [$("score-btn"), $("score-ai-btn")];
    buttons.forEach(b => { b.disabled = true; });
    try {
      await ready();
      await work(await getJson("data/answer.json"));
    } catch (err) {
      showError(err);
    } finally {
      buttons.forEach(b => { b.disabled = false; });
    }
  }

  function onScoreRules() {
    return withAnswers(async answers => {
      showWrong("규칙", scoreRules(answers).wrong);
    });
  }

  function onScoreAI() {
    const btn = $("score-ai-btn");
    const label = btn.textContent;
    return withAnswers(async answers => {
      const masked = answers.map(r => Mask.mask(r.text));
      const results = new Array(answers.length).fill(null);
      const failures = [];
      let model = "";
      $("download-btn").hidden = true;
      for (let i = 0; i < masked.length; i += BATCH) {
        btn.textContent = `AI 채점 중… ${i}/${masked.length}`;
        const ai = await askAI(masked.slice(i, i + BATCH));
        if (ai.results) {
          ai.results.forEach((x, j) => { results[i + j] = x || null; });
          model = ai.model || model;
        } else {
          failures.push(ai.reason || "이유를 받지 못했습니다");
        }
      }
      btn.textContent = `AI 채점 중… ${masked.length}/${masked.length}`;

      const missed = results.filter(x => !x).length;
      const s = scoreAI(answers, masked, results);
      scoreRules(answers);
      fillColumn("ai", s);
      $("ai-missed").textContent = `${missed}건`;
      $("rule-missed").textContent = "-";
      showWrong("AI", s.wrong);

      const msg = $("score-msg");
      msg.hidden = !failures.length;
      msg.textContent = failures.length ? `AI가 답하지 못한 묶음이 있습니다 — ${[...new Set(failures)].join(" / ")}` : "";

      aiDownload = {
        model: model || null,
        criteria_version: criteria.version,
        scored_at: new Date().toISOString(),
        total: s.total,
        category_right: s.categoryRight,
        urgency_right: s.urgencyRight,
        both_right: s.bothRight,
        missed,
        rows: answers.map((r, i) => ({ id: r.id, text: masked[i], 정답: { 칸: r["칸"], 긴급도: r["긴급도"] }, AI: results[i] })),
      };
      $("download-btn").hidden = false;
    }).finally(() => { btn.textContent = label; });
  }

  function onDownload() {
    if (!aiDownload) return;
    const blob = new Blob([JSON.stringify(aiDownload, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai_채점결과.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("tab-classify").addEventListener("click", () => setTab("classify"));
    $("tab-score").addEventListener("click", () => setTab("score"));
    $("classify-form").addEventListener("submit", onClassify);
    $("score-btn").addEventListener("click", onScoreRules);
    $("score-ai-btn").addEventListener("click", onScoreAI);
    $("download-btn").addEventListener("click", onDownload);
    ready().catch(showError);
  });
})();
