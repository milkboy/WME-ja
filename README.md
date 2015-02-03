WME-ja
======

Waze Map Editor (WME) addon to help with junction design.
If two connected segments are selected, it shows the turn angle, otherwise the the angle between each segment.
I try to test with both Chrome (with Tampermonkey, as the userscript functionality changed) and Firefox (Greasemonkey), 
but anything might break at any given time anyway :stuck_out_tongue_closed_eyes:

- Update 2013-06-05: Chrome extension published in [chrome web store](https://chrome.google.com/webstore/detail/wme-junctionangle/cfcpfikgmfoghjfpfepmklballeagadf)
- Update 2013-06-06: Firefox add-on available at [Mozilla addons](https://addons.mozilla.org/en-US/firefox/addon/wme-ja/)

[![Creative Commons License](http://i.creativecommons.org/l/by-nc-sa/3.0/88x31.png)](http://creativecommons.org/licenses/by-nc-sa/3.0/deed.en_US)
*WME Junction Angle Info extension* by *Michael Wikberg*
is licensed under a [Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License](http://creativecommons.org/licenses/by-nc-sa/3.0/deed.en_US).

Source code and issue tracker at https://github.com/milkboy/WME-ja


![Screenshot](https://github.com/milkboy/WME-ja/raw/master/screenshot1.png)

###Changelog
####1.6.2
- Fixed 3 issues with permalink to selected nodes

####1.6.1
- Added more translated strings
- Fix settings to actually load properly with Chrome extension

####1.6
- Add color codes for different turn instructions
- Add user configurable options

####1.5.10
- Fixes by tkr85 (after latest WME update)

####1.5.9
- Added support for translations and the new beta editor URL.

####1.5.8
- Updates for new WME by several contributors (sorry if I missed someone); Paweł Pyrczak (tkr85), AlanOfTheBerg, berestovskyy

####1.5.7
- Remove 2 (of 4) Firefox extension validation warnings
AlanOfTheBerg

####1.5.6
- Fixed URL detection to run script on localized editor also.

####1.5.5
- Fixed layer selection div size (now the junction angles layer should always be visible in the list)

####1.5.4
- Misc tweaks for browser addon capabilities
- Added new editor URLs

####1.5

#####Fixes:
- Undefined reference on 'a2' in debug mode #10 (thanks to [bensmithurst](https://github.com/bensmithurst))
- Misc small fixes

####1.2

#####Fixes: 
- "0" angles show empty label enhancement #5
- Markers should not be displayed on zoom levels where the segments are not visible invalid  #3
- Marker distance should be dependent on zoom level enhancement #2
- Script stops working if a segment is deleted bug #1

####1.1

- Should work in Firefox (with Greasemonkey) also

####1.0

- Show the "turn angle" in green if two connected segments are selected

####0.4

- Show all junction angles in the map itself

####0.3

- Fix calculation of angles larger than 180°

####0.2

- Add handlers to "mouse up" event, so that angle is updated while editing a segment

####0.1

- First release
