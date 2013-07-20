// ==UserScript==
// @name                WME Junction Angle info
// @namespace           http://userscripts.org/users/508112
// @description         Show the angle between two selected (and connected) segments
// @include             https://www.waze.com/editor/*
// @include             https://waze.com/editor/*
// @include             https://world.waze.com/editor/*
// @include             https://waze.com/beta_editor/*
// @include             https://www.waze.com/beta_editor/*
// @include             https://world.waze.com/beta_editor/*
// @include             https://editor.waze.com/*
// @include             https://editor-beta.waze.com/*
// @updateURL           https://userscripts.org/scripts/source/160864.user.js
// @version             1.5.4
// @grant               GM_getResourceURL
// @copyright           2013 Michael Wikberg <michael@wikberg.fi>
// @run_at		document_start
// ==/UserScript==

var getURL;
//Get local file if installed as chrome extension
if(window.navigator.vendor.match(/Google/)) {
  getURL = function(path) { return chrome.extension.getURL(path); };
}
else {
  getURL = function(path) { return GM_getResourceURL(path); }
}

var ja_script = document.createElement('script');
ja_script.src = getURL("wme_junctionangle.user.js");
ja_script.async = false;
ja_script.onload = function() { };

//append real code into document
document.head.appendChild(ja_script);
console.log("Bootstrapped CRX...");
