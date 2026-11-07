/* 가림 — 이름 · 전화번호 · 사번을 브라우저 안에서 가린다. 분류는 가린 문장으로 한다. */
(function (root) {
  "use strict";

  // «대표님»처럼 이름이 아닌 말을 잡지 않으려고 «성씨 + 두 글자 + 호칭» 또는 «성씨 + 두 글자 + 전화번호» 일 때만 이름으로 본다
  const SURNAMES = "김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모";
  const TITLES = "씨|님|사원|주임|대리|과장|차장|부장|팀장|실장|선임|책임|수석|인턴";

  const PHONE = /(?<!\d)0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}(?!\d)/g;
  // «사번이랑 비번»처럼 번호가 없는 말은 두고, 번호가 붙은 것만 가린다
  const EMPLOYEE_ID = /(?:사번|사원번호)\s*(?:은|는|이|:|=)?\s*[A-Za-z]{0,3}-?\d{3,}/g;
  const NAME_BY_TITLE = new RegExp(`(?<![가-힣])[${SURNAMES}][가-힣]{2}(?=\\s?(?:${TITLES}))`, "g");
  const NAME_BY_PHONE = new RegExp(`(?<![가-힣])[${SURNAMES}][가-힣]{2}(?=\\s?\\[전화번호\\])`, "g");

  function mask(text) {
    return String(text == null ? "" : text)
      .replace(PHONE, "[전화번호]")
      .replace(EMPLOYEE_ID, "[사번]")
      .replace(NAME_BY_TITLE, "[이름]")
      .replace(NAME_BY_PHONE, "[이름]");
  }

  const api = { mask };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Mask = api;
})(this);
