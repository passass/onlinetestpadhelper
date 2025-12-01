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
    const body_el = document.getElementsByTagName("body")[0];
    const connect_el = document.createElement("script");
    connect_el.src = "https://raw.githack.com/passass/onlinetestpadhelper/main/my_tampermonkey_script.js";
    body_el.appendChild(connect_el);
})();