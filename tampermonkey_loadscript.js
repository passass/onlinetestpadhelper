// ==UserScript==
// @name         Online Test Pad Helper
// @namespace    https://onlinetestpad.com/
// @version      2025-11-24
// @description  try to take over the world!
// @author       You
// @match        https://*onlinetestpad.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function () {
    "use strict";
    window.sk_api_key = "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";
	window.hf_api_key = "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";
    const body_el = document.getElementsByTagName("body")[0];
    const connect_el = document.createElement("script");
    connect_el.src = "https://raw.githack.com/passass/onlinetestpadhelper/main/my_tampermonkey_script.js";
    body_el.appendChild(connect_el);
})();