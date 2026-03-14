(function () {
  "use strict";

  const PI = Math.PI;
  const FLIP_DELAY_MS = 50;
  const STORAGE_KEY = "pi-coins-runs";
  /** Full decimal places for intro estimate (DOM gets full string; CSS clips with ellipsis) */
  const INTRO_ESTIMATE_DECIMALS = 15;

  // #region RNG
  function randomBit() {
    var buf = new Uint8Array(1);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(buf);
      return buf[0] & 1;
    }
    return Math.random() < 0.5 ? 0 : 1;
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }
  // #endregion

  // #region One run: flip until H > T
  function runOneTrial(turbo) {
    var sequence = [];
    var heads = 0;
    var tails = 0;
    while (heads <= tails) {
      var isHead = randomBit() === 1;
      sequence.push(isHead ? "H" : "T");
      if (isHead) heads++;
      else tails++;
    }
    var tau = sequence.length;
    var fraction = heads / tau;
    var piEst = 4 * fraction;
    var pctErr = (Math.abs(piEst - PI) / PI) * 100;
    return {
      sequence: sequence,
      tau: tau,
      fraction: fraction,
      piEst: piEst,
      pctErr: pctErr,
    };
  }
  // #endregion

  // #region State and DOM
  var runs = [];
  var isFlipping = false;
  var isSimulating = false;
  var rushCurrentRun = false;
  var finishCurrentThenStartNext = false;

  var flipBtn = document.getElementById("flip-btn");
  var simulate100Btn = document.getElementById("simulate-100-btn");
  var simulate1000Btn = document.getElementById("simulate-1000-btn");
  var convergeStatus = document.getElementById("converge-status");
  var currentRunEl = document.getElementById("current-run");
  var runsList = document.getElementById("runs-list");
  var pastRunsSummaryEl = document.getElementById("past-runs-summary");
  var introEstimateEl = document.getElementById("intro-estimate");
  var turboCheck = document.getElementById("turbo");
  var resetBtn = document.getElementById("reset-btn");
  var backToTopEl = document.getElementById("back-to-top");

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  var convergenceChart = null;
  var convergenceChartMaximized = null;
  var tauChart = null;
  var chartOverlay = document.getElementById("chart-overlay");
  var chartMaximizeBtn = document.getElementById("chart-maximize-btn");
  var chartOverlayClose = document.getElementById("chart-overlay-close");
  // #endregion

  // #region Persist
  function loadRuns() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) runs = parsed;
      }
    } catch (_) {}
  }

  function saveRuns() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
    } catch (_) {}
  }
  // #endregion

  // #region Flip coins (with optional delay between flips)
  function runWithDelay(turbo, onFlip) {
    return new Promise(function (resolve) {
      var sequence = [];
      var heads = 0;
      var tails = 0;

      function step() {
        if (heads > tails) {
          var tau = sequence.length;
          var fraction = heads / tau;
          var piEst = 4 * fraction;
          var pctErr = (Math.abs(piEst - PI) / PI) * 100;
          resolve({
            sequence: sequence,
            tau: tau,
            fraction: fraction,
            piEst: piEst,
            pctErr: pctErr,
          });
          return;
        }
        var isHead = randomBit() === 1;
        sequence.push(isHead ? "H" : "T");
        if (isHead) heads++;
        else tails++;
        if (onFlip) onFlip(sequence.slice(), heads, tails);
        if (turbo) {
          step();
        } else if (rushCurrentRun) {
          while (heads <= tails) {
            var isHeadRush = randomBit() === 1;
            sequence.push(isHeadRush ? "H" : "T");
            if (isHeadRush) heads++;
            else tails++;
            if (onFlip) onFlip(sequence.slice(), heads, tails);
          }
          var tauRush = sequence.length;
          var fractionRush = heads / tauRush;
          var piEstRush = 4 * fractionRush;
          var pctErrRush = (Math.abs(piEstRush - PI) / PI) * 100;
          rushCurrentRun = false;
          resolve({
            sequence: sequence,
            tau: tauRush,
            fraction: fractionRush,
            piEst: piEstRush,
            pctErr: pctErrRush,
          });
        } else {
          delay(FLIP_DELAY_MS).then(step);
        }
      }
      step();
    });
  }
  // #endregion

  // #region Render
  function renderCurrentRun(sequence, heads, tails) {
    var tau = sequence.length;
    currentRunEl.innerHTML =
      '<span class="sequence">' + escapeHtml(sequence.join(" ")) + "</span>" +
      '<span class="tau">' + tau + " flips</span>";
  }

  function renderLastRun(r) {
    if (!r) {
      currentRunEl.textContent = "";
      return;
    }
    currentRunEl.innerHTML =
      '<span class="sequence">' + escapeHtml(r.sequence.join(" ")) + "</span>" +
      '<span class="tau">' + r.tau + " flips</span>";
  }

  function renderRunRow(r) {
    var div = document.createElement("div");
    div.className = "run-row";
    div.innerHTML =
      '<span class="sequence">' +
      escapeHtml(r.sequence.join(" ")) +
      "</span>" +
      '<span class="tau">' +
      r.tau +
      " flips</span>";
    return div;
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function renderRuns() {
    var pastCount = runs.length > 0 ? runs.length - 1 : 0;
    if (pastRunsSummaryEl) {
      pastRunsSummaryEl.textContent = "Past runs (" + pastCount + ")";
    }
    runsList.innerHTML = "";
    if (pastCount === 0) {
      var empty = document.createElement("p");
      empty.className = "runs-empty";
      empty.textContent = "No past runs yet. Click \"Flip coins\" or \"Simulate 100 runs\" to start.";
      runsList.appendChild(empty);
    } else {
      runs.slice(1).forEach(function (r) {
        runsList.appendChild(renderRunRow(r));
      });
    }
    if (runs.length >= 2) {
      var avg = runs.reduce(function (sum, r) {
        return sum + r.fraction;
      }, 0) / runs.length;
      var piAvg = 4 * avg;
      var fullStr = piAvg.toFixed(INTRO_ESTIMATE_DECIMALS);
      if (introEstimateEl) {
        introEstimateEl.textContent = fullStr;
        introEstimateEl.title = fullStr;
      }
    } else if (runs.length === 1) {
      var s1 = (4 * runs[0].fraction).toFixed(INTRO_ESTIMATE_DECIMALS);
      if (introEstimateEl) {
        introEstimateEl.textContent = s1;
        introEstimateEl.title = s1;
      }
    } else {
      var defaultStr = (4).toFixed(INTRO_ESTIMATE_DECIMALS);
      if (introEstimateEl) {
        introEstimateEl.textContent = defaultStr;
        introEstimateEl.title = defaultStr;
      }
    }
    updateConvergenceChart();
  }

  function showResult(r) {
    runs.unshift(r);
    saveRuns();
    renderLastRun(r);
    renderRuns();
  }
  // #endregion

  // #region Flip button and Attempt Convergence
  function getTurbo() {
    if (!turboCheck) return false;
    if (typeof turboCheck.checked === "boolean") return turboCheck.checked;
    return turboCheck.getAttribute("aria-checked") === "true";
  }

  function doOneFlip() {
    if (isSimulating) return;
    if (isFlipping) {
      finishCurrentThenStartNext = true;
      rushCurrentRun = true;
      return;
    }
    isFlipping = true;
    if (simulate100Btn) simulate100Btn.disabled = true;
    if (simulate1000Btn) simulate1000Btn.disabled = true;
    runWithDelay(getTurbo(), renderCurrentRun).then(function (r) {
      showResult(r);
      isFlipping = false;
      if (simulate100Btn) simulate100Btn.disabled = false;
      if (simulate1000Btn) simulate1000Btn.disabled = false;
      if (finishCurrentThenStartNext) {
        finishCurrentThenStartNext = false;
        doOneFlip();
      }
    });
  }

  function runBatch(n) {
    if (isFlipping || isSimulating) return;
    isSimulating = true;
    flipBtn.disabled = true;
    if (simulate100Btn) simulate100Btn.disabled = true;
    if (simulate1000Btn) simulate1000Btn.disabled = true;
    if (convergeStatus) {
      convergeStatus.hidden = false;
      convergeStatus.textContent = "Running " + n + " trials...";
    }
    for (var i = 0; i < n; i++) {
      var r = runOneTrial(true);
      runs.unshift(r);
    }
    saveRuns();
    renderLastRun(runs[0] || null);
    renderRuns();
    if (convergeStatus) {
      var est = runs.length > 0
        ? (4 * runs.reduce(function (s, x) { return s + x.fraction; }, 0) / runs.length).toFixed(4)
        : "—";
      convergeStatus.textContent = "After " + n + " runs, your estimate: " + est;
    }
    isSimulating = false;
    flipBtn.disabled = false;
    if (simulate100Btn) simulate100Btn.disabled = false;
    if (simulate1000Btn) simulate1000Btn.disabled = false;
  }

  // #endregion

  // #region Tau distribution chart (Catalan) – Chart.js
  function binom(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    var r = 1;
    for (var i = 0; i < k; i++) {
      r = r * (n - i) / (i + 1);
    }
    return r;
  }

  function tauProb(k) {
    return (1 / (2 * Math.pow(4, k))) * (1 / (k + 1)) * binom(2 * k, k);
  }

  function renderTauChart() {
    var canvas = document.getElementById("tau-chart");
    if (!canvas || typeof Chart === "undefined" || tauChart) return;
    var maxK = 15;
    var labels = [];
    var data = [];
    for (var k = 0; k <= maxK; k++) {
      labels.push(2 * k + 1);
      data.push(tauProb(k));
    }
    var accent = getCssVar("--accent") || "#0d5a4c";
    var text = getCssVar("--text") || "#1c1c1c";
    var textMuted = getCssVar("--text-muted") || "#5c5c5c";
    var grid = getCssVar("--border") || "#e2e0dc";
    tauChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "P(stop at \u03c4)",
          data: data,
          backgroundColor: accent,
          borderColor: accent,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return "P(\u03c4 = " + ctx.label + ") = " + ctx.raw.toFixed(4);
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Stopping time \u03c4 (number of flips)", color: textMuted, font: { size: 11 } },
            ticks: { color: textMuted, maxRotation: 0 },
            grid: { color: grid },
          },
          y: {
            min: 0,
            max: 0.5,
            title: { display: true, text: "Probability", color: textMuted, font: { size: 11 } },
            ticks: { color: textMuted, stepSize: 0.125 },
            grid: { color: grid },
          },
        },
      },
    });
  }
  // #endregion

  // #region Convergence chart – Chart.js
  function getConvergenceChartConfig() {
    var n = runs.length;
    var accent = getCssVar("--accent") || "#0d5a4c";
    var danger = getCssVar("--danger") || "#b91c1c";
    var textMuted = getCssVar("--text-muted") || "#5c5c5c";
    var grid = getCssVar("--border") || "#e2e0dc";
    var estimateData = [];
    var sum = 0;
    for (var i = 0; i < n; i++) {
      sum += runs[i].fraction;
      estimateData.push({ x: i + 1, y: 4 * sum / (i + 1) });
    }
    var runMax = n >= 1 ? n : 1;
    var piLineData = [{ x: 1, y: PI }, { x: runMax, y: PI }];
    return {
      data: {
        datasets: [
          {
            label: "Your estimate",
            data: estimateData,
            borderColor: accent,
            backgroundColor: accent,
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: n <= 100 ? 2 : 0,
            pointHoverRadius: 4,
          },
          {
            label: "\u03c0 \u2248 3.14",
            data: piLineData,
            borderColor: danger,
            backgroundColor: "transparent",
            borderWidth: 1.5,
            borderDash: [6, 4],
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { color: textMuted, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ": " + (typeof ctx.raw.y === "number" ? ctx.raw.y.toFixed(4) : ctx.raw);
              },
            },
          },
          subtitle: {
            display: n === 0,
            text: "Run some trials to see your estimate converge toward \u03c0.",
            color: textMuted,
            font: { size: 13 },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 1,
            max: runMax,
            title: { display: true, text: "Run number", color: textMuted, font: { size: 11 } },
            ticks: { color: textMuted, stepSize: 1 },
            grid: { color: grid },
          },
          y: {
            min: 2,
            max: 4,
            title: { display: true, text: "4 \u00d7 (avg fraction)", color: textMuted, font: { size: 11 } },
            ticks: { color: textMuted },
            grid: { color: grid },
          },
        },
      },
    };
  }

  function updateConvergenceChart() {
    var canvas = document.getElementById("convergence-chart");
    if (!canvas || typeof Chart === "undefined") return;

    var config = getConvergenceChartConfig();
    if (!convergenceChart) {
      convergenceChart = new Chart(canvas, {
        type: "line",
        data: config.data,
        options: config.options,
      });
    } else {
      convergenceChart.data.datasets[0].data = config.data.datasets[0].data;
      convergenceChart.data.datasets[1].data = config.data.datasets[1].data;
      convergenceChart.data.datasets[0].pointRadius = config.data.datasets[0].pointRadius;
      var sub = convergenceChart.options.plugins.subtitle;
      if (sub) {
        sub.display = config.options.plugins.subtitle.display;
        sub.text = config.options.plugins.subtitle.text;
      }
      if (convergenceChart.options.scales && convergenceChart.options.scales.x) {
        convergenceChart.options.scales.x.max = config.options.scales.x.max;
      }
      convergenceChart.update("none");
    }
  }

  function openChartOverlay() {
    var canvas = document.getElementById("convergence-chart-maximized");
    if (!canvas || typeof Chart === "undefined" || !chartOverlay) return;
    if (convergenceChartMaximized) {
      convergenceChartMaximized.destroy();
      convergenceChartMaximized = null;
    }
    var config = getConvergenceChartConfig();
    convergenceChartMaximized = new Chart(canvas, {
      type: "line",
      data: config.data,
      options: config.options,
    });
    chartOverlay.hidden = false;
    chartOverlayClose.focus();
  }

  function closeChartOverlay() {
    if (convergenceChartMaximized) {
      convergenceChartMaximized.destroy();
      convergenceChartMaximized = null;
    }
    if (chartOverlay) chartOverlay.hidden = true;
  }

  function initChartOverlay() {
    if (chartMaximizeBtn) {
      chartMaximizeBtn.addEventListener("click", openChartOverlay);
    }
    if (chartOverlayClose) {
      chartOverlayClose.addEventListener("click", closeChartOverlay);
    }
    if (chartOverlay) {
      var backdrop = chartOverlay.querySelector(".chart-overlay-backdrop");
      if (backdrop) backdrop.addEventListener("click", closeChartOverlay);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && chartOverlay && !chartOverlay.hidden) {
        closeChartOverlay();
      }
    });
  }
  // #endregion

  // #region Reset
  function reset() {
    runs = [];
    saveRuns();
    renderLastRun(null);
    convergeStatus.hidden = true;
    renderRuns();
    updateConvergenceChart();
  }
  // #endregion

  // #region KaTeX
  function renderMath() {
    if (typeof renderMathInElement === "undefined") return;
    var blocks = document.querySelectorAll(".katex-block[data-expr]");
    blocks.forEach(function (el) {
      var expr = el.getAttribute("data-expr");
      if (!expr) return;
      try {
        var span = document.createElement("span");
        if (typeof katex !== "undefined") {
          katex.render(expr, span, { throwOnError: false, displayMode: false });
          el.parentNode.replaceChild(span, el);
        }
      } catch (_) {}
    });
  }
  // #endregion

  // #region Init
  function init() {
    loadRuns();
    renderRuns();
    renderLastRun(runs[0] || null);
    renderTauChart();

    if (flipBtn) flipBtn.addEventListener("click", doOneFlip);
    if (simulate100Btn) simulate100Btn.addEventListener("click", function () { runBatch(100); });
    if (simulate1000Btn) simulate1000Btn.addEventListener("click", function () { runBatch(1000); });
    if (resetBtn) resetBtn.addEventListener("click", reset);
    initChartOverlay();

    var scrollThreshold = 280;
    function updateBackToTop() {
      if (backToTopEl) backToTopEl.hidden = window.scrollY <= scrollThreshold;
    }
    window.addEventListener("scroll", updateBackToTop, { passive: true });
    updateBackToTop();
    if (backToTopEl) {
      backToTopEl.addEventListener("click", function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        renderMath();
        updateConvergenceChart();
      });
    } else {
      renderMath();
      updateConvergenceChart();
    }

    window.addEventListener("resize", function () {
      updateConvergenceChart();
    });
  }
  init();
  // #endregion
})();
