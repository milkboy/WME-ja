var url = /https:\/\/www\.waze\.com\/(.{2,6}\/)?(beta_)?editor\/.*/;
var pageMod = require("sdk/page-mod");
var self = require("sdk/self");

pageMod.PageMod({
	include: url,
	//contentScript: "alert('Script loaded =)');"
	contentScriptFile: self.data.url("wme_junctionangle.user.js")
});
