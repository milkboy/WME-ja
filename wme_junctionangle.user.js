// ==UserScript==
// @name                WME Junction Angle info
// @namespace           http://userscripts.org/users/508112
// @description         Show the angle between two selected (and connected) segments
// @include             /^https:\/\/(www|editor-beta)\.waze\.com\/(.{2,6}\/)?editor\/.*$/
// @updateURL           https://userscripts.org/scripts/source/160864.user.js
// @version             1.6
// @grant               none
// @copyright			2013 Michael Wikberg <michael@wikberg.fi>
// @license				CC-BY-NC-SA
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

    var junctionangle_version = "1.6";
    var junctionangle_debug = 1;	//0: no output, 1: basic info, 2: debug 3: crazy debug
    var $;
    var ja_features = [];
    var ja_rounding = 0; //number of digits to round: -2 -> xx.yy, 0-> xx, 2->x00

    var ja_last_restart = 0;

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
                console.log(ja_log_msg);
            }
            else {
                console.log("WME Junction Angle: " + ja_log_msg);
            }
        }
    }

    /**
     * Make some style settings
     */
    function ja_style() {
        var ja_style = new window.OpenLayers.Style({
            fillColor: "#ffcc88",
            strokeColor: "#ff9966",
            strokeWidth: 2,
            label: "${angle}",
            fontWeight: "bold",
            pointRadius: 10 + (ja_rounding < 0 ? 4 * -ja_rounding : 0),
            fontSize: "10px"
        }, {
            rules: [
                new window.OpenLayers.Rule({
                    symbolizer: {
                    }
                }),
                new window.OpenLayers.Rule({
                    filter: new window.OpenLayers.Filter.Comparison({
                        type: window.OpenLayers.Filter.Comparison.EQUAL_TO,
                        property: "ja_type",
                        value: "junction"
                    }),
                    symbolizer: {
                        pointRadius: 13 + (ja_rounding < 0 ? 4 * -ja_rounding : 0),
                        fontSize: "12px",
                        fillColor: ja_getOption("turnInstructionColor"),
                        strokeColor: "#183800"
                    }
                }),
                new window.OpenLayers.Rule({
                    filter: new window.OpenLayers.Filter.Comparison({
                        type: window.OpenLayers.Filter.Comparison.EQUAL_TO,
                        property: "ja_type",
                        value: "junction_none"
                    }),
                    symbolizer: {
                        pointRadius: 13 + (ja_rounding < 0 ? 4 * -ja_rounding : 0),
                        fontSize: "12px",
                        fillColor: ja_getOption("noInstructionColor"), //pale blue
                        strokeColor: "#183800"
                    }
                }),
                new window.OpenLayers.Rule({
                    filter: new window.OpenLayers.Filter.Comparison({
                        type: window.OpenLayers.Filter.Comparison.EQUAL_TO,
                        property: "ja_type",
                        value: "junction_keep"
                    }),
                    symbolizer: {
                        pointRadius: 13 + (ja_rounding < 0 ? 4 * -ja_rounding : 0),
                        fontSize: "12px",
                        fillColor: ja_getOption("keepInstructionColor"), //pale blue
                        strokeColor: "#183800"
                    }
                }),
                new window.OpenLayers.Rule({
                    filter: new window.OpenLayers.Filter.Comparison({
                        type: window.OpenLayers.Filter.Comparison.EQUAL_TO,
                        property: "ja_type",
                        value: "junction_exit"
                    }),
                    symbolizer: {
                        pointRadius: 13 + (ja_rounding < 0 ? 4 * -ja_rounding : 0),
                        fontSize: "12px",
                        fillColor: ja_getOption("exitInstructionColor"), //pale blue
                        strokeColor: "#183800"
                    }
                }),
                new window.OpenLayers.Rule({
                    filter: new window.OpenLayers.Filter.Comparison({
                        type: window.OpenLayers.Filter.Comparison.EQUAL_TO,
                        property: "ja_type",
                        value: "junction_problem"
                    }),
                    symbolizer: {
                        pointRadius: 13 + (ja_rounding < 0 ? 4 * -ja_rounding : 0),
                        fontSize: "12px",
                        fillColor: ja_getOption("problemColor"),
                        strokeColor: "#183800"
                    }
                })

            ]
        });
        return ja_style;
    }

    function junctionangle_init() {
        //Load saved settings (if any)
        ja_load();


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

        /*
        //Testing
        window.Waze.map.events.on({
            "zoomend": ja_calculate
        });
        */

        //HTML changes after login, even though the page is not reloaded. Better do init again.
        window.Waze.loginManager.events.register("afterloginchanged", null, junctionangle_init);

        //Skipping for now, as changes must be saved manually anyway //window.addEventListener("beforeunload", ja_save, false);

        /**
         * Add config setting
         */
        var ja_settings = document.createElement("section");
        ja_settings.innerHTML = "Junction Angle settings (please be careful, as no validation is performed yet)";

        var section = document.createElement('p');
        section.style.paddingTop = "8px";
        section.style.textIndent = "16px";
        section.id = "jaOptions";
        section.innerHTML  = '<hr />'
            + '<input type="text" size="2" maxlength="2" id="_jaTbDecimals" /> Number of decimals<br>'
            + '<input type="checkbox" id="_jaCbGuessRouting" /> Guess navigation prompts<br>'
            + '<input type="text" size="8" maxlength="7" id="_jaTbNoInstructionColor" /> Color for no instruction<br>'
            + '<input type="text" size="8" maxlength="7" id="_jaTbKeepInstructionColor" /> Color for keep instruction<br>'
            + '<input type="text" size="8" maxlength="7" id="_jaTbExitInstructionColor" /> Color for exit instruction<br>'
            + '<input type="text" size="8" maxlength="7" id="_jaTbTurnInstructionColor" /> Color for normal turn<br>'
            + '<input type="text" size="8" maxlength="7" id="_jaTbProblemColor" /> Color for angles to avoid<br>'
            + '<br /><input type="submit" value="Apply" onclick="return ja_save();"> </input>'
            + '<input type="submit" value="Reset to default" onclick="return ja_reset();"> </input>'
        ;
        ja_settings.appendChild(section);

        var userTabs = document.getElementById('user-info');
        var navTabs = document.getElementsByClassName('nav-tabs', userTabs)[0];
        var tabContent = document.getElementsByClassName('tab-content', userTabs)[0];

        ja_settings.id = "sidepanel-ja";
        ja_settings.className = "tab-pane";
        if(tabContent != null)
            tabContent.appendChild(ja_settings);

        jatab = document.createElement('li');
        jatab.innerHTML = '<a href="#sidepanel-ja" data-toggle="tab">JAI</a>';
        if(navTabs != null)
            navTabs.appendChild(jatab);

        //Add support for translations. Default (and fallback) is "en".
        //Note, don't make typos in "acceleratorName", as it has to match the layer name (with whitespace removed
        // to actually work. Took me a while to figure that out...
        I18n.translations.en.layers.name["junction_angles"] = "Junction Angles";

        switch(window.I18n.locale) {
            case 'sv':
                I18n.translations.sv.layers.name["junction_angles"] = "Korsningsvinklar";
                break;
            case 'fi':
                I18n.translations.fi.layers.name["junction_angles"] = "Risteyskulmat";
                break;
        }

        ja_layername = I18n.translate("layers.name.junction_angles","bar");

        //try to see if we already have a layer
        if (window.Waze.map.getLayersBy("uniqueName","junction_angles").length == 0) {

            // Create a vector layer and give it your style map.
            ja_mapLayer = new window.OpenLayers.Layer.Vector(ja_layername, {
                displayInLayerSwitcher: true,
                uniqueName: "junction_angles",
                shortcutKey: "S+j",
                accelerator: "toggle" + ja_layername.replace(/\s+/g,''),
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
    }

    function ja_get_streets(segmentId) {
        ja_log(window.Waze, 1);
        var primary = window.Waze.model.streets.objects[window.Waze.model.segments.objects[segmentId].attributes.primaryStreetID];
        var secondary = new Array();
        window.Waze.model.segments.objects[segmentId].attributes.streetIDs.forEach(function asd(element, index, array) {
            secondary.push(window.Waze.model.streets.objects[element]);
        });
        ja_log(primary, 2);
        ja_log(secondary, 2);
        return { primary: primary, secondary: secondary };
    }

    function ja_primary_name_and_type_match(street_in, streets) {
        return Object.getOwnPropertyNames(streets).some(function (id, index, array) {
            ja_log("PNT Checking element " + index, 2);
            ja_log(id, 2);
            return (streets[id].primary.name == street_in.primary.name
                && streets[id].primary.type == street_in.primary.type);
        });
    }

    function ja_primary_name_match(street_in, streets) {
        return Object.getOwnPropertyNames(streets).some(function (id, index, array) {
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
            street_n_element = streets[street_n_id];
            ja_log("AN alt name check: Checking element " + index, 2);
            ja_log(street_n_element, 2);
            return street_in.secondary.some(function (street_in_secondary, index2, array2) {
                ja_log("AN2 checking element " + index2, 2);
                ja_log(street_in_secondary, 2);
                return street_n_secondary.some(function (street_n_secondary_element, index3,  array3) {
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
        ja_log("AAAAAAAA", 2);
        ja_log(segment_in, 2);
        ja_log(segments, 2);
        //ja_log(window.Waze.model.segments, 2);

        //        return Object.getOwnPropertyNames(segments_ids).some(function (segment_n_id, index, array) {
        return segments.some(function (segment_n, index, array) {
            ja_log("PT Checking element " + index, 2);
            ja_log(segment_n, 2);
            if(segment_n.attributes.id == segment_in.attributes.id) return false;
            ja_log("PT checking sn.rt " + segment_n.attributes.roadType +
                " vs i.pt: " + segment_in.attributes.roadType, 2);
            return (segment_n.attributes.roadType == segment_in.attributes.roadType);
        });
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
        ja_log("Guessing instructions",2);
        ja_log(node, 2);
        ja_log(s_in_a, 3);
        ja_log(s_out_a, 3);
        ja_log(angles, 3);

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

        var s_n = {};
        for(k=0; k<node.attributes.segIDs.length; k++) {
            s_n[node.attributes.segIDs[k]] = node.model.segments.objects[node.attributes.segIDs[k]];
        }

        ja_log(s_in_a, 3);
        ja_log(s_out_a, 3);
        ja_log(s_n, 2);

        var angle = (s_out_a[0] - s_in_a[0]) - 180;
        if(angle > 180)
            angle = angle - 360;
        else if(angle < -180)
            angle = angle + 360;

        ja_log("turn angle is: " + angle, 2);
        //No other possible turns
        if(node.attributes.segIDs.length <= 2) {
            ja_log("Only one possible turn", 2);
            return "junction_none";
        } //No instruction
        //Is it a roundabout?
        if(false) {
            ja_log("Roundabout logic", 2);
            //FIXME
        } else {
            if(Math.abs(angle) <= 44) {
                ja_log("Turn is <= 44", 2);
                //other unrestricted <45 turns?
                for(k=0; k< angles.length; k++) {
                    ja_log("Checking angle " + k, 2);
                    ja_log(angles[k],2);
                    ja_log(Math.abs((180 + (angles[k][0] - s_in_a[0])) % 360), 2);
                    if(angles[k][1] != s_in_a[1] && angles[k][1] != s_out_a[1]) {
                        if(Math.abs((180 + (angles[k][0] - s_in_a[0])) % 360) < 45 &&
                            ja_is_turn_allowed(s_n[s_in_a[1]], node, s_n[angles[k][1]])) {
                            ja_log("Found other allowed turn <= 44", 2);
                            return "junction"; //Issue turn (left|right)
                        } else {
                            ja_log("Found other (disallowed) turn <= 44", 2);
                        }
                    }
                }
                ja_log("\"straight\": no instruction", 2);
                return "junction_none";
            } else if(Math.abs(angle) <= 46) {
                ja_log("Angle is in gray zone 44-46", 2);
                return "junction_problem";
            } else {
                ja_log("Normal turn", 2);
                return "junction"; //Normal turn (left|right)
            }
        }
        ja_log("No matching turn instruction logic", 2);
        return "junction"; //default
    }

    function ja_is_turn_allowed(s_from, via_node, s_to) {
        ja_log("Allow from " + s_from.attributes.id + " to " + s_to.attributes.id + " via " + node.attributes.id + "?"
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
            segments = node.attributes.segIDs;
            ja_log(node, 2);

            //ignore of we have less than 2 segments
            if (segments.length <= 1) {
                ja_log("Found only " + segments.length + " connected segments at " + ja_nodes[i] + ", not calculating anything...", 2);
                continue;
            }

            ja_log("Calculating angles for " + segments.length + " segments", 2);

            angles = [];
            selected_segments = 0;

            for (j = 0; j < segments.length; j++) {
                s = window.Waze.model.segments.objects[segments[j]];
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
                ja_log("j: " + j + "; Segment " + segments[j] + " angle is " + a, 2);
                angles[j] = [a, segments[j], s != null ? s.isSelected() : false];
                if (s != null ? s.isSelected() : false) selected_segments++;
            }

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

            ja_label_distance = ja_label_distance * (1+(ja_rounding < 0 ? 0.2*-ja_rounding : 0));

            ja_log("zoom: " + window.Waze.map.zoom + " -> distance: " + ja_label_distance, 2);

            //if we have two connected segments selected, do some magic to get the turn angle only =)
            if (selected_segments == 2) {
                ja_selected = [];
                ja_extra_space_multiplier = 1;

                for (j = 0; j < angles.length; j++) {
                    if (angles[j][2]) {
                        ja_selected.push(angles[j]);
                    }
                }
                //ja_selected.reverse();

                a = ((ja_selected[1][0] - ja_selected[0][0]) + 360) % 360;
                ha = (360 + (ja_selected[0][0] + ja_selected[1][0]) / 2) % 360;

                ja_log(a, 3);

                if (a < 60) {
                    ja_log("Sharp angle", 2);
                    ja_extra_space_multiplier = 2;
                }

                if (a > 180) {
                    ha = (ha + 180) % 360;
                }

                //Move point a bit if it's on the top (Bridge icon will obscure it otherwise)
                if(ha > 40 && ha < 120) ja_extra_space_multiplier = 2;


                ja_log("Angle between " + ja_selected[0][1] + " and " + ja_selected[1][1] + " is " + a + " and position for label should be at " + ha, 2);

                //Guess some routing instructions based on segment types, angles etc
                var ja_junction_type = "junction";
                if(ja_getOption("guess")) {
                    ja_log(ja_selected, 1);
                    ja_junction_type = ja_guess_routing_instruction(node, ja_selected[0][1], ja_selected[1][1], angles);
                    ja_log("Type is: " + ja_junction_type, 3);
                }
                //put the angle point
                ja_features.push(new window.OpenLayers.Feature.Vector(
                    new window.OpenLayers.Geometry.Point(
                        node.geometry.x + (ja_extra_space_multiplier * ja_label_distance * Math.cos((ha * Math.PI) / 180)),
                        node.geometry.y + (ja_extra_space_multiplier * ja_label_distance * Math.sin((ha * Math.PI) / 180))
                    )
                    , { angle: ja_round(Math.abs(180 - a)) + "°", ja_type: ja_junction_type }
                ));
            }
            else {
                //sort angle data (ascending)
                angles.sort(function (a, b) {
                    return a[0] - b[0]
                });
                ja_log(angles, 3);
                ja_log(selected_segments, 3);

                //get all segment angles
                for (j = 0; j < angles.length; j++) {
                    a = (360 + (angles[(j + 1) % angles.length][0] - angles[j][0])) % 360;
                    ha = (360 + ((a / 2) + angles[j][0])) % 360;

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
        if (typeof ja_rounding === 'undefined' || +ja_rounding === 0) {
            return Math.round(value);
        }
        value = +value;
        ja_rounding = +ja_rounding;
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

    function ja_getOption(name, defaultValue) {
        if(!(name in ja_options)) {
            ja_options[name] = defaultValue;
        }
        return ja_options[name];
    }

    function ja_setOption(name, val) {
        ja_options[name] = val;
        if(localStorage) {
            localStorage.setItem("wme_ja_options", JSON.stringify(ja_options));
        }
        ja_log(ja_options,3);
    }

    ja_load = function loadJAOptions() {
        ja_log("Should load settings now.", 2);
        if(localStorage != null) {
            ja_log("We have local storage! =)",2);
            ja_options = JSON.parse(localStorage.getItem("wme_ja_options"));
        }
        ja_log(ja_options, 2);
        if(ja_options == null) {
            ja_options = { };
        } else {
        }
    };

    ja_save = function saveJAOptions() {
        ja_setOption("guess", document.getElementById("_jaCbGuessRouting").checked);
        ja_setOption("noInstructionColor", document.getElementById("_jaTbNoInstructionColor").value);
        ja_setOption("keepInstructionColor", document.getElementById("_jaTbKeepInstructionColor").value);
        ja_setOption("exitInstructionColor", document.getElementById("_jaTbExitInstructionColor").value);
        ja_setOption("turnInstructionColor", document.getElementById("_jaTbTurnInstructionColor").value);
        ja_setOption("problemColor", document.getElementById("_jaTbProblemColor").value);
        ja_setOption("decimals", -document.getElementById("_jaTbDecimals").value);
        ja_apply();
        return false;
    };

    ja_apply = function applyJAOptions() {
        if(document.getElementById("_jaCbGuessRouting") != null) {
            document.getElementById("_jaCbGuessRouting").checked = ja_getOption("guess", false);
            document.getElementById("_jaTbNoInstructionColor").value = ja_getOption("noInstructionColor", "#ffffff");
            document.getElementById("_jaTbKeepInstructionColor").value = ja_getOption("keepInstructionColor", "#aeff3b");
            document.getElementById("_jaTbExitInstructionColor").value = ja_getOption("exitInstructionColor", "#6cb5ff");
            document.getElementById("_jaTbTurnInstructionColor").value = ja_getOption("turnInstructionColor", "#4cc600");
            document.getElementById("_jaTbProblemColor").value = ja_getOption("problemColor", "#a0a0a0");
            document.getElementById("_jaTbDecimals").value = -ja_getOption("decimals", 0);
        }
        ja_rounding = ja_getOption("decimals", 0);
        window.Waze.map.getLayersBy("uniqueName","junction_angles")[0].styleMap = ja_style();
    };

    ja_reset = function resetJAOptions() {
        if(localStorage != null) {
            localStorage.setItem("wme_ja_options","");
        }
        ja_options = {};
        ja_apply();
    };

    ja_bootstrap();

}

//Dynamically create, add and run the script in the real page context
var DLscript = document.createElement("script");
DLscript.textContent = '' +
    run_ja.toString() + ' \n' +
    'run_ja();';
DLscript.setAttribute("type", "application/javascript");
document.body.appendChild(DLscript);
