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
  var convergeAbort = false;

  var flipBtn = document.getElementById("flip-btn");
  var convergeBtn = document.getElementById("converge-btn");
  var abortBtn = document.getElementById("abort-btn");
  var convergeStatus = document.getElementById("converge-status");
  var currentRunEl = document.getElementById("current-run");
  var runsList = document.getElementById("runs-list");
  var pastRunsSummaryEl = document.getElementById("past-runs-summary");
  var introEstimateEl = document.getElementById("intro-estimate");
  var turboCheck = document.getElementById("turbo");
  var resetBtn = document.getElementById("reset-btn");
  var backToTopEl = document.getElementById("back-to-top");
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
    currentRunEl.textContent = sequence.join(" ");
  }

  function renderLastRun(r) {
    if (!r) {
      currentRunEl.textContent = "";
      return;
    }
    currentRunEl.textContent = r.sequence.join(" ") + "  \u2022  " + r.tau + " flips";
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
    if (pastRunsSummaryEl) {
      pastRunsSummaryEl.textContent = "Past runs (" + runs.length + ")";
    }
    runsList.innerHTML = "";
    runs.forEach(function (r) {
      runsList.appendChild(renderRunRow(r));
    });
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
    if (isFlipping) return;
    isFlipping = true;
    flipBtn.disabled = true;
    convergeBtn.disabled = true;
    runWithDelay(getTurbo(), renderCurrentRun).then(function (r) {
      showResult(r);
      isFlipping = false;
      flipBtn.disabled = false;
      convergeBtn.disabled = false;
    });
  }

  function overallPiEstimate() {
    if (runs.length === 0) return NaN;
    var avg = runs.reduce(function (s, x) {
      return s + x.fraction;
    }, 0) / runs.length;
    return 4 * avg;
  }

  function hasConverged() {
    if (runs.length < 2) return false;
    var est = overallPiEstimate();
    if (Number.isNaN(est)) return false;
    var s = est.toFixed(3);
    return s === "3.14" || s.startsWith("3.14");
  }

  function attemptConvergence() {
    if (isFlipping) return;
    convergeAbort = false;
    convergeBtn.hidden = true;
    abortBtn.hidden = false;
    convergeStatus.hidden = false;
    flipBtn.disabled = true;

    function tick() {
      if (convergeAbort) {
        done();
        return;
      }
      if (hasConverged()) {
        convergeStatus.textContent =
          "Converged to 3.14 after " + runs.length + " runs.";
        done();
        return;
      }
      convergeStatus.textContent =
        "Runs: " +
        runs.length +
        ", current estimate: " +
        overallPiEstimate().toFixed(4) +
        " ...";
      runWithDelay(true, null).then(function (r) {
        showResult(r);
        setTimeout(tick, 0);
      });
    }
    tick();

    function done() {
      isFlipping = false;
      convergeBtn.hidden = false;
      abortBtn.hidden = true;
      flipBtn.disabled = false;
      if (!convergeAbort && hasConverged()) {
        convergeStatus.textContent =
          "Converged to 3.14 after " + runs.length + " runs.";
      } else {
        convergeStatus.textContent =
          "Stopped after " + runs.length + " runs. Estimate: " + overallPiEstimate().toFixed(4);
      }
    }
  }

  function abortConvergence() {
    convergeAbort = true;
  }
  // #endregion

  // #region Tau distribution chart (Catalan)
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
    var wrapper = document.getElementById("tau-chart");
    if (!wrapper) return;
    var maxK = 15;
    var probs = [];
    var maxP = 0;
    for (var k = 0; k <= maxK; k++) {
      var p = tauProb(k);
      probs.push({ k: k, tau: 2 * k + 1, p: p });
      if (p > maxP) maxP = p;
    }
    var yMax = 0.5;
    var barsHtml = probs
      .map(function (d) {
        var pct = yMax > 0 ? Math.min(100, (d.p / yMax) * 100) : 0;
        return (
          '<div class="tau-bar-wrap" title="Stopping at \u03c4 = ' + d.tau + " flips: P = " + d.p.toFixed(4) + '">' +
          '<div class="tau-bar" style="height: ' + pct + '%"></div>' +
          '<span class="tau-bar-label">' + d.tau + "</span>" +
          "</div>"
        );
      })
      .join("");
    var yAxisHtml =
      '<div class="tau-y-axis" role="img" aria-label="Y axis: probability 0 to 0.5">' +
      '<span class="tau-y-label">Probability</span>' +
      '<div class="tau-y-ticks">' +
      '<span class="tau-y-tick" style="bottom: 100%">0.5</span>' +
      '<span class="tau-y-tick" style="bottom: 75%">0.375</span>' +
      '<span class="tau-y-tick" style="bottom: 50%">0.25</span>' +
      '<span class="tau-y-tick" style="bottom: 25%">0.125</span>' +
      '<span class="tau-y-tick" style="bottom: 0">0</span>' +
      "</div>" +
      "</div>";
    wrapper.innerHTML =
      yAxisHtml +
      '<div class="tau-bars-wrap">' +
      barsHtml +
      "</div>" +
      '<div class="tau-x-axis" aria-hidden="true">' +
      '<span class="tau-x-label">Stopping time \u03c4 (number of flips)</span>' +
      "</div>";
  }
  // #endregion

  // #region Convergence chart (Y-axis 2 to 4)
  function updateConvergenceChart() {
    var container = document.getElementById("convergence-chart");
    if (!container) return;
    var yMin = 2;
    var yMax = 4;
    var width = Math.max(container.offsetWidth - 60, 300);
    var height = Math.max(200 - 16, 100);

    var n = runs.length;
    var top4 = 0;
    var topPi = 100 * (1 - (PI - yMin) / (yMax - yMin));
    var top3 = 50;
    var top2 = 100;
    var yAxisHtml =
      '<div class="y-axis" role="img" aria-label="Y axis: pi estimate from 2 to 4">' +
      '<span class="y-axis-label">4 \u00d7 (avg fraction)</span>' +
      '<div class="y-axis-ticks">' +
      '<span class="y-tick" style="top: ' + top4 + '%">4</span>' +
      '<span class="y-tick" style="top: ' + topPi + '%">\u03c0 \u2248 3.14</span>' +
      '<span class="y-tick" style="top: ' + top3 + '%">3</span>' +
      '<span class="y-tick" style="top: ' + top2 + '%">2</span>' +
      "</div>" +
      "</div>";
    var legendHtml =
      '<div class="chart-legend convergence-legend" aria-hidden="true">' +
      '<span class="legend-item"><span class="legend-swatch legend-swatch-line"></span> Your estimate</span>' +
      '<span class="legend-item"><span class="legend-swatch legend-swatch-pi"></span> \u03c0 \u2248 3.14</span>' +
      "</div>";
    if (n === 0) {
      container.innerHTML =
        yAxisHtml +
        '<div class="plot-area"><p class="placeholder">Run some trials to see your estimate converge.</p></div>' +
        legendHtml +
        '<div class="x-axis" aria-hidden="true"><div class="x-axis-ticks"></div><span class="x-axis-label">Run number</span></div>';
      return;
    }

    var cumulative = [];
    var sum = 0;
    for (var i = 0; i < n; i++) {
      sum += runs[i].fraction;
      cumulative.push(4 * sum / (i + 1));
    }

    var yScale = function (v) {
      return height - ((v - yMin) / (yMax - yMin)) * height;
    };
    var pathD = [];
    for (var j = 0; j < cumulative.length; j++) {
      var x = (j / Math.max(1, n - 1)) * (width - 2);
      var y = yScale(cumulative[j]);
      pathD.push((j === 0 ? "M" : "L") + x + " " + y);
    }
    var pathStr = pathD.join(" ");
    var piY = yScale(PI);
    var piLinePct = (piY / height) * 100;

    var gridLines = [2, 2.5, 3, PI, 3.5, 4].filter(function (v) {
      return v >= yMin && v <= yMax && Math.abs(v - PI) > 0.05;
    });
    var gridHtml = gridLines
      .map(function (v) {
        var y = (1 - (v - yMin) / (yMax - yMin)) * 100;
        return '<line x1="0" y1="' + (height * (1 - (v - yMin) / (yMax - yMin))) + '" x2="' + width + '" y2="' + (height * (1 - (v - yMin) / (yMax - yMin))) + '" class="chart-grid-line"/>';
      })
      .join("");

    var xTicks = [];
    if (n <= 6) {
      for (var t = 1; t <= n; t++) xTicks.push(t);
    } else {
      xTicks.push(1);
      xTicks.push(Math.round(n * 0.25) || 1);
      xTicks.push(Math.round(n * 0.5) || 1);
      xTicks.push(Math.round(n * 0.75) || 1);
      if (n > 1) xTicks.push(n);
    }
    xTicks = xTicks.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var xTicksHtml = xTicks
      .map(function (t) {
        var pct = (t - 1) / Math.max(1, n - 1);
        return '<span class="x-tick" style="left: ' + (pct * 100) + '%">' + t + "</span>";
      })
      .join("");

    container.innerHTML =
      yAxisHtml +
      '<div class="plot-area">' +
      '<div class="pi-line" style="top: ' + piLinePct + '%" title="\u03c0 \u2248 3.14"></div>' +
      '<svg viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<g class="chart-grid">' + gridHtml + "</g>" +
      '<path d="' + pathStr + '" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="convergence-path"/>' +
      "</svg>" +
      "</div>" +
      legendHtml +
      '<div class="x-axis" aria-hidden="true">' +
      '<div class="x-axis-ticks">' + xTicksHtml + "</div>" +
      '<span class="x-axis-label">Run number</span>' +
      "</div>";
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
    if (convergeBtn) convergeBtn.addEventListener("click", attemptConvergence);
    if (abortBtn) abortBtn.addEventListener("click", abortConvergence);
    if (resetBtn) resetBtn.addEventListener("click", reset);

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
