// ==UserScript==
// @name                WME Junction Angle info
// @namespace           https://github.com/milkboy/WME-ja
// @description         Show the angle between two selected (and connected) segments
// @include             /^https:\/\/(www|editor-beta)\.waze\.com\/(.{2,6}\/)?editor\/.*$/
// @updateURL           https://github.com/milkboy/WME-ja/raw/master/wme_junctionangle.user.js
// @version             1.6.3
// @grant               none
// @copyright           2015 Michael Wikberg <waze@wikberg.fi>
// @license             CC-BY-NC-SA
// ==/UserScript==

/**
 * Copyright 2014 Michael Wikberg <waze@wikberg.fi>
 * WME Junction Angle Info extension is licensed under a Creative Commons
 * Attribution-NonCommercial-ShareAlike 3.0 Unported License.
 *
 * Contributions by:
 *     2014 Paweł Pyrczak "tkr85" <support@pyrczak.pl>
 *     2014 "AlanOfTheBerg" <alanoftheberg@gmail.com>
 *     2014 "berestovskyy" <?>
 */

function run_ja() {

    var junctionangle_version = "1.6.3";
    var junctionangle_debug = 1;	//0: no output, 1: basic info, 2: debug 3: crazy debug
    var $;
    var ja_features = [];

    var ja_last_restart = 0;

    var ja_routing_type = {
        BC: "junction_none",
        KEEP: "junction_keep",
        TURN: "junction",
        EXIT: "junction_exit", //not actually used (yet)
        PROBLEM: "junction_problem",
        ERROR: "junction_error"
    };
    
    var ja_road_type = {
    	PRIMARY_STREET: 1,
    	STREET: 2,
    	RAMP: 4,
    	H1: 3,
    	H2: 4,
    	H3: 6,
    	H4: 7
    };

    function ja_bootstrap() {
        try {
            if ((typeof window.Waze.map !== 'undefined') && ('undefined' !== typeof window.Waze.map.events.register) &&
                ('undefined' !== typeof window.Waze.selectionManager.events.register ) &&
                ('undefined' !== typeof window.Waze.loginManager.events.register)) {
                setTimeout(junctionangle_init, 500);
            } else {
                setTimeout(ja_bootstrap, 1000);
            }
        } catch (err) {
            setTimeout(ja_bootstrap, 1000);
        }
    }

    function ja_log(ja_log_msg, ja_log_level) {

        if (ja_log_level <= junctionangle_debug) {
            if (typeof ja_log_msg == "object") {
                console.debug(ja_log_msg);
            }
            else {
                console.debug("WME Junction Angle: " + ja_log_msg);
            }
        }
    }

    function ja_get_style_rule(routingType, fillColorOption) {
        return new window.OpenLayers.Rule(
        	{
                filter: new window.OpenLayers.Filter.Comparison({
                    type: window.OpenLayers.Filter.Comparison.EQUAL_TO,
                    property: "ja_type",
                    value: routingType
                }),
                symbolizer: {
                    pointRadius: 3 + parseInt(ja_getOption("pointSize"), 10) + (parseInt(ja_getOption("decimals")) > 0 ? 5 * parseInt(ja_getOption("decimals")) : 0),
                    fontSize: "12px",
                    fillColor: ja_getOption(fillColorOption),
                    strokeColor: "#183800"
                }
            })
    }
    /**
     * Make some style settings
     */
    function ja_style() {
        ja_log("Point radius will be: " + (parseInt(ja_getOption("pointSize"), 10)) + (parseInt(ja_getOption("decimals") > 0 ? 5 * parseInt(ja_getOption("decimals")) : 0)));
        return new window.OpenLayers.Style({
            fillColor: "#ffcc88",
            strokeColor: "#ff9966",
            strokeWidth: 2,
            label: "${angle}",
            fontWeight: "bold",
            pointRadius: parseInt(ja_getOption("pointSize"), 10) + (parseInt(ja_getOption("decimals")) > 0 ? 5 * parseInt(ja_getOption("decimals")) : 0),
            fontSize: "10px"
        }, {
            rules: [
                new window.OpenLayers.Rule({
                    symbolizer: {
                    }
                }),
                ja_get_style_rule(ja_routing_type.TURN, "turnInstructionColor", "#183800"),
                ja_get_style_rule(ja_routing_type.BC, "noInstructionColor", "#183800"),
                ja_get_style_rule(ja_routing_type.KEEP, "keepInstructionColor", "#183800"),
                ja_get_style_rule(ja_routing_type.EXIT, "exitInstructionColor", "#183800"),
                ja_get_style_rule(ja_routing_type.PROBLEM, "problemColor", "#183800"),
                ja_get_style_rule(ja_routing_type.ERROR, "problemColor", "#ff0000")
            ]
        });
    }

    var ja_settings = {
        guess: { elementType: "checkbox", elementId: "_jaCbGuessRouting", defaultValue: false},
        noInstructionColor: { elementType: "color", elementId: "_jaTbNoInstructionColor", defaultValue: "#ffffff"},
        keepInstructionColor: { elementType: "color", elementId: "_jaTbKeepInstructionColor", defaultValue: "#aeff3b"},
        exitInstructionColor: { elementType: "color", elementId: "_jaTbExitInstructionColor", defaultValue: "#6cb5ff"},
        turnInstructionColor: { elementType: "color", elementId: "_jaTbTurnInstructionColor", defaultValue: "#4cc600"},
        problemColor: { elementType: "color", elementId: "_jaTbProblemColor", defaultValue: "#a0a0a0"},
        decimals: { elementType: "number", elementId: "_jaTbDecimals", defaultValue: 0, min: 0, max: 2},
        pointSize: { elementType: "number", elementId: "_jaTbPointSize", defaultValue: 12, min: 6, max: 20}
    };

    function junctionangle_init() {

        //Listen for selected nodes change event
        window.Waze.selectionManager.events.register("selectionchanged", null, ja_calculate);

        window.Waze.model.segments.events.on({
            "objectschanged": ja_calculate,
            "objectsremoved": ja_calculate
        });
        window.Waze.model.nodes.events.on({
            "objectschanged": ja_calculate,
            "objectsremoved": ja_calculate
        });


        //HTML changes after login, even though the page is not reloaded. Better do init again.
        window.Waze.loginManager.events.register("afterloginchanged", null, junctionangle_init);

        //Skipping for now, as changes must be saved manually anyway //window.addEventListener("beforeunload", ja_save, false);

		ja_load();
		ja_loadTranslations();
        /**
         * Add config setting
         */
        var ja_settings_dom = document.createElement("div");
        var ja_settings_dom_panel = document.createElement("div");
        var ja_settings_dom_content = document.createElement("div");
		ja_settings_dom_panel.className = "side-panel-section";
		ja_settings_dom_content.className = "tab-content";
        ja_settings_dom_content.innerHTML = "<h4>" + ja_getMessage("settingsTitle") + "</h4>";

        var form = document.createElement('form');
        var section = document.createElement('div');
		section.className = "form-group";
		form.className = "attributes-form side-panel-section";
        //section.style.paddingTop = "8px";
        //section.style.textIndent = "16px";
        section.id = "jaOptions";
        section.innerHTML  = '';
        ja_log("---------- Creating settings HTML ----------", 2);
        Object.getOwnPropertyNames(ja_settings).forEach(function (a,b,c) {
            var setting = ja_settings[a];
            ja_log("---------- " + a + " ----------", 2);
            ja_log(section.innerHTML, 2);
            switch (setting['elementType']) {
                case 'color':
                    section.innerHTML  = section.innerHTML + '<div class="controls-container"><input type="color" id="' + setting['elementId']
                        + '" /> ' +'<label for="' + setting['elementId'] + '">' + ja_getMessage(a) + '</label></div>';
                    break;
                case 'number':
                    section.innerHTML  = section.innerHTML + '<div class="controls-container"><input type="number" id="' + setting['elementId']
                        + '" min="'+setting['min']+'" max="'+setting['max']+'" required="" /> ' +'<label for="' + setting['elementId'] + '">' + ja_getMessage(a) + '</label></div>';
                    break;
                case 'text':
                    section.innerHTML  = section.innerHTML + '<div class="controls-container"><input type="text" size="' + (setting['max'] ? setting['max'] : 8)
                        + '" maxlength="' + (setting['max'] ? setting['max'] : "7") + '" id="' + setting['elementId']
                        + '" /> ' +'<label for="' + setting['elementId'] + '">' + ja_getMessage(a) + '</label></div>';
                    break;
                case 'checkbox':
                    section.innerHTML  = section.innerHTML + '<div class="controls-container"><input type="checkbox" name="' + setting['elementId'] + '" id="' + setting['elementId'] + '" /> '
                        +'<label for="' + setting['elementId'] + '">' + ja_getMessage(a) + '</label></div>';
                    break;
            }
            ja_log(section.innerHTML, 3);
        });
        section.innerHTML  = section.innerHTML + '<br/><button class="btn btn-default" onclick="return ja_save() && false;">' + ja_getMessage("apply") + '</button> '
            + '<button class="btn btn-default" onclick="return ja_reset() && false;">' + ja_getMessage('resetToDefault') + '</button>';
        ja_log(section.innerHTML, 2);
		form.appendChild(section);
        ja_settings_dom_content.appendChild(form);

        var userTabs = document.getElementById('user-info');
        var navTabs = userTabs.getElementsByClassName('nav-tabs', userTabs)[0];
        var tabContent = userTabs.getElementsByClassName('tab-content', userTabs)[0];

        ja_settings_dom.id = "sidepanel-ja";
        ja_settings_dom.className = "tab-pane";

		ja_settings_dom_content.style.paddingTop = "0";
		ja_settings_dom_panel.appendChild(ja_settings_dom_content);
		ja_settings_dom.appendChild(ja_settings_dom_panel);

        if(tabContent != null) {
            tabContent.appendChild(ja_settings_dom);
        } else {
            ja_log("Could not append setting to tabContent!?!", 1);
        }

        jatab = document.createElement('li');
        jatab.innerHTML = '<!--suppress HtmlUnknownAnchorTarget --><a href="#sidepanel-ja" data-toggle="tab">JAI</a>';
        if(navTabs != null)
            navTabs.appendChild(jatab);

        //Add support for translations. Default (and fallback) is "en".
        //Note, don't make typos in "acceleratorName", as it has to match the layer name (with whitespace removed
        // to actually work. Took me a while to figure that out...
		I18n.translations[window.I18n.locale].layers.name["junction_angles"] = ja_getMessage("name");

        //try to see if we already have a layer
        if (window.Waze.map.getLayersBy("uniqueName","junction_angles").length == 0) {

            // Create a vector layer and give it your style map.
            ja_mapLayer = new window.OpenLayers.Layer.Vector(ja_getMessage("name"), {
                displayInLayerSwitcher: true,
                uniqueName: "junction_angles",
                shortcutKey: "S+j",
                accelerator: "toggle" + ja_getMessage("name").replace(/\s+/g,''),
                className: "junction-angles",
                styleMap: new window.OpenLayers.StyleMap(ja_style())
            });

            window.Waze.map.addLayer(ja_mapLayer);
            ja_log("version " + junctionangle_version + " loaded.", 0);

            ja_log(window.Waze.map, 3);
            ja_log(window.Waze.model, 3);
            ja_log(window.Waze.loginManager, 3);
            ja_log(window.Waze.selectionManager, 3);
            ja_log(ja_mapLayer, 3);
            ja_log(window.OpenLayers, 3);
        } else {
            ja_log("Oh, nice.. We already had a layer?", 3);
        }

        ja_apply();
		
		//Do a calculation if we have segments selected (permalink etc)
		if(window.Waze.selectionManager.selectedItems.length > 0) {
			ja_calculate();
		}
    }

    function ja_get_streets(segmentId) {
        var primary = window.Waze.model.streets.objects[window.Waze.model.segments.objects[segmentId].attributes.primaryStreetID];
        var secondary = [];
        window.Waze.model.segments.objects[segmentId].attributes.streetIDs.forEach(function asd(element, index, array) {
            secondary.push(window.Waze.model.streets.objects[element]);
        });
        ja_log(primary, 3);
        ja_log(secondary, 3);
        return { primary: primary, secondary: secondary };
    }

    function ja_primary_name_and_type_match(street_in, streets) {
        ja_log("PNT", 2);
        ja_log(street_in, 2);
        return Object.getOwnPropertyNames(streets).some(function (id, index, array) {
            ja_log("PNT Checking element " + index, 2);
            ja_log(streets[id], 2);
            return (streets[id].primary.name == street_in.primary.name
                && streets[id].primary.type == street_in.primary.type);
        });
    }

    function ja_primary_name_match(street_in, streets) {
        ja_log("PN", 2);
        ja_log(street_in, 2);
        ja_log(streets, 2);
        return Object.getOwnPropertyNames(streets).some(function (id, index, array) {
            element = streets[id];
            ja_log("PN Checking element " + index + " of " + array.length, 2);
            ja_log(element, 2);
            return (element.primary.name == street_in.primary.name);
        });
    }

    /**
     * From wiki:
     * A Cross-match is when the primary name of one segment is identical to the alternate name of an adjacent segment. It had the same priory as a Primary name match.
     * In order for a Cross match to work there must be at least one alt name on both involved segments (even though they don't necessarily match each other).
     * It will work even if the are no Primary names on those segments.
     * It will not work if all three segments at a split have a matching Primary name or a matching Alternate name.
     * @param street_in
     * @param streets
     * @returns {boolean}
     */
    //TODO: test!
    function ja_cross_name_match(street_in, streets) {
        ja_log("CN: init", 2);
        ja_log(street_in, 2);
        ja_log(streets, 2);
        return Object.getOwnPropertyNames(streets).some(function (street_n_id, index, array) {
            street_n_element = streets[street_n_id];
            ja_log("CN: Checking element " + index, 2);
            ja_log(street_n_element, 2);
            return (street_in.secondary.some(function (street_in_secondary, index2, array2){
                ja_log("CN2a: checking n.p: " + street_n_element.primary.name + " vs in.s: " + street_in_secondary.name, 2);
                return street_n_element.primary.name == street_in_secondary.name;
            }) || street_n_element.secondary.some(function (street_n_secondary, index2, array2) {
                ja_log("CN2b: checking in.p: " + street_in.primary.name + " vs n.s: " + street_n_secondary.name, 2);
            }));
        });
    }

    //TODO: TEST
    function ja_alt_name_match(street_in, streets) {
        return Object.getOwnPropertyNames(streets).some(function (street_n_id, index, array) {
            var street_n_element = streets[street_n_id];
            ja_log("AN alt name check: Checking element " + index, 2);
            ja_log(street_n_element, 2);

            if(street_in.secondary.length == 0) return false;
            if(street_n_element.secondary.length == 0) return false;

            return street_in.secondary.some(function (street_in_secondary, index2, array2) {
                ja_log("AN2 checking element " + index2, 2);
                ja_log(street_in_secondary, 2);
                return street_n_element.secondary.some(function (street_n_secondary_element, index3,  array3) {
                    ja_log("AN3 Checking in.s: " + street_in_secondary.name + " vs n.s." + index3 + ": " + street_n_secondary_element.name, 2);
                    return street_in_secondary.name == street_n_secondary_element.name;
                });
            });
        });
    }

    /**
     * Check if segment in type matches any other segments
     * @param segment_in
     * @param segments
     * @returns {boolean}
     */
    function ja_segment_type_match(segment_in, segments) {
        ja_log(segment_in, 2);
        ja_log(segments, 2);
        //ja_log(window.Waze.model.segments, 2);

        return Object.getOwnPropertyNames(segments).some(function (segment_n_id, index, array) {
            var segment_n = segments[segment_n_id];
            ja_log("PT Checking element " + index, 2);
            ja_log(segment_n, 2);
            if(segment_n.attributes.id == segment_in.attributes.id) return false;
            ja_log("PT checking sn.rt " + segment_n.attributes.roadType +
                " vs i.pt: " + segment_in.attributes.roadType, 2);
            return (segment_n.attributes.roadType == segment_in.attributes.roadType);
        });
    }

    function ja_has_alt_name(seg) {
        //Single segment?
        if(seg.hasOwnProperty('primary')) {
            return seg.secondary.length > 0;
        } else {
            return Object.getOwnPropertyNames(seg).some(function (s,i,a) {
                return seg[s].secondary.length > 0;
            });
        }
    }

    //segment or segment array
    function ja_all_ramps(seg) {
        //Single segment?
        if(seg.hasOwnProperty('type')) {
            return seg.isRoutable();
        } else {
            return Object.getOwnPropertyNames(seg).some(function (s,i,a) {
                return !seg[s].isRoutable();
            });
        }
    }

    /**
     * get absolute (or turn) angle between 2 inputs.
     * 0,90,true  -> 90     0,90,false -> -90
     * 0,170,true -> 170    0,170,false -> -10
     * @param aIn absolute s_in angle (from node)
     * @param aOut absolute s_out angle (from node)
     * @param absolute return absolute or turn angle?
     * @returns {number}
     */
    function ja_angle_diff(aIn, aOut, absolute) {
        var a = parseFloat(aOut) - parseFloat(aIn);
        if(a > 180) a -= 360;
        if(a < -180) a+= 360;
        if(absolute) {
            return a;
        } else {

            return a > 0 ? a - 180 : a + 180;
        }
    }
    /**
     *
     * @param node Junction node
     * @param s_in_a "In" segment id
     * @param s_out_a "Out" segment id
     * @param angles array of segment absolute angles [0] angle, [1] segment id, 2[?]
     * @returns {string}
     */
    function ja_guess_routing_instruction(node, s_in_a, s_out_a, angles) {
        ja_log("Guessing routing instructions",2);
        ja_log(node, 3);
        ja_log(s_in_a, 3);
        ja_log(s_out_a, 3);
        ja_log(angles, 3);
        var s_in_id = s_in_a;
        var s_out_id = s_out_a;

        for(k=0; k< angles.length; k++) {
            ja_log(angles[k], 3);
            if (angles[k][1] == s_in_a) {
                s_in_a = angles[k];
                break;
            }
        }
        for(k=0; k< angles.length; k++) {
            ja_log(angles[k], 3);
            if(angles[k][1] == s_out_a) {
                s_out_a = angles[k];
                break;
            }
        }

        var s_n = {}, s_in, s_out = {}, street_n = {}, street_in;
        for(k=0; k<node.attributes.segIDs.length; k++) {
            if (node.attributes.segIDs[k] == s_in_id) {
                s_in = node.model.segments.objects[node.attributes.segIDs[k]];
                street_in = ja_get_streets(node.attributes.segIDs[k]);
                //Set empty name for streets if not defined
                if(typeof street_in.primary.name === 'undefined') {
                    street_in.primary['name'] = "";
                }
            } else {
                if(node.attributes.segIDs[k] == s_out_id) {
                    //store for later use
                    s_out[node.attributes.segIDs[k]] = node.model.segments.objects[node.attributes.segIDs[k]];
                    //Set empty name for streets if not defined
                    if(typeof s_out[node.attributes.segIDs[k]].primary === 'undefined') {
                        s_out[node.attributes.segIDs[k]]['primary'] = { name: "" };
                    }
                }
                s_n[node.attributes.segIDs[k]] = node.model.segments.objects[node.attributes.segIDs[k]];
                street_n[node.attributes.segIDs[k]] = ja_get_streets(node.attributes.segIDs[k]);
                if(typeof street_n[node.attributes.segIDs[k]].primary === 'undefined') {
                    street_n[node.attributes.segIDs[k]]['primary'] = { name: ""};
                }
            }
        }



        ja_log(s_in_a, 3);
        ja_log(s_out_a, 3);
        ja_log(s_n, 3);
        ja_log(street_n,3);
        ja_log(s_in,3);
        ja_log(street_in,2);

        var angle = ja_angle_diff(s_in_a[0], (s_out_a[0]), false);
        ja_log("turn angle is: " + angle, 2);
        //No other possible turns
        if(node.attributes.segIDs.length <= 2) {
            ja_log("Only one possible turn", 2);
            return ja_routing_type.BC;
        } //No instruction

        /*
         *
         * Here be dragons!
         *
         */

        if(!ja_is_turn_allowed(s_in, node, s_out[s_out_id])) {
            //Turn is disallowed!
            return ja_routing_type.ERROR;
        }
        //Is it a roundabout?
        if(false) {
            ja_log("Roundabout logic", 2);
            //FIXME
        } else {
            if(Math.abs(angle) <= 44) {
                ja_log("Turn is <= 44", 2);

                /*
                 Need to filter out turns that have no useful meaning for BC. Hope this won't break anything...
                 */
                var tmp_street_out = {};
                tmp_street_out[s_out_id] = street_n[s_out_id];

                ja_log("Original angles and street_n:", 2);
                ja_log(angles, 2);
                ja_log(street_n, 2);
                ja_log(s_n, 2);
                angles = angles.filter(function (a,b,c) {
                    ja_log("Filtering angle: " + ja_angle_diff(s_in_a,a[0],false), 2);
                    if(Math.abs(ja_angle_diff(s_in_a,a[0],false)) <=45
                        && typeof s_n[a[1]] !== 'undefined'
                        && ja_is_turn_allowed(s_in, node, s_n[a[1]])) {
                        return true;
                    } else {
                        if(street_n[a[1]]) {
                            delete s_n[a[1]];
                            delete street_n[a[1]];
                        }
                        return false;
                    }
                });
                ja_log("Filtered angles and street_n:", 2);
                ja_log(angles, 2);
                ja_log(street_n, 2);
                ja_log(s_n, 2);

                if(angles.length == 1) return ja_routing_type.BC;
                //FIXME: Need to have logic for multiple <45 matches?...
                //Check for other unrestricted <45 turns?
                for(k=0; k< angles.length; k++) {
                    ja_log("Checking angle " + k, 2);
                    ja_log(angles[k],2);

                    ja_log("in: " + s_in_a[0] + ", " + (s_in_a[0] + 180), 3);
                    ja_log("a_n: " + angles[k][0], 3);
                    var tmp_angle = ja_angle_diff(s_in_a[0], angles[k][0], false);
                    ja_log(tmp_angle, 2);
                    
                    //tmp test
                    ja_log("Node getDirectionBetweenSegments", 2);
                    ja_log(node.getAngleToSegment(s_in, s_out[s_out_id]), 2);
                    ja_log(node.allConnectionKeys(s_out[s_out_id]), 2);
                    //end
                    
                    if(
                        Math.abs(tmp_angle < 45) &&  //Angle is < 45
                        ja_is_turn_allowed(s_in, node, s_n[angles[k][1]]) && //Direction is allowed FIXME: Need to check for disallowed turns somehow!
                        Math.abs(ja_angle_diff(angles[k][0],s_out_a[0], true)) > 1 //Arbitrarily chosen angle for "overlapping" segments.
                        ){
                        ja_log("Found other allowed turn <= 44", 2);

                        /*
                         * Begin "best continuation" logic
                         */
                        ja_log("BC 2", 1);
                        //2 Is there any alt on both s-in & any s-n?
                        if(ja_has_alt_name(street_in) && ja_has_alt_name(street_n)) {
                            //3 Is s-out a type match?
                            ja_log("BC 3", 2);
                            //Road types match?
                            if(ja_segment_type_match(s_in, s_out)) {
                                //4 Does s-in have a primary name?
                                ja_log("BC 4", 2);
                                if(street_in.primary.name) {
                                    //5 Is s-out a primary OR cross name match?
                                    ja_log("BC 5", 2);
                                    if(ja_primary_name_match(street_in, tmp_street_out) ||
                                        ja_cross_name_match(street_in,  tmp_street_out)) {
                                        //6 Is any SN a primary name AND type match?
                                        //FIXME: Does this mean match to s_in?
                                        ja_log("BC 6", 2);
                                        if(ja_primary_name_and_type_match(street_in, street_n)) {
                                            ja_log("Found a name+type match", 2);
                                            return ja_routing_type.KEEP;
                                        } else {
                                            return ja_routing_type.BC;
                                        }
                                    } else {
                                        //10    Is any SN a primary name AND type match?
                                        ja_log("BC 10", 2);
                                        if(ja_primary_name_and_type_match(street_in, street_n)) {
                                            return ja_routing_type.KEEP;
                                        } else {
                                            //11    Is s-out an alternate name match?
                                            ja_log("BC 11", 2);
                                            if(!ja_alt_name_match(street_in, tmp_street_out)) {
                                                //12    Is any SN a primary OR cross OR alternate name match?
                                                ja_log("BC 12", 2);
                                                if(ja_primary_name_match(street_in, street_n)
                                                    || ja_cross_name_match(street_in, street_n)
                                                    || ja_alt_name_match(street_in, street_n)) {
                                                    return ja_routing_type.KEEP;
                                                } else {
                                                    return ja_routing_type.BC;
                                                }
                                            } else {
                                                //13    Is any SN an alternate name AND type match?
                                                ja_log("BC 13", 2);
                                                if(ja_alt_name_match(street_in, street_n)
                                                    && ja_segment_type_match(s_in, s_out)) {
                                                    return ja_routing_type.KEEP;
                                                } else {
                                                    return ja_routing_type.BC;
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    //7 Is any SN a primary OR cross match name?
                                    ja_log("BC 7", 2);
                                    if(ja_primary_name_match(street_in, street_n)
                                        || ja_cross_name_match(street_in, street_n)) {
                                        return ja_routing_type.KEEP;
                                    } else {
                                        //8 Is s-out a primary OR cross name match?
                                        ja_log("BC 8", 2);
                                        if(ja_primary_name_match(street_in, tmp_street_out)
                                            || ja_cross_name_match(street_in, tmp_street_out)) {
                                            return ja_routing_type.BC;
                                        } else {
                                            //9 Is any SN a type match?
                                            ja_log("BC 9", 2);
                                            if(ja_segment_type_match(s_in, s_n)) {
                                                return ja_routing_type.KEEP;
                                            } else {
                                                return ja_routing_type.BC;
                                            }
                                        }
                                    }
                                }
                            } else {
                                //14 Is any SN a type match?
                                ja_log("BC 14", 2);
                                if(ja_segment_type_match(s_in, s_n)) {
                                    //15    Is any SN a primary OR cross name match?
                                    ja_log("BC 15", 2);
                                    if(ja_cross_name_match(street_in, street_n || ja_cross_name_match(street_in, street_n))) {
                                        //Keep
                                        return ja_routing_type.KEEP;
                                    } else {
                                        //16    Does s-in have a primary name?
                                        ja_log("BC 16", 2);
                                        if(street_in.primary.name) {
                                            //17    Is s-out a primary OR cross match?
                                            ja_log("BC 17", 2);
                                            if(ja_primary_name_match(street_in, tmp_street_out)
                                                || ja_cross_name_match(street_in, tmp_street_out)) {
                                                return ja_routing_type.BC;
                                            } else {
                                                //18    Is s-out an alternate name match?
                                                ja_log("BC 18", 2);
                                                if(ja_alt_name_match(street_in, tmp_street_out)) {
                                                    //19    Is any SN an alternate name match?
                                                    if(ja_alt_name_match(street_in, street_n)) {
                                                        return ja_routing_type.KEEP;
                                                    } else {
                                                        return ja_routing_type.BC;
                                                    }
                                                } else {
                                                    return ja_routing_type.KEEP;
                                                }
                                            }
                                        } else {
                                            //keep
                                            return ja_routing_type.KEEP;
                                        }
                                    }
                                } else {
                                    //20    Is s-out a primary name match?
                                    ja_log("BC 20", 2);
                                    if(ja_primary_name_match(street_in, tmp_street_out)) {
                                        //21    Is any SN a primary or cross name match?
                                        ja_log("BC 21", 2);
                                        if(ja_primary_name_match(street_in, street_n) || ja_cross_name_match(street_in, street_n)) {
                                            return ja_routing_type.KEEP;
                                        } else {
                                            return ja_routing_type.BC;
                                        }
                                    } else {
                                        //22    Is any SN a primary name match?
                                        ja_log("BC 22", 2);
                                        if(ja_primary_name_match(street_in, street_n)) {
                                            return ja_routing_type.KEEP;
                                        } else {
                                            //23    Is s-out a cross name match?
                                            ja_log("BC 23", 2);
                                            if(ja_cross_name_match(street_in, tmp_street_out)) {
                                                //24    Is any SN a cross name match?
                                                ja_log("BC 24", 2);
                                                if(ja_cross_name_match(street_in, street_n)) {
                                                    return ja_routing_type.KEEP;
                                                } else {
                                                    return ja_routing_type.BC;
                                                }
                                            } else {
                                                //25    Is any SN a cross name match?
                                                ja_log("BC 25", 2);
                                                if(ja_cross_name_match(street_in, street_n)) {
                                                    return ja_routing_type.KEEP;
                                                } else {
                                                    //26    Does s-in have a primary name?
                                                    ja_log("BC 26", 2);
                                                    if(street_in.primary.name) {
                                                        //27    Is s-out an alternate name match?
                                                        ja_log("BC 27", 2);
                                                        if(ja_alt_name_match(street_in, tmp_street_out)) {
                                                            //28    Is any SN an alternate name match?
                                                            ja_log("BC 28", 2);
                                                            if(ja_alt_name_match(street_in, street_n)) {
                                                                return ja_routing_type.KEEP;
                                                            } else {
                                                                return ja_routing_type.BC;
                                                            }
                                                        } else {
                                                            return ja_routing_type.KEEP;
                                                        }
                                                    } else {
                                                        return ja_routing_type.KEEP;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            ja_log(".............................", 2);
                            ja_log(s_in,2);
                            ja_log(s_in.isHighway(), 2);
                            ja_log(s_out[s_out_id].isHighway(), 2);
                            ja_log(s_out[s_out_id].isRoutable(), 2);
                            ja_log(s_in.model.isLeftHand, 2);
                            //Highway ends, 2(+?) ramps continuing
                            if(s_in.isHighway() && ja_all_ramps(s_out)) {
                                return ja_routing_type.KEEP;
                            }
                            //Continue straight on highway
                            if(s_in.isHighway() && s_out[s_out_id].isHighway() && !s_n[angles[k][1]].isRoutable()) {
                            	return ja_routing_type.BC;
                            }
                            //Highway -> ramp
                            if(s_in.isHighway() && !s_out[s_out_id].isRoutable()) {
                                //Exit right on RHD, left on LHD
                                if(s_in.model.isLeftHand ? (angle > 0 ) : (angle < 0)) {
                                    return ja_routing_type.EXIT;
                                }
                            }
                            return ja_routing_type.KEEP;
                        }
                    }
                }
                ja_log("\"straight\": no instruction", 2);
                return ja_routing_type.BC;
            } else if(Math.abs(angle) <= 46) {
                ja_log("Angle is in gray zone 44-46", 2);
                return ja_routing_type.PROBLEM;
            } else {
                ja_log("Normal turn", 2);
                return ja_routing_type.TURN; //Normal turn (left|right)
            }
        }
        ja_log("No matching turn instruction logic", 2);
        return ja_routing_type.TURN; //default
    }

    function ja_is_turn_allowed(s_from, via_node, s_to) {
        ja_log("Allow from " + s_from.attributes.id + " to " + s_to.attributes.id + " via " + via_node.attributes.id + "?"
            + via_node.isTurnAllowedBySegDirections(s_from, s_to), 2);

        return via_node.isTurnAllowedBySegDirections(s_from, s_to);
    }

    function ja_calculate() {
        ja_log(window.Waze.map, 3);
        if(typeof ja_mapLayer === 'undefined') { return 1;}
        //clear old info
        ja_mapLayer.destroyFeatures();

        //try to show all angles for all selected segments
        if (window.Waze.selectionManager.selectedItems.length == 0) return 1;
        ja_log("Checking junctions for " + window.Waze.selectionManager.selectedItems.length + " segments", 2);
        var ja_nodes = [];

        for (i = 0; i < window.Waze.selectionManager.selectedItems.length; i++) {
            ja_log(window.Waze.selectionManager.selectedItems[i], 3);
            switch (window.Waze.selectionManager.selectedItems[i].model.type) {
                case "node":
                    ja_nodes.push(window.Waze.selectionManager.selectedItems[i].model.attributes.id);
                    break;
                case "segment":
                    //segments selected?
                    if (window.Waze.selectionManager.selectedItems[i].model.attributes.fromNodeID != null &&
                        ja_nodes.indexOf(window.Waze.selectionManager.selectedItems[i].model.attributes.fromNodeID) == -1) {
                        ja_nodes.push(window.Waze.selectionManager.selectedItems[i].model.attributes.fromNodeID);
                    }
                    if (ja_nodes.indexOf(window.Waze.selectionManager.selectedItems[i].model.attributes.toNodeID != null &&
                        ja_nodes.indexOf(window.Waze.selectionManager.selectedItems[i].model.attributes.toNodeID) == -1)) {
                        ja_nodes.push(window.Waze.selectionManager.selectedItems[i].model.attributes.toNodeID);
                    }
                    break;
                case "venue":
                    break;
                default:
                    ja_log("Found unknown item type: " + window.Waze.selectionManager.selectedItems[i].model.type, 2);
                    break;
            }
            ja_log(ja_nodes, 2);
        }

        ja_features = [];

        for (i = 0; i < ja_nodes.length; i++) {
            node = window.Waze.model.nodes.get(ja_nodes[i]);
            if (node == null || !node.hasOwnProperty('attributes')) {
                //Oh oh.. should not happen? We want to use a node that does not exist
                ja_log("Oh oh.. should not happen?",2);
                ja_log(node, 2);
                ja_log(ja_nodes[i], 2);
                //ja_log(ja_nodes, 2);
                ja_log(window.Waze.model, 3);
                ja_log(window.Waze.model.nodes, 3);
                continue;
            }
            //check connected segments
            var ja_current_node_segments = node.attributes.segIDs;
            ja_log(node, 2);

            //ignore of we have less than 2 segments
            if (ja_current_node_segments.length <= 1) {
                ja_log("Found only " + ja_current_node_segments.length + " connected segments at " + ja_nodes[i] + ", not calculating anything...", 2);
                continue;
            }

            ja_log("Calculating angles for " + ja_current_node_segments.length + " segments", 2);

            var angles = [];
            var ja_selected_segments_count = 0;
            var ja_selected_angles = [];

            for (j = 0; j < ja_current_node_segments.length; j++) {
                s = window.Waze.model.segments.objects[ja_current_node_segments[j]];
                if(typeof s === 'undefined') {
                    //Meh. Something went wrong, and we lost track of the segment. This needs a proper fix, but for now
                    // it should be sufficient to just restart the calculation
                    ja_log("Failed to read segment data from model. Restarting calculations.", 1);
                    if(ja_last_restart == 0) {
                        ja_last_restart = new Date().getTime();
                        setTimeout(ja_calculate, 500);
                    }
                    return 4;
                }
                a = ja_getAngle(ja_nodes[i], s);
                ja_log("j: " + j + "; Segment " + ja_current_node_segments[j] + " angle is " + a, 2);
                angles[j] = [a, ja_current_node_segments[j], s != null ? s.isSelected() : false];
                if (s != null ? s.isSelected() : false) {
                    ja_selected_segments_count++;
                }

            }

            //make sure we have the selected angles in correct order
            ja_log(ja_current_node_segments, 3);
            window.Waze.selectionManager.selectedItems.forEach(function (selectedSegment, selectedIndex, selectedItems) {
                var selectedSegmentId = selectedSegment.model.attributes.id;
                ja_log("Checking if " + selectedSegmentId + " is in current node", 3);
                if(ja_current_node_segments.indexOf(selectedSegmentId) >= 0) {
                    ja_log("It is!", 3);
                    //find the angle
                    for(j=0; j < angles.length; j++) {
                        if(angles[j][1] == selectedSegmentId) {
                            ja_selected_angles.push(angles[j]);
                            break;
                        }
                    }
                } else {
                    ja_log("It's not..", 3);
                }
            });


            ja_log(angles, 3);

            var ja_label_distance;
            switch (window.Waze.map.zoom) {
                case 9:
                    ja_label_distance = 4;
                    break;
                case 8:
                    ja_label_distance = 8;
                    break;
                case 7:
                    ja_label_distance = 15;
                    break;
                case 6:
                    ja_label_distance = 25;
                    break;
                case 5:
                    ja_label_distance = 40;
                    break;
                case 4:
                    ja_label_distance = 80;
                    break;
                case 3:
                    ja_label_distance = 140;
                    break;
                case 2:
                    ja_label_distance = 300;
                    break;
                case 1:
                    ja_label_distance = 400;
                    break;
            }

            ja_label_distance = ja_label_distance * (1+(ja_getOption("decimals") > 0 ? 0.2*ja_getOption("decimals") : 0));

            ja_log("zoom: " + window.Waze.map.zoom + " -> distance: " + ja_label_distance, 2);

            var a, ha;
            //if we have two connected segments selected, do some magic to get the turn angle only =)
            if (ja_selected_segments_count == 2) {
                ja_extra_space_multiplier = 1;

                a = ja_angle_diff(ja_selected_angles[0][0], ja_selected_angles[1][0], false);

                ha = (parseFloat(ja_selected_angles[0][0]) + parseFloat(ja_selected_angles[1][0]))/2;
                if(
                    (Math.abs(ja_selected_angles[0][0]) + Math.abs(ja_selected_angles[1][0])) > 180
                && (
                        (ja_selected_angles[0][0] < 0 && ja_selected_angles[1][0] > 0)
                        || (ja_selected_angles[0][0] > 0 && ja_selected_angles[1][0] < 0))
                    ) ha += 180;

                if (Math.abs(a) > 120) {
                    ja_log("Sharp angle", 2);
                    ja_extra_space_multiplier = 2;
                }

                //Move point a bit if it's on the top (Bridge icon will obscure it otherwise)
                if(ha > 40 && ha < 120) ja_extra_space_multiplier = 2;


                ja_log("Angle between " + ja_selected_angles[0][1] + " and " + ja_selected_angles[1][1] + " is " + a + " and position for label should be at " + ha, 2);

                //Guess some routing instructions based on segment types, angles etc
                var ja_junction_type = ja_routing_type.TURN; //Default to old behavior
                if(ja_getOption("guess")) {
                    ja_log(ja_selected_angles, 2);
                    ja_log(angles, 2);
                    ja_junction_type = ja_guess_routing_instruction(node, ja_selected_angles[0][1], ja_selected_angles[1][1], angles);
                    ja_log("Type is: " + ja_junction_type, 2);
                }
                //put the angle point
                ja_features.push(new window.OpenLayers.Feature.Vector(
                    new window.OpenLayers.Geometry.Point(
                        node.geometry.x + (ja_extra_space_multiplier * ja_label_distance * Math.cos((ha * Math.PI) / 180)),
                        node.geometry.y + (ja_extra_space_multiplier * ja_label_distance * Math.sin((ha * Math.PI) / 180))
                    )
                    , { angle: (a>0?"<":"") + ja_round(Math.abs(a)) + "°" + (a<0?">":""), ja_type: ja_junction_type }
                ));
            }
            else {
                //sort angle data (ascending)
                angles.sort(function (a, b) {
                    return a[0] - b[0]
                });
                ja_log(angles, 3);
                ja_log(ja_selected_segments_count, 3);

                //get all segment angles
                for (j = 0; j < angles.length; j++) {
                    a = (360 + (angles[(j + 1) % angles.length][0] - angles[j][0])) % 360;
                    ha = (360 + ((a / 2) + angles[j][0])) % 360;

                    //Show only one angle for nodes with only 2 connected segments and a single selected segment
                    // (not on both sides). Skipping the one > 180
                    if (ja_selected_segments_count == 1
                        && angles.length == 2
                        && (Math.abs(a) > 180
                            || (Math.abs(a)%180 == 0 && j == 0 )
                            )
                        ) {
                        ja_log("Skipping marker, as we need only one of them", 2);
                    } else {
                        ja_log("Angle between " + angles[j][1] + " and " + angles[(j + 1) % angles.length][1] + " is " + a + " and position for label should be at " + ha, 3);
                        //push the angle point
                        ja_features.push(new window.OpenLayers.Feature.Vector(
                            new window.OpenLayers.Geometry.Point(
                                    node.geometry.x + (ja_label_distance * Math.cos((ha * Math.PI) / 180)), node.geometry.y + (ja_label_distance * Math.sin((ha * Math.PI) / 180))
                            )
                            , { angle: ja_round(a) + "°", ja_type: "generic" }
                        ));
                    }
                }
            }
        }

        ja_log(ja_features, 2);
        //Update the displayed angles
        ja_mapLayer.addFeatures(ja_features);
        ja_last_restart = 0;
    }

    function ja_points_equal(point1, point2) {
        return (point1.x == point2.x && point1.y == point2.y);
    }

    function ja_get_first_point(segment) {
        return segment.geometry.components[0];
    }

    function ja_get_last_point(segment) {
        return segment.geometry.components[segment.geometry.components.length - 1];
    }

    function ja_get_second_point(segment) {
        return segment.geometry.components[1];
    }

    function ja_get_next_to_last_point(segment) {
        return segment.geometry.components[segment.geometry.components.length - 2];
    }

    //get the absolute angle for a segment end point
    function ja_getAngle(ja_node, ja_segment) {
        ja_log("node: " + ja_node, 2);
        ja_log("segment: " + ja_segment, 2);
        if (ja_node == null || ja_segment == null) return null;
        if (ja_segment.attributes.fromNodeID == ja_node) {
            ja_dx = ja_get_second_point(ja_segment).x - ja_get_first_point(ja_segment).x;
            ja_dy = ja_get_second_point(ja_segment).y - ja_get_first_point(ja_segment).y;
        } else {
            ja_dx = ja_get_next_to_last_point(ja_segment).x - ja_get_last_point(ja_segment).x;
            ja_dy = ja_get_next_to_last_point(ja_segment).y - ja_get_last_point(ja_segment).y;
        }
        ja_log(ja_node + " / " + ja_segment + ": dx:" + ja_dx + ", dy:" + ja_dy, 2);
        ja_angle = Math.atan2(ja_dy, ja_dx);
        return ((ja_angle * 180 / Math.PI)) % 360;
    }
	
    /**
     * Decimal adjustment of a number. Borrowed (with some modifications) from
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round
     * ja_round(55.55, -1); // 55.6
     * ja_round(55.549, -1); // 55.5
     * ja_round(55, 1); // 60
     * ja_round(54.9, 1); // 50
     *
     * @param	{String}	type	The type of adjustment.
     * @param	{Number}	value	The number.
     * @param	{Integer}	exp		The exponent (the 10 logarithm of the adjustment base).
     * @returns	{Number}			The adjusted value.
     */
    function ja_round(value) {
        // If the exp is undefined or zero...
		var ja_rounding = -parseInt(ja_getOption("decimals"));
        if (typeof ja_rounding === 'undefined' || +ja_rounding === 0) {
            return Math.round(value);
        }
        value = +value;
        // If the value is not a number or the exp is not an integer...
        if (isNaN(value) || !(typeof ja_rounding === 'number' && ja_rounding % 1 === 0)) {
            return NaN;
        }
        // Shift
        value = value.toString().split('e');
        value = Math.round(+(value[0] + 'e' + (value[1] ? (+value[1] - ja_rounding) : -ja_rounding)));
        // Shift back
        value = value.toString().split('e');
        return +(value[0] + 'e' + (value[1] ? (+value[1] + ja_rounding) : ja_rounding));
    }

    var ja_options = {};

    function ja_getOption(name) {
        ja_log("Loading option: " + name, 2);
        if(!ja_options.hasOwnProperty(name) || typeof ja_options[name] === 'undefined') {
            ja_options[name] = ja_settings[name]['defaultValue'];
        }
		
        ja_log("Got value: " + ja_options[name], 2);
        return ja_options[name];
    }

    function ja_setOption(name, val) {
        ja_options[name] = val;
        if(localStorage) {
            localStorage.setItem("wme_ja_options", JSON.stringify(ja_options));
        }
        ja_log(ja_options,3);
    }

    var ja_load = function loadJAOptions() {
        ja_log("Should load settings now.", 2);
        if(localStorage != null) {
            ja_log("We have local storage! =)",2);
            try {
                ja_options = JSON.parse(localStorage.getItem("wme_ja_options"));
            } catch (e){
                ja_log("Loading settings failed.. " + e.message, 2);
                ja_options = null;
            }
        }
        if(ja_options == null) {
            ja_reset();
        } else {
            ja_log(ja_options, 2);
            setTimeout(ja_apply, 500);
        }
    };

    ja_save = function saveJAOptions() {
        ja_log("Saving settings", 2);
        Object.getOwnPropertyNames(ja_settings).forEach(function (a,b,c) {
            var setting = ja_settings[a];
            ja_log(setting, 2);
            switch (setting['elementType']) {
                case "checkbox":
                    ja_setOption(a, document.getElementById(setting['elementId']).checked);
                    break;
                case "color":
					var re = /^#[0-9a-f]{6}$/;
					if(re.test(document.getElementById(setting['elementId']).value)) {
						ja_setOption(a, document.getElementById(setting['elementId']).value);
					} else {
						ja_setOption(a, ja_settings[a]['default']);
					}
					break;
                case "number":
					var val = document.getElementById(setting['elementId']).value;
					if(!isNaN(val) && val == parseInt(val) && val >= setting['min'] && val <= setting['max']) {
						ja_setOption(a, document.getElementById(setting['elementId']).value);
					} else {
						ja_setOption(a, ja_settings[a]['default']);
					}
					break;
                case "text":
					ja_setOption(a, document.getElementById(setting['elementId']).value);
                    break;
            }
        });
        ja_apply();
        return false;
    };

    var ja_apply = function applyJAOptions() {
        ja_log("Applying stored (or default) settings", 2);
        if(typeof window.Waze.map.getLayersBy("uniqueName","junction_angles")[0] === 'undefined') {
            ja_log("WME not ready yet, trying again in 400 ms", 2);
            setTimeout(ja_apply, 400);
            return;
        }
        if(document.getElementById("sidepanel-ja") != null) {
            ja_log(Object.getOwnPropertyNames(ja_settings), 2);
            Object.getOwnPropertyNames(ja_settings).forEach(function (a,b,c) {
                var setting = ja_settings[a];
                ja_log(a, 2);
                ja_log(setting, 2);
                ja_log(document.getElementById(setting['elementId']), 2);
                switch (setting['elementType']) {
                    case "checkbox":
                        document.getElementById(setting['elementId']).checked = ja_getOption(a);
                        break;
                    case "color":
                    case "number":
                    case "text":
                        document.getElementById(setting['elementId']).value = ja_getOption(a);
                        break;
                }
            });
        } else {
            ja_log("WME not ready (no settings tab)", 2);
        }
        window.Waze.map.getLayersBy("uniqueName","junction_angles")[0].styleMap = ja_style();

        ja_log(ja_options, 2);
    };

    ja_reset = function resetJAOptions() {
        ja_log("Resetting settings", 2);
        if(localStorage != null) {
            localStorage.removeItem("wme_ja_options");
        }
        ja_options = {};
        ja_apply();
    };
	
	function ja_getMessage(key) {
		return I18n.translate('ja.' + key);
	}
	
	function ja_loadTranslations() {
		ja_log("Loading translations",2);
		I18n.translations[window.I18n.defaultLocale].ja = {};
		def = I18n.translations[window.I18n.defaultLocale].ja;
		sv = {};
		fi = {};
		//Default language (English)
		def["name"] = "Junction Angles";
		def["settingsTitle"] = "Junction Angle settings";
		def["apply"] = "Apply";
		def["resetToDefault"] = "Reset to default";
        def["guess"] = "Estimate routing instructions";
        def["noInstructionColor"] = "Color for best continuation";
        def["keepInstructionColor"] = "Color for keep prompt";
        def["exitInstructionColor"] = "Color for exit prompt";
        def["turnInstructionColor"] = "Color for turn prompt";
        def["problemColor"] = "Color for angles to avoid";
        def["decimals"] = "Number of decimals";
        def["pointSize"] = "Base point size";

		//Finnish (Suomi)
		fi["name"] = "Risteyskulmat";
		fi["settingsTitle"] = "Rysteyskulmien asetukset";
		fi["apply"] = "Aseta";
		fi["resetToDefault"] = "Palauta";
        fi["guess"] = "Arvioi reititysohjeet";
        fi["noInstructionColor"] = "ohjeeton \"Suora\"-väri";
        fi["keepInstructionColor"] = "\"Poistu\"-ohjeen väri";
        fi["exitInstructionColor"] = "\"poistu\"-ohjeen väri";
        fi["turnInstructionColor"] = "\"Käänny\"-ohjeen väri";
        fi["problemColor"] = "Vältettävien kulmien väri";
        fi["decimals"] = "Desimaalien määrä";
        fi["pointSize"] = "Ympyrän peruskoko";

		//Swedish (Svenska)
		sv["name"] = "Korsningsvinklar";
		sv["settingsTitle"] = "Inställningar för korsningsvinklar";
		sv["apply"] = "Godkänn";
		sv["resetToDefault"] = "Återställ";
        sv["guess"] = "Gissa navigeringsinstruktioner";
        sv["noInstructionColor"] = "Färg för \"ingen instruktion\"";
        sv["keepInstructionColor"] = "Färg för\"håll höger/vänster\"-instruktion";
        sv["exitInstructionColor"] = "Färg för \"ta av\"-instruktion";
        sv["turnInstructionColor"] = "Färg för \"sväng\"-instruktion";
        sv["problemColor"] = "Färg för vinklar att undvika";
        sv["decimals"] = "Decimaler";
        sv["pointSize"] = "Cirkelns basstorlek";
		
		//Apply
		switch (I18n.locale) {
			case 'sv':
				I18n.translations['sv'].ja = sv;
				break;
			case 'fi':
				I18n.translations['fi'].ja = fi;
				break;
		}
	}

    ja_bootstrap();

}

//Dynamically create, add and run the script in the real page context
var DLscript = document.createElement("script");
DLscript.textContent = '' +
    run_ja.toString() + ' \n' +
    'run_ja();';
DLscript.setAttribute("type", "application/javascript");
document.body.appendChild(DLscript);
