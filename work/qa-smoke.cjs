const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const file = path.resolve(__dirname, "..", "sdr-workspace-prototype.html");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => {
  if (!/Not implemented: window\.scrollTo/.test(e.message) && !/Not implemented: HTMLElement\.prototype\.scrollIntoView/.test(e.message) && !/navigation to another Document/.test(e.message)) {
    errors.push(e.message);
  }
});
vc.on("error", (...a) => errors.push(a.join(" ")));

(async () => {
  const dom = await JSDOM.fromFile(file, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.URL.createObjectURL = () => "blob:test";
      window.URL.revokeObjectURL = () => {};
      Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async () => {} } });
    },
  });
  const { window } = dom;
  const { document } = window;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
  const click = (el) => {
    if (!el) throw new Error("click target missing");
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  };
  const results = [];
  const check = (name, got, want) => {
    const ok = String(got) === String(want);
    results.push({ name, ok, got, want });
  };

  await wait(150);
  check("initial shift view", $("#view-shift")?.classList.contains("active"), true);
  check("no runtime errors on load", errors.length, 0);

  click($('a[href="#/queue"]'));
  await wait();
  check("queue reachable from sidebar", $("#view-queue")?.classList.contains("active"), true);
  check("queue row count", $$("#queueTable tbody tr").length, 8);

  $("#queuePriority").value = "Jamais appelés";
  $("#queuePriority").dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait();
  check("priority filter visible rows", $$("#queueTable tbody tr").filter((tr) => tr.style.display !== "none").length, 2);
  $("#queuePriority").value = "Toutes priorités";
  $("#queuePriority").dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait();

  click($('a[href="#/followups"]'));
  await wait();
  check("follow-up initial total chip", $("#followFilters [data-filter=all]").textContent.trim(), "Tout · 10");
  check("follow-up group today count", $("#todayCount").textContent, "3");
  check("follow-up confirm count", $("#confirmCount").textContent, "2");
  check("follow-up nav count", $("#navFollowCount").textContent, "10");

  click($("#followFilters [data-filter=meeting]"));
  await wait();
  check("meeting filter visible rows", $$("#view-followups .tl-row").filter((r) => r.style.display !== "none").length, 3);
  click($("#followFilters [data-filter=all]"));
  await wait();

  const historyBefore = Number($("#historyCount").textContent);
  const followBefore = $$("#view-followups .tl-row").length;
  click($('#view-followups button[data-call-name="Nadia Fournier"]'));
  await wait();
  check("call starts on Nadia", $("#leadName").textContent, "Nadia Fournier");
  check("call bar raised", $("#callbar").classList.contains("up"), true);
  check("results unlocked during call", $("#results").classList.contains("locked"), false);
  check("hero follows Nadia", $("#heroName").textContent, "Nadia Fournier");
  check("hero phone follows Nadia", $("#heroPhone").textContent, "01 45 22 08 74");
  check("dossier email follows Nadia", $("#leadEmail").getAttribute("href").includes("nadia.fournier"), true);

  click($$("#results [data-result]")[0]);
  check("result selects", $("#results .result.on")?.dataset.result, "RDV pris");
  click($("#saveOutcome"));
  await wait(80);
  check("history increments once", Number($("#historyCount").textContent), historyBefore + 1);
  check("follow-up created", $$("#view-followups .tl-row").length, followBefore + 1);
  check("call bar lowered after save", $("#callbar").classList.contains("up"), false);
  check("lead advances after save", $("#leadName").textContent, "Julien Marchand");
  check("hero advances after save", $("#heroName").textContent, "Julien Marchand");

  click($("#historySeg [data-range='7']"));
  await wait();
  check("7-day history hides older rows", $$("#view-history .tl-row").filter((r) => r.style.display !== "none").length, 7);
  click($("#historySeg [data-range='30']"));
  await wait();
  check("30-day history shows all rows", $$("#view-history .tl-row").filter((r) => r.style.display !== "none").length, 8);

  click($("#copyBrief"));
  check("copy brief keeps its toast", $("#toastText").textContent.includes("Brief mission copié"), true);
  click($("#exportQueue"));
  check("export keeps its toast", $("#toastText").textContent.includes("Export CSV"), true);

  const names = $$("#view-followups [data-call-name]").map((b) => b.dataset.callName);
  let allResolve = true;
  for (const name of [...new Set(names)]) {
    click($(`#view-followups [data-call-name="${name}"]`));
    await wait(10);
    if ($("#leadName").textContent !== name) allResolve = false;
    $("#stageEnd").click();
    await wait(10);
    $("[data-close-modal]")?.click();
    await wait(10);
  }
  check("every follow-up call opens its own lead", allResolve, true);

  check("no runtime errors after interactions", errors.length, 0);
  if (errors.length) console.log("RUNTIME ERRORS:\n" + errors.join("\n"));
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  (got ${r.got}, want ${r.want})`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exitCode = 1;
  dom.window.close();
})();
