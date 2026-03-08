(function () {

  const el = document.querySelector("#checkout");

  if (!el) {
    console.warn("Checkout element not found");
    return;
  }

  let node = el;

  console.log("🔬 FUTUREFUNDED OVERLAY XRAY\n");

  while (node) {

    const style = getComputedStyle(node);

    console.log({
      element: node.tagName,
      class: node.className,
      overflow: style.overflow,
      position: style.position,
      transform: style.transform,
      height: style.height,
      maxHeight: style.maxHeight,
      zIndex: style.zIndex
    });

    node = node.parentElement;
  }

})();
