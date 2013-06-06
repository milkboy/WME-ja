var url = /https:\/\/(www|world)\.waze\.com\/(beta_)?editor\/.*/;
var pageMod = require("sdk/page-mod");
var self = require("sdk/self");

/*
var { MatchPattern } = require("sdk/page-mod/match-pattern");
var pattern = new MatchPattern(url);
console.log(pattern.test("https://www.waze.com/editor/")); // should return true
*/


pageMod.PageMod({
	include: url,
	//contentScript: "alert('Script loaded =)');"
	contentScriptFile: self.data.url("wme_junctionangle.user.js")
});
