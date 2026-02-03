document.addEventListener("DOMContentLoaded", function () {
    const list = document.querySelector("#donation-ticker");
    const track = list?.parentElement?.nextElementSibling;
    if (list && track) {
      // Clone only when real donor items exist
      if (list.children.length > 1) {
        track.innerHTML = list.outerHTML;
      }
    }
  });
