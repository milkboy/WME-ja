var url = /https:\/\/(www|editor-beta)\.waze\.com\/(.{2,6}\/)?editor\/.*/;
var pageMod = require("sdk/page-mod");
var self = require("sdk/self");

pageMod.PageMod({
	include: url,
	contentScriptWhen: 'end',
	//contentScript: "alert('Script loaded =)');"
	contentScriptFile: self.data.url("wme_junctionangle.user.js")
});
