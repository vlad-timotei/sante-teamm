// Teamm Test Setup v0.1.0
// State-machine-driven automation for configuring a new medical test in teamm.work.
// Reads/writes pending state via GM storage. Each step is keyed by a URL pattern;
// when the user lands on a matching page we run the handler, advance the step,
// and navigate to the next URL. The user supplies the actual flow — handlers
// below are placeholders.

(function () {
  "use strict";

  const STORAGE_KEY = "sante-pending-teamm-setup";
  const FORM_TEMPLATE_URL = "https://teamm.work/admin/general-config/form-templates/guestOrUser/setup/6621244c2b3bf26ba0d354da";

  // ----------------------------------------------------------------
  // State helpers
  // ----------------------------------------------------------------

  async function readState() {
    const raw = await GM.getValue(STORAGE_KEY, "");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        await clearState();
        return null;
      }
      return parsed;
    } catch {
      await clearState();
      return null;
    }
  }

  async function writeState(state) {
    await GM.setValue(STORAGE_KEY, JSON.stringify(state));
  }

  async function clearState() {
    await GM.deleteValue(STORAGE_KEY);
  }

  async function recordError(state, step, err) {
    state.error = { step, message: String(err?.message || err), at: Date.now() };
    await writeState(state);
  }

  // ----------------------------------------------------------------
  // DOM helpers
  // ----------------------------------------------------------------

  function waitForElement(selector, { timeout = 10000, root = document } = {}) {
    return new Promise((resolve, reject) => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });
      observer.observe(root === document ? document.documentElement : root, {
        childList: true, subtree: true,
      });

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for: ${selector}`));
      }, timeout);
    });
  }

  // For React/Angular/Vue: the framework often overrides the input setter,
  // so direct .value = x doesn't trigger their listeners. Use the native
  // descriptor and dispatch input/change events.
  function setNativeInputValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function ensureAnimStyles() {
    if (document.getElementById("teamm-anim-styles")) return;
    const s = document.createElement("style");
    s.id = "teamm-anim-styles";
    s.textContent = `
      @keyframes teamm-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes teamm-pulse { 0%,100% { box-shadow: 0 6px 20px rgba(40,167,69,0.4); } 50% { box-shadow: 0 6px 28px rgba(40,167,69,0.7); } }
    `;
    document.head.appendChild(s);
  }

  const FLOATING_BTN_KINDS = {
    primary: { bg: "linear-gradient(135deg, #28a745, #1e7e34)", shadow: "rgba(40,167,69,0.4)",  pulse: true },
    warning: { bg: "linear-gradient(135deg, #f0a500, #c98700)", shadow: "rgba(240,165,0,0.45)", pulse: false },
    danger:  { bg: "linear-gradient(135deg, #dc3545, #a71d2a)", shadow: "rgba(220,53,69,0.45)", pulse: false },
    info:    { bg: "linear-gradient(135deg, #17a2b8, #1289a0)", shadow: "rgba(23,162,184,0.4)", pulse: false },
  };

  // Render a vertical stack of action buttons at bottom-right. Each button:
  // { label, onClick, kind? }. Clicking any button disables the rest and
  // removes the whole stack after the click handler resolves.
  function showFloatingButtons(buttons) {
    const existing = document.getElementById("teamm-floating-actions");
    if (existing) existing.remove();
    ensureAnimStyles();

    const container = document.createElement("div");
    container.id = "teamm-floating-actions";
    container.style.cssText = `
      position: fixed; bottom: 28px; right: 28px;
      display: flex; flex-direction: column; gap: 10px;
      align-items: stretch; z-index: 100020;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    for (const spec of buttons) {
      const s = FLOATING_BTN_KINDS[spec.kind] || FLOATING_BTN_KINDS.primary;
      const animation = s.pulse
        ? "teamm-fade-up 250ms ease-out, teamm-pulse 2s ease-in-out 250ms infinite"
        : "teamm-fade-up 250ms ease-out";

      const btn = document.createElement("button");
      btn.textContent = spec.label;
      btn.style.cssText = `
        padding: 14px 30px; border: none; border-radius: 30px;
        font-size: 15px; font-weight: 700; cursor: pointer;
        background: ${s.bg}; color: white;
        box-shadow: 0 6px 20px ${s.shadow};
        animation: ${animation};
        white-space: nowrap;
      `;
      btn.addEventListener("click", async () => {
        container.querySelectorAll("button").forEach((b) => (b.disabled = true));
        btn.style.opacity = "0.6";
        btn.textContent = "...";
        try { await spec.onClick(); } finally { container.remove(); }
      });
      container.appendChild(btn);
    }

    document.body.appendChild(container);
    return container;
  }

  function showFloatingButton(label, onClick, kind = "primary") {
    return showFloatingButtons([{ label, onClick, kind }]);
  }

  function formatProcDate(date) {
    const pad2 = (n) => String(n).padStart(2, "0");
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${m}/${d}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }

  const ROMANIAN_MONTHS_SHORT = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];

  function buildImportFilename(prefix) {
    const now = new Date();
    return `${prefix}_${now.getDate()}_${ROMANIAN_MONTHS_SHORT[now.getMonth()]}_Sante.txt`;
  }

  // Pick a random in-range value if min/max are numeric, else 1-100. The
  // import only validates that the value contains a digit; range is cosmetic.
  function randomTestValue(state) {
    const min = parseFloat(state.min);
    const max = parseFloat(state.max);
    if (!isNaN(min) && !isNaN(max) && max > min) {
      return String(Math.floor(min + Math.random() * (max - min + 1)));
    }
    return String(Math.floor(Math.random() * 100) + 1);
  }

  function buildMeasurementSearchUrl(name) {
    const params = new URLSearchParams({
      length: "50",
      usedIn: "table",
      search: name,
      start: "0",
    });
    return `https://teamm.work/admin/medical/intakes?${params}`;
  }

  function showBanner(text, kind = "info") {
    const existing = document.getElementById("teamm-setup-banner");
    if (existing) existing.remove();
    const colors = {
      info:    { bg: "#1289a0", fg: "white" },
      success: { bg: "#28a745", fg: "white" },
      error:   { bg: "#dc3545", fg: "white" },
    };
    const c = colors[kind] || colors.info;
    const el = document.createElement("div");
    el.id = "teamm-setup-banner";
    el.textContent = text;
    el.style.cssText = `
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      background: ${c.bg}; color: ${c.fg}; padding: 10px 20px;
      border-radius: 22px; font-size: 13px; font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 100020;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    document.body.appendChild(el);
    return el;
  }

  // ----------------------------------------------------------------
  // Steps
  // Each entry: { match: (url) => boolean, run: async (state) => nextStep|null }
  // Returning null clears state (flow done). Throwing aborts and stores error.
  // ----------------------------------------------------------------

  // Wait for the search results to settle, then decide whether the test exists.
  //
  // Important: "There is no data" appears in the DOM during loading too, so we
  // can't trust it the moment we see it. Strategy:
  //   1. Always prefer real rows — if `tr.mat-mdc-row` are rendered, decide
  //      based on them (rows beat any empty-state).
  //   2. Trust "There is no data" only after a stability window: it must be
  //      visible AND no rows present, observed across consecutive polls,
  //      after a minimum warm-up time has elapsed.
  //   3. If neither signal stabilizes in time, throw rather than guess.
  async function detectExistingTest(key, timeout = 15000) {
    const target = normalize(key);
    const startedAt = Date.now();
    const deadline = startedAt + timeout;
    const minWarmupMs = 3000;       // don't trust empty-state before this
    const stableSamplesNeeded = 4;  // ~800ms of consecutive empty-state
    let stableEmptySamples = 0;

    while (Date.now() < deadline) {
      const rows = document.querySelectorAll("tr.mat-mdc-row, tr[mat-row]");

      if (rows.length > 0) {
        for (const row of rows) {
          const slugCell = row.querySelector(".cdk-column-slug");
          const cellText = normalize(slugCell?.textContent || "");
          if (cellText && (cellText === target || cellText.includes(target))) {
            return { found: true, row };
          }
        }
        // Rows rendered but none matched on the slug column — search filter
        // narrows results, so this genuinely means our key isn't there.
        return { found: false, row: null };
      }

      const noData = (document.body?.innerText || "").includes("There is no data");
      const warm = Date.now() - startedAt >= minWarmupMs;

      if (noData && warm) {
        stableEmptySamples++;
        if (stableEmptySamples >= stableSamplesNeeded) {
          return { found: false, row: null };
        }
      } else {
        stableEmptySamples = 0;
      }

      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Timeout: tabela nu s-a stabilizat (nici rânduri, nici "There is no data" stabil)');
  }

  function normalize(s) {
    return String(s).replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Find a form control inside a mat-form-field whose label text matches.
  // Works for inputs, textareas, and mat-selects. Polls because the form
  // often renders progressively after a route or modal opens.
  async function findFieldByLabel(labelText, timeout = 6000) {
    const target = normalize(labelText);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const fields = document.querySelectorAll(
        "mat-form-field, .mat-mdc-form-field, .mat-form-field"
      );
      for (const ff of fields) {
        const labels = ff.querySelectorAll(
          "mat-label, label, .mat-mdc-form-field-label, .mat-form-field-label"
        );
        for (const lab of labels) {
          if (normalize(lab.textContent).includes(target)) {
            const ctrl = ff.querySelector("input, textarea, mat-select, .mat-mdc-select");
            if (ctrl) return ctrl;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Câmpul cu eticheta "${labelText}" nu a fost găsit`);
  }

  // Find a mat-select via its placeholder text (the gray "Alege ..." span shown
  // when nothing is selected). Useful when the form-field has no plain label.
  async function findMatSelectByPlaceholder(placeholderText, timeout = 5000) {
    const target = normalize(placeholderText);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const placeholders = document.querySelectorAll(
        ".mat-mdc-select-placeholder, .mat-select-placeholder"
      );
      for (const p of placeholders) {
        if (normalize(p.textContent).includes(target)) {
          const sel = p.closest("mat-select, .mat-mdc-select");
          if (sel) return sel;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Mat-select cu placeholder "${placeholderText}" nu a fost găsit`);
  }

  // Find the edit icon (i.fa-sliders.edit-icon) belonging to the row that
  // contains `rowText`. We anchor on edit icons and walk up at most 5 levels
  // looking for an ancestor whose text includes the target — this maps the
  // icon to its row without needing to know the exact row markup.
  async function findEditIconForRow(rowText, timeout = 6000) {
    const target = normalize(rowText);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const icons = document.querySelectorAll("i.fa-sliders.edit-icon");
      for (const icon of icons) {
        let el = icon.parentElement;
        for (let i = 0; i < 5 && el; i++) {
          if (normalize(el.textContent || "").includes(target)) return icon;
          el = el.parentElement;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Iconul de editare pentru "${rowText}" nu a fost găsit`);
  }

  const MENU_ITEM_SELECTORS = [
    'button[mat-menu-item]',
    '.mat-mdc-menu-item',
    '[role="menuitem"]',
    'mat-menu-item',
    '.mat-menu-item',
    '.mdc-list-item',
    '.mat-mdc-menu-panel button',
    '.mat-mdc-menu-content button',
    '.cdk-overlay-pane button',
  ].join(", ");

  async function findMenuItemByText(text, timeout = 4000) {
    const target = normalize(text);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const items = document.querySelectorAll(MENU_ITEM_SELECTORS);
      for (const item of items) {
        const t = normalize(item.innerText || item.textContent || "");
        if (t === target || t.includes(target)) return item;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

  async function findInputByName(name, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const input = document.querySelector(
        `input[name="${name}"], textarea[name="${name}"]`
      );
      if (input) return input;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Input cu name="${name}" nu a fost găsit`);
  }

  // Open a mat-select, then click the option whose text matches.
  async function selectMatOption(matSelect, optionText, timeout = 5000) {
    const trigger = matSelect.querySelector(".mat-mdc-select-trigger, .mat-select-trigger") || matSelect;
    trigger.click();

    const target = normalize(optionText);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const options = document.querySelectorAll("mat-option, .mat-mdc-option, .mat-option");
      for (const opt of options) {
        if (normalize(opt.textContent).includes(target)) {
          opt.click();
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Opțiunea "${optionText}" nu există în dropdown`);
  }

  // Scan clickable elements for one whose visible text matches `label`
  // (case-insensitive, whitespace-collapsed). Polls until timeout because
  // these buttons often render after data loads.
  async function findButtonByText(label, timeout = 5000) {
    const target = normalize(label);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const candidates = document.querySelectorAll(
        'button, a, [role="button"], .btn, input[type="button"], input[type="submit"]'
      );
      for (const el of candidates) {
        if (el.disabled) continue;
        const t = normalize(el.innerText || el.textContent || el.value || "");
        if (t === target || t.includes(target)) return el;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  const STEPS = {
    // Step 1: search the archived list for a test matching state.name.
    // Stash the result on state so step 2 can branch on it.
    lookup_existing: {
      match: (url) =>
        url.includes("/admin/medical/data/intakes") &&
        url.includes("search="),
      run: async (state) => {
        showBanner(`⏳ Aștept 1.5s să se încarce pagina...`, "info");
        await new Promise((r) => setTimeout(r, 1500));
        showBanner(`🔍 Caut cheia "${state.key}"...`, "info");
        const { found, row } = await detectExistingTest(state.key);
        state.found = found;
        if (found) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          row.style.outline = "3px solid #f0a500";
          row.style.outlineOffset = "2px";
          showBanner(`✅ Găsit: "${state.name}" (${state.key}). Alege o acțiune.`, "success");
          showFloatingButtons([
            {
              label: "➕ Adaugă oricum",
              kind: "warning",
              onClick: async () => {
                state.step = "click_add_global_intake";
                await writeState(state);
                await handleTeammTestSetup();
              },
            },
            {
              label: "⏭️ Sari peste acest pas",
              kind: "info",
              onClick: async () => {
                state.step = "lookup_measurement";
                await writeState(state);
                window.location.assign(buildMeasurementSearchUrl(state.name));
              },
            },
          ]);
          return "awaiting_user_continue";
        }
        showBanner(`ℹ️ Nu există. Apăs "Adaugă global intake"...`, "info");
        return "click_add_global_intake";
      },
    },

    // Step 2 (not-found branch): press the "Adaugă global intake" button to
    // open the creation form. The button lives on the same page as the search,
    // so the router runs this immediately after lookup_archived.
    click_add_global_intake: {
      match: (url) => url.includes("/admin/medical/data/intakes"),
      run: async (state) => {
        const btn = await findButtonByText("Adaugă global intake");
        if (!btn) throw new Error('Butonul "Adaugă global intake" nu a fost găsit');
        btn.click();
        showBanner(`➕ Apăsat "Adaugă global intake". Completez formularul...`, "info");
        return "fill_form";
      },
    },

    // Step 3: fill the new-intake form. Order: text fields first (no overlays),
    // then mat-select dropdowns. Does NOT submit — flow halts after fill.
    fill_form: {
      match: (url) => url.includes("/admin/medical/"),
      run: async (state) => {
        // Brief wait for the form to render after the click / route change.
        await new Promise((r) => setTimeout(r, 600));

        const titleField = await findFieldByLabel("Titlu");
        setNativeInputValue(titleField, state.name);

        const keyField = await findFieldByLabel("Cheie");
        setNativeInputValue(keyField, state.key);

        const tagsField = await findFieldByLabel("Taguri");
        await selectMatOption(tagsField, "Analize");

        if (state.unit) {
          const unitField = await findFieldByLabel("Unitatea de măsură");
          await selectMatOption(unitField, state.unit);
        }

        showBanner(`✅ Formular completat pentru "${state.name}". Apasă "Continuă & salvează".`, "success");

        showFloatingButton("✓ Continuă & salvează", async () => {
          state.step = "click_save";
          await writeState(state);
          await handleTeammTestSetup();
        }, "primary");

        return "awaiting_user_continue";
      },
    },

    // Step 4: triggered by the "Continuă & salvează" button. Click "Salvează",
    // wait 3s for the save to complete, then navigate to the measurements list
    // to search by name.
    click_save: {
      match: (url) => url.includes("/admin/medical/"),
      run: async (state) => {
        const btn = await findButtonByText("Salvează");
        if (!btn) throw new Error('Butonul "Salvează" nu a fost găsit');
        btn.click();
        showBanner(`💾 Se salvează "${state.name}"... aștept 3s.`, "info");
        await new Promise((r) => setTimeout(r, 3000));
        showBanner(`✅ Salvat. Continui către măsurători...`, "success");

        state.step = "lookup_measurement";
        await writeState(state);
        window.location.assign(buildMeasurementSearchUrl(state.name));
        return "lookup_measurement";
      },
    },

    // Step 5: on the measurements list, search by name. Expected case is
    // "There is no data" → click "+ Adaugă măsurătoare". If something matches
    // unexpectedly, offer an "Adaugă oricum" override.
    lookup_measurement: {
      match: (url) =>
        url.includes("/admin/medical/intakes") &&
        !url.includes("/admin/medical/data/intakes") &&
        url.includes("usedIn=table") &&
        url.includes("search="),
      run: async (state) => {
        showBanner(`⏳ Aștept 1.5s să se încarce lista de măsurători...`, "info");
        await new Promise((r) => setTimeout(r, 1500));

        // The empty-state row is itself a tr.mat-mdc-row containing "There is
        // no data", so rows.length > 0 doesn't mean data exists. Trust the
        // text after the 1.5s settle window.
        const noData = (document.body?.innerText || "").includes("There is no data");

        if (noData) {
          showBanner(`ℹ️ Nu există măsurătoare pentru "${state.name}". Apăs "Adaugă măsurătoare"...`, "info");
          return "click_add_measurement";
        }

        showBanner(`⚠️ Există deja măsurătoare pentru "${state.name}". Alege o acțiune.`, "info");
        showFloatingButtons([
          {
            label: "➕ Adaugă oricum",
            kind: "warning",
            onClick: async () => {
              state.step = "click_add_measurement";
              await writeState(state);
              await handleTeammTestSetup();
            },
          },
          {
            label: "⏭️ Sari peste acest pas",
            kind: "info",
            onClick: async () => {
              state.step = "click_analize_supl_edit";
              await writeState(state);
              window.location.assign(FORM_TEMPLATE_URL);
            },
          },
        ]);
        return "awaiting_user_continue";
      },
    },

    // Step 6: click the "+ Adaugă măsurătoare" button on the measurements list.
    // This opens a modal containing a search bar.
    click_add_measurement: {
      match: (url) =>
        url.includes("/admin/medical/intakes") &&
        !url.includes("/admin/medical/data/intakes"),
      run: async (state) => {
        const btn = await findButtonByText("Adaugă măsurătoare");
        if (!btn) throw new Error('Butonul "Adaugă măsurătoare" nu a fost găsit');
        btn.click();
        showBanner(`➕ Apăsat "Adaugă măsurătoare". Caut tipul în modal...`, "info");
        return "search_measurement_type";
      },
    },

    // Step 7: in the modal that just opened, type the test name into the
    // search bar and click the matching result card's title (h5.navigate).
    // 0 results → abort. 1 → auto-click. >1 → hand off to user (3s grace).
    search_measurement_type: {
      match: (url) =>
        url.includes("/admin/medical/intakes") &&
        !url.includes("/admin/medical/data/intakes"),
      run: async (state) => {
        showBanner(`⏳ Aștept 2s să se deschidă modalul...`, "info");
        await new Promise((r) => setTimeout(r, 2000));

        showBanner(`🔍 Caut "${state.name}" în modal...`, "info");

        const searchInputs = Array.from(document.querySelectorAll(
          'app-search-bar input[type="text"], input[placeholder="Caută..."]'
        ));
        if (searchInputs.length === 0) {
          throw new Error("Bara de căutare din modal nu a fost găsită");
        }
        // Page-level search already holds state.name (from the URL). The modal's
        // search starts empty, so prefer that one; fall back to the last input.
        const searchInput =
          searchInputs.find((i) => normalize(i.value) !== normalize(state.name)) ||
          searchInputs[searchInputs.length - 1];

        searchInput.focus();
        setNativeInputValue(searchInput, state.name);

        // Let search debounce + filter
        await new Promise((r) => setTimeout(r, 1500));

        const titles = Array.from(document.querySelectorAll(
          'mat-card h5.navigate[test-id^="data_item_"]'
        ));

        if (titles.length === 0) {
          showBanner(`❌ Nu pot continua: nu există tipul "${state.name}".`, "error");
          throw new Error(`Niciun tip de măsurătoare cu numele "${state.name}"`);
        }

        if (titles.length === 1) {
          titles[0].click();
          showBanner(`✅ Am ales "${state.name}". Continui cu formularul...`, "success");
          return "fill_measurement_form";
        }

        showBanner(`🤔 ${titles.length} rezultate pentru "${state.name}". Alege tu — continui automat în 3s.`, "info");
        await new Promise((r) => setTimeout(r, 3000));
        return "fill_measurement_form";
      },
    },

    // Step 8: fill the measurement form.
    //   1) wait 1s for it to render
    //   2) Category dropdown → "Analize Suplimentare"
    //   3) click "Normal ranges" tab
    //   4) Min ← state.min, Max ← state.max
    //   5) click Salvează (test-id="submit")
    fill_measurement_form: {
      match: (url) =>
        url.includes("/admin/medical/intakes") &&
        !url.includes("/admin/medical/data/intakes"),
      run: async (state) => {
        showBanner(`⏳ Aștept 1s să se încarce formularul...`, "info");
        await new Promise((r) => setTimeout(r, 1000));

        showBanner(`📋 Selectez categoria "Analize Suplimentare"...`, "info");
        const categorySelect = await findMatSelectByPlaceholder("Alege categoria");
        await selectMatOption(categorySelect, "Analize Suplimentare");

        showBanner(`📑 Comut la tab-ul "Normal ranges"...`, "info");
        const tab = await findButtonByText("Normal ranges");
        if (!tab) throw new Error('Tab-ul "Normal ranges" nu a fost găsit');
        tab.click();

        showBanner(`✏️ Completez Min/Max...`, "info");
        const minInput = await findInputByName("Min");
        setNativeInputValue(minInput, state.min || "");
        const maxInput = await findInputByName("Max");
        setNativeInputValue(maxInput, state.max || "");

        showBanner(`💾 Apas Salvează...`, "info");
        const submitBtn =
          document.querySelector('button[test-id="submit"]') ||
          (await findButtonByText("Salvează"));
        if (!submitBtn) throw new Error('Butonul "Salvează" nu a fost găsit');
        submitBtn.click();

        showBanner(`💾 Salvat. Aștept 3s și continui către template-ul de formular...`, "info");
        await new Promise((r) => setTimeout(r, 3000));
        state.step = "click_analize_supl_edit";
        await writeState(state);
        window.location.assign(FORM_TEMPLATE_URL);
        return "click_analize_supl_edit";
      },
    },

    // Step 9: on the form-template setup page, find the row labeled
    // "Analize suplimentare" and click its edit icon. The icon is a
    // mat-mdc-menu-trigger, but the panel it opens is NOT a menu of options —
    // it's the field-edit form itself (an <app-field-edit> component) embedded
    // inside the menu panel. So one click is all we need.
    click_analize_supl_edit: {
      match: (url) => url.includes("/admin/general-config/form-templates/guestOrUser/setup/"),
      run: async (state) => {
        console.log(`[teamm-setup] click_analize_supl_edit on ${window.location.href}`);
        showBanner(`⏳ Aștept 1s să se încarce template-ul...`, "info");
        await new Promise((r) => setTimeout(r, 1000));

        showBanner(`✏️ Caut "Analize suplimentare"...`, "info");
        const icon = await findEditIconForRow("Analize suplimentare");
        console.log("[teamm-setup] edit icon găsit:", icon);

        icon.scrollIntoView({ behavior: "smooth", block: "center" });
        icon.style.outline = "3px solid #f0a500";
        await new Promise((r) => setTimeout(r, 400));

        console.log("[teamm-setup] before click, aria-expanded:", icon.getAttribute("aria-expanded"));
        icon.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

        showBanner(`📂 Aștept formularul de editare...`, "info");
        await new Promise((r) => setTimeout(r, 800));
        console.log("[teamm-setup] after click, aria-expanded:", icon.getAttribute("aria-expanded"));

        // Verify the panel opened by looking for app-field-edit (the form
        // component that gets embedded inside the menu panel).
        const formPanel = document.querySelector(
          ".cdk-overlay-pane app-field-edit, .mat-mdc-menu-panel app-field-edit"
        );
        if (!formPanel) {
          throw new Error("Formularul de editare câmp nu s-a deschis (app-field-edit nu a fost găsit)");
        }
        console.log("[teamm-setup] app-field-edit găsit:", formPanel);

        showBanner(`✅ Formular de editare deschis pentru "Analize suplimentare". Continui...`, "success");
        return "fill_template_analysis";
      },
    },

    // Step 10: in the field-edit form, find the multi-select dropdown labeled
    // "Analize care apar în șablonul docx", open it, search for state.name in
    // its built-in search, and click the option that matches exactly. Do not
    // press Save yet.
    fill_template_analysis: {
      match: (url) => url.includes("/admin/general-config/form-templates/guestOrUser/setup/"),
      run: async (state) => {
        showBanner(`⏳ Aștept 1s să se randeze formularul...`, "info");
        await new Promise((r) => setTimeout(r, 1000));

        showBanner(`📋 Deschid "Analizele care apar în sablonul docx"...`, "info");
        const select = await findFieldByLabel("care apar");
        console.log("[teamm-setup] template analysis select:", select);

        const trigger = select.querySelector(".mat-mdc-select-trigger") || select;
        trigger.click();
        await new Promise((r) => setTimeout(r, 600));

        showBanner(`🔍 Filtrez după "${state.name}"...`, "info");
        const searchInput = await waitForElement(
          'input.mat-select-search-input:not(.mat-select-search-hidden), input[placeholder="Search..."]',
          { timeout: 4000 }
        );
        searchInput.focus();
        setNativeInputValue(searchInput, state.name);
        await new Promise((r) => setTimeout(r, 600));

        // Exact match — search hides non-matches but doesn't remove them,
        // and substring would catch "Test" inside "Test2"/"Test5".
        const target = normalize(state.name);
        let matchedOption = null;
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
          const options = document.querySelectorAll("mat-option, .mat-mdc-option");
          for (const opt of options) {
            const labelDiv = opt.querySelector(".d-flex.flex-column");
            const t = normalize(labelDiv?.textContent || opt.textContent);
            if (t === target) {
              matchedOption = opt;
              break;
            }
          }
          if (matchedOption) break;
          await new Promise((r) => setTimeout(r, 200));
        }

        if (!matchedOption) {
          throw new Error(`Opțiunea exactă "${state.name}" nu a fost găsită în dropdown`);
        }
        console.log("[teamm-setup] matched option:", matchedOption);

        // Click only if NOT already selected — clicking a checked option in a
        // multi-select toggles it OFF.
        const alreadySelected = matchedOption.getAttribute("aria-selected") === "true";
        if (alreadySelected) {
          console.log(`[teamm-setup] "${state.name}" e deja bifat, nu apăs`);
          showBanner(`✅ "${state.name}" era deja bifat. Continui cu Salvează...`, "success");
        } else {
          matchedOption.click();
          showBanner(`✅ Bifat "${state.name}". Continui cu Salvează...`, "success");
        }

        // Close the still-open multi-select panel.
        await new Promise((r) => setTimeout(r, 300));
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        return "click_template_save";
      },
    },

    // Step 11: click "Salvează" on the form-template page to commit the
    // analysis-into-template bifurcation, then trigger the verification import.
    click_template_save: {
      match: (url) => url.includes("/admin/general-config/form-templates/guestOrUser/setup/"),
      run: async (state) => {
        await new Promise((r) => setTimeout(r, 500));
        showBanner(`💾 Apas Salvează (template)...`, "info");
        const btn = await findButtonByText("Salvează");
        if (!btn) throw new Error('Butonul "Salvează" nu a fost găsit pe pagina form-templates');
        btn.click();
        await new Promise((r) => setTimeout(r, 3000));
        return "import_verification";
      },
    },

    // Step 12 (final): build a CSV import row for the new test using the
    // existing teamm-uploader handoff (StorageAdapter pendingUpload) and
    // open the upload tab. User submits + verifies manually.
    import_verification: {
      match: (url) => url.includes("/admin/general-config/form-templates/"),
      run: async (state) => {
        showBanner(`📤 Pregătesc import-ul de verificare pentru "${state.name}"...`, "info");

        const requestId = "TESTANALIZANOUA";
        const procDate = formatProcDate(new Date());
        const stringValue = randomTestValue(state);

        const csv = [
          "RequestID,ProcDate,AnCode,StringValue",
          [requestId, procDate, state.key, stringValue].join(","),
        ].join("\n");

        const filename = buildImportFilename(requestId);

        console.log("[teamm-setup] import CSV:\n" + csv);
        console.log("[teamm-setup] filename:", filename);

        await window.StorageAdapter.set({
          pendingUpload: {
            content: csv,
            filename,
            timestamp: Date.now(),
            expiresAt: Date.now() + 5 * 60 * 1000,
            autoSubmit: true,
          },
        });

        showBanner(`✅ Navighez către pagina de import. Apasă submit acolo, apoi verifică manual.`, "success");
        await new Promise((r) => setTimeout(r, 5000));
        // Navigate the current tab — window.open would be blocked here because
        // the user-gesture context expired across the await chain since the
        // last button click (multiple page navigations + timers).
        window.location.assign("https://teamm.work/admin/guests/intake-values-import-dumbrava");
        return null; // flow done — state cleared by router
      },
    },

    // Sentinel: flow paused while the floating Continue button waits for the
    // user. Never matches, so nothing auto-runs on subsequent navigations.
    awaiting_user_continue: {
      match: () => false,
      run: async () => null,
    },

    // Generic pause sentinel for branches we haven't wired yet.
    awaiting_next_step: {
      match: () => false,
      run: async () => null,
    },
  };

  // ----------------------------------------------------------------
  // Router — entry point on every teamm.work admin page
  // ----------------------------------------------------------------

  async function handleTeammTestSetup() {
    const state = await readState();
    if (!state) return;

    const url = window.location.href;
    let safety = 10;

    while (safety-- > 0) {
      const step = STEPS[state.step];
      if (!step) {
        console.warn(`[teamm-setup] unknown step: ${state.step}, clearing`);
        await clearState();
        return;
      }
      if (!step.match(url)) {
        console.log(`[teamm-setup] step "${state.step}" doesn't match this URL`);
        return;
      }

      console.log(`[teamm-setup] running "${state.step}" for ${state.name}`);
      let next;
      try {
        next = await step.run(state);
      } catch (err) {
        console.error(`[teamm-setup] step "${state.step}" failed:`, err);
        await recordError(state, state.step, err);
        showBanner(`❌ Setup teamm eșuat la "${state.step}": ${err.message}`, "error");
        return;
      }

      if (next == null) {
        await clearState();
        showBanner(`✅ Setup teamm complet: ${state.name}`, "success");
        return;
      }

      state.step = next;
      await writeState(state);
      // Continue: if the new step matches this URL too, run it; otherwise the
      // next navigation will pick it up.
    }
    console.warn("[teamm-setup] safety bail — too many transitions on one page");
  }

  async function cancelTeammTestSetup() {
    await clearState();
    showBanner("Setup teamm anulat", "info");
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  window.handleTeammTestSetup = handleTeammTestSetup;
  window.cancelTeammTestSetup = cancelTeammTestSetup;
  window.TeammTestSetup = {
    readState, clearState, waitForElement, setNativeInputValue, showBanner,
  };
})();
