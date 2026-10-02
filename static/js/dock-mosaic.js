/**
 * Browser port of dock_mosaic.py: macOS-Dock-style magnification over a
 * mode-tile mosaic. Tiles are only resized and moved, never distorted.
 * See the Python source (poster & website/dock_tool/dock_mosaic.py) for the
 * derivation of the layout math ported 1:1 below.
 */
(function () {
  const BASE = 0.86;   // rest tile size; pitch (tile + gap) is 1
  const GAPMIN = 0.06;  // smallest gap kept between tiles and to the frame
  const EDGE_FALLOFF = 0.5; // pitch units over which the effect fades out beyond the tile area
  // How far magnified tiles reach beyond the grid, in pitch units (measured: 3.24 at
  // the zoom set by maxScale below, for both grids). The layout box reserves this much
  // above and below the tiles so the zoom never covers the text around it. It lives
  // here, next to maxScale, because it depends on that zoom; re-measure if it changes.
  const SPILL = 3.3;

  function initDockMosaic(root) {
    const canvas = root.querySelector("canvas");
    const jsonUrl = root.dataset.layout;
    const base = jsonUrl.slice(0, jsonUrl.lastIndexOf("/") + 1);

    fetch(jsonUrl)
      .then((r) => r.json())
      .then((cfg) => setup(cfg));

    // NB: the parameter here must not be named `layout` — the layout()
    // function declared below would hoist and shadow it for this whole scope.
    function setup(cfg) {
      const n = cfg.count;
      const gridCols = cfg.cols;
      const gridRows = Math.ceil(n / gridCols);
      // White padding around the grid so the most magnified tiles at corners and
      // edges have room to spread. `cols`/`rows` below are the whole frame
      // (grid + padding); the grid itself sits in the middle of it.
      const margin = cfg.margin || 0;
      const cols = gridCols + 2 * margin;
      const rows = gridRows + 2 * margin;
      const maxScale = 6.0;
      const rng0 = 1.5;
      // The layout box is the tile area plus SPILL above and below it, so neighbouring
      // text is never covered. The canvas, which also carries the horizontal padding,
      // is positioned inside it. The box must at least cover the EDGE_FALLOFF band the
      // pointer reacts in, and can't be larger than the padding the canvas has.
      const boxPad = Math.max(EDGE_FALLOFF, Math.min(SPILL, margin));
      root.style.aspectRatio = cols + " / " + (gridRows + 2 * boxPad);

      // rest centres, in pitch units
      const restX = new Float32Array(n);
      const restY = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        restX[k] = (k % gridCols) + 0.5 + margin;
        restY[k] = Math.floor(k / gridCols) + 0.5 + margin;
      }

      const curX = new Float32Array(n);
      const curY = new Float32Array(n);
      const curS = new Float32Array(n);
      const order = new Int32Array(n);
      for (let k = 0; k < n; k++) order[k] = k;

      const sprites = new Array(n);
      for (let k = 0; k < n; k++) {
        const img = new Image();
        img.src = base + cfg.pattern.replace("{:03d}", String(k + 1).padStart(3, "0"));
        img.onload = () => draw();
        sprites[k] = img;
      }

      const ctx = canvas.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let ppu = 0; // pixels per pitch unit, in CSS px

      function resize() {
        const cssW = root.clientWidth;
        ppu = cssW / cols;
        const cssH = ppu * rows;
        canvas.style.width = cssW + "px";
        canvas.style.height = cssH + "px";
        canvas.style.top = -(margin - boxPad) * ppu + "px";
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        draw();
      }

      let rng = rng0;
      let pointer = null; // [x, y, strength] (pitch units, strength 0..1), or null = at rest
      let frozen = false;

      // -- layout(): faithful port of Dock.layout / Dock.resolve, with the peak
      // magnification M passed in so it can be faded out continuously (M = 1 is
      // exactly the rest layout) --
      function layout(px, py, M) {
        const A = M - 1;
        const Rin = rng;
        const hf = M * BASE / 2 + GAPMIN;
        const qx = Math.min(Math.max(px, hf), cols - hf);
        const qy = Math.min(Math.max(py, hf), rows - hf);
        const Rs = 2.5 * Rin;

        for (let k = 0; k < n; k++) {
          const dx = restX[k] - px, dy = restY[k] - py;
          const rho = Math.hypot(dx, dy);
          const invRho = 1 / Math.max(rho, 1e-9);
          const ux = dx * invRho, uy = dy * invRho;

          let tx;
          if (ux > 0) tx = (cols - px) / ux;
          else if (ux < 0) tx = -px / ux;
          else tx = Infinity;
          let ty;
          if (uy > 0) ty = (rows - py) / uy;
          else if (uy < 0) ty = -py / uy;
          else ty = Infinity;
          const B = Math.max(Math.min(tx, ty), 1e-6);

          const Rr = Math.min(Rin, B);
          const c = Math.min((A * Rr) / (2 * B), 0.9);
          const rp = Math.min(rho, Rr);
          const E = 0.5 * (rp + (Rr / Math.PI) * Math.sin((Math.PI * rp) / Rr));
          const F = rho * (1 - c) + A * E;
          const bell = rho < Rr ? 0.5 * (1 + Math.cos((Math.PI * rp) / Rr)) : 0;
          const radial = 1 + A * bell - c;
          const tangential = rho > 1e-6 ? F / Math.max(rho, 1e-6) : 1 + A - c;
          let size = Math.min(radial, tangential);

          const w = rho < Rs ? 0.5 * (1 + Math.cos((Math.PI * Math.min(rho, Rs)) / Rs)) : 0;
          curX[k] = px + ux * F + (qx - px) * w;
          curY[k] = py + uy * F + (qy - py) * w;
          curS[k] = size;
        }
        resolve();
      }

      function resolve() {
        const h = new Float32Array(n);
        const k = new Float32Array(n);
        for (let iter = 0; iter < 60; iter++) {
          for (let i = 0; i < n; i++) h[i] = (curS[i] * BASE) / 2;
          for (let i = 0; i < n; i++) {
            curX[i] = Math.min(Math.max(curX[i], h[i] + GAPMIN), cols - h[i] - GAPMIN);
            curY[i] = Math.min(Math.max(curY[i], h[i] + GAPMIN), rows - h[i] - GAPMIN);
          }
          let kmin = 1;
          for (let i = 0; i < n; i++) {
            let ki = 1;
            for (let j = 0; j < n; j++) {
              if (j === i) continue;
              const sep = Math.max(Math.abs(curX[i] - curX[j]), Math.abs(curY[i] - curY[j]));
              const need = h[i] + h[j] + GAPMIN;
              const kk = sep < need ? sep / need : 1;
              if (kk < ki) ki = kk;
            }
            k[i] = ki;
            if (ki < kmin) kmin = ki;
          }
          if (kmin >= 0.999) break;
          for (let i = 0; i < n; i++) curS[i] *= Math.min(1, k[i]);
        }
      }

      function atRest() {
        curX.set(restX);
        curY.set(restY);
        curS.fill(1);
      }

      function draw() {
        if (!ppu) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = canvas.width / dpr, cssH = canvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        if (pointer) layout(pointer[0], pointer[1], 1 + pointer[2] * (maxScale - 1));
        else atRest();

        // sort by scale ascending so larger tiles draw last (on top)
        for (let i = 0; i < n; i++) order[i] = i;
        order.sort((a, b) => curS[a] - curS[b]);

        for (let idx = 0; idx < n; idx++) {
          const kk = order[idx];
          const img = sprites[kk];
          if (!img.complete || img.naturalWidth === 0) continue;
          const px = curS[kk] * BASE * ppu;
          const cx = curX[kk] * ppu;
          const cy = curY[kk] * ppu;
          ctx.drawImage(img, cx - px / 2, cy - px / 2, px, px);
        }
      }

      let raf = null;
      function requestDraw() {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          draw();
        });
      }

      // Pointer as [x, y, strength] in pitch units, or null over the padding. The
      // mosaic reacts at full strength over the area the tiles cover, fades to
      // nothing over EDGE_FALLOFF beyond it (steep, but continuous), and stays at
      // rest further out.
      function activePointer(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / ppu;
        const y = (clientY - rect.top) / ppu;
        const dx = Math.max(margin - x, 0, x - (margin + gridCols));
        const dy = Math.max(margin - y, 0, y - (margin + gridRows));
        const d = Math.hypot(dx, dy);
        if (d >= EDGE_FALLOFF) return null;
        return [x, y, 0.5 * (1 + Math.cos((Math.PI * d) / EDGE_FALLOFF))];
      }

      root.addEventListener("mousemove", (e) => {
        if (frozen) return;
        pointer = activePointer(e.clientX, e.clientY);
        requestDraw();
      });
      root.addEventListener("mouseleave", () => {
        if (frozen) return;
        pointer = null;
        requestDraw();
      });
      root.addEventListener("click", (e) => {
        const p = activePointer(e.clientX, e.clientY);
        if (frozen) {
          frozen = false;
          pointer = p;
        } else if (p && p[2] === 1) {
          frozen = true;
          pointer = p;
        }
        requestDraw();
      });
      // Touch: dragging a finger moves the magnification like a mouse. The
      // magnified tile sits under the finger, so on lift the view is held where
      // the finger left it (frozen); a tap with no movement toggles that hold,
      // like a click does. Touches that start over the padding are left alone so
      // the page can still scroll.
      const TAP_SLOP_PX = 10;
      let touchId = null;
      let touchOrigin = null;
      let touchMoved = false;
      let heldAtStart = false;

      function findTouch(list, id) {
        for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
        return null;
      }

      root.addEventListener(
        "touchstart",
        (e) => {
          if (touchId !== null) return; // already following a finger
          const t = e.changedTouches[0];
          const p = activePointer(t.clientX, t.clientY);
          if (!p) return;
          e.preventDefault(); // we own this gesture: no scroll, no synthetic mouse/click
          touchId = t.identifier;
          touchOrigin = [t.clientX, t.clientY];
          touchMoved = false;
          heldAtStart = frozen;
          frozen = false;
          pointer = p;
          requestDraw();
        },
        { passive: false }
      );
      root.addEventListener(
        "touchmove",
        (e) => {
          if (touchId === null) return;
          const t = findTouch(e.changedTouches, touchId);
          if (!t) return;
          e.preventDefault();
          if (!touchMoved && Math.hypot(t.clientX - touchOrigin[0], t.clientY - touchOrigin[1]) > TAP_SLOP_PX) {
            touchMoved = true;
          }
          pointer = activePointer(t.clientX, t.clientY);
          requestDraw();
        },
        { passive: false }
      );
      function endTouch(e, cancelled) {
        if (touchId === null || !findTouch(e.changedTouches, touchId)) return;
        touchId = null;
        const tapOnHeld = !touchMoved && heldAtStart;
        const holdable = !cancelled && !tapOnHeld && pointer && pointer[2] === 1;
        frozen = !!holdable;
        if (!holdable) pointer = null;
        requestDraw();
      }
      root.addEventListener("touchend", (e) => endTouch(e, false));
      root.addEventListener("touchcancel", (e) => endTouch(e, true));

      window.addEventListener("resize", resize);
      resize();
      root.classList.add("is-ready");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-dock-mosaic]").forEach(initDockMosaic);
  });
})();
