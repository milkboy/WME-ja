WME-ja
======

Waze Map Editor (WME) addon to help with junction design.
If two connected segments are selected, it shows the turn angle, otherwise the the angle between each segment.
I try to test with both Chrome and Firefox (Greasemonkey), 
but anything might break at any given time anyway :stuck_out_tongue_closed_eyes:

Update 2013-06-04: And yes, something broke. Since Chrome v27 this script is not working, and the only way to currently use it is through Tampermonkey. Sorry.

[![Creative Commons License](http://i.creativecommons.org/l/by-nc-sa/3.0/88x31.png)](http://creativecommons.org/licenses/by-nc-sa/3.0/deed.en_US)
*WME Junction Angle Info extension* by *Michael Wikberg*
is licensed under a [Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License](http://creativecommons.org/licenses/by-nc-sa/3.0/deed.en_US).

Based on a work at https://github.com/milkboy/WME-ja

Also available at http://userscripts.org/scripts/show/160864

![Screenshot](http://wikberg.fi/grfx/wme_ja.png)

###Changelog
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
