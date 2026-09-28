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
});
