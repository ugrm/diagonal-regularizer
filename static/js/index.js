document.addEventListener("DOMContentLoaded", function () {
  var copyBtn = document.querySelector(".bibtex-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var text = document.getElementById("bibtex-text").innerText;
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.textContent = "copied";
        setTimeout(function () {
          copyBtn.textContent = "copy";
        }, 1500);
      });
    });
  }

  // Let the tagline's gradient blob follow the mouse across the page.
  var taglines = document.querySelectorAll(".teaser-tagline");
  if (taglines.length) {
    var raf = null;
    var mx = 50, my = 50;
    window.addEventListener("mousemove", function (e) {
      mx = (e.clientX / window.innerWidth) * 100;
      my = (e.clientY / window.innerHeight) * 100;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        taglines.forEach(function (el) {
          el.style.setProperty("--mx", mx + "%");
          el.style.setProperty("--my", my + "%");
        });
      });
    });
  }
});
