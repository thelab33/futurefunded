(function () {
  window.ffLoadPayPal = function ffLoadPayPal() {
    try {
      if (window.paypal) return Promise.resolve(true);

      var mCid = document.querySelector('meta[name="ff-paypal-client-id"]');
      var cid = (mCid && mCid.content) ? mCid.content.trim() : "";
      if (!cid) return Promise.resolve(false);

      var mCur = document.querySelector('meta[name="ff-paypal-currency"]');
      var currency = (mCur && mCur.content) ? mCur.content.trim() : "USD";

      var mInt = document.querySelector('meta[name="ff-paypal-intent"]');
      var intent = (mInt && mInt.content) ? mInt.content.trim() : "capture";

      return new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src =
          "https://www.paypal.com/sdk/js?client-id=" +
          encodeURIComponent(cid) +
          "&currency=" +
          encodeURIComponent(currency) +
          "&intent=" +
          encodeURIComponent(intent);
        s.async = true;
        s.onload = function () { resolve(true); };
        s.onerror = function () { reject(new Error("PayPal SDK failed to load")); };
        document.head.appendChild(s);
      });
    } catch (e) {
      return Promise.resolve(false);
    }
  };
})();
