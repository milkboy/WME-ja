// ==UserScript==
// @name				WME Junction Angle Info (development version)
// @namespace			https://github.com/milkboy/WME-ja
// @description			Show the angle between two selected (and connected) segments
// @include				/^https:\/\/(www|editor-beta)\.waze\.com\/(.{2,6}\/)?editor\/.*$/
// @updateURL			https://github.com/milkboy/WME-ja/raw/master/wme_junctionangle.user.js
// @version				1.9.0-b1
// @grant				none
// @copyright			2015 Michael Wikberg <waze@wikberg.fi>
// @license				CC-BY-NC-SA
// ==/UserScript==

/**
 * Copyright 2015 Michael Wikberg <waze@wikberg.fi>
 * WME Junction Angle Info extension is licensed under a Creative Commons
 * Attribution-NonCommercial-ShareAlike 3.0 Unported License.
 *
 * Contributions by:
 *	2014 Paweł Pyrczak "tkr85" <support@pyrczak.pl>
 *	2014 "AlanOfTheBerg" <alanoftheberg@gmail.com>
 *	2014 "berestovskyy" <?>
 *	2015 "FZ69617" <?>
 *	2015 "wlodek76" <?>
 */

function run_ja() {

	/*
	 * First some variable and enumeration definitions
	 */
	var junctionangle_version = "1.9.0-b1";
	var junctionangle_debug = 1;	//0: no output, 1: basic info, 2: debug 3: verbose debug, 4: insane debug
	var $;

	var ja_last_restart = 0;
	var ja_roundabout_points = [];
	var ja_options = {};

	var ja_routing_type = {
		BC: "junction_none",
		KEEP: "junction_keep",
		KEEP_LEFT: "junction_keep_left",
		KEEP_RIGHT: "junction_keep_right",
		TURN: "junction",
		EXIT: "junction_exit", //UNUSED? FZ69617: now we have a display logic implemented for it, but currently I cannot predict whether we'll need it or not
		EXIT_LEFT: "junction_exit_left",
		EXIT_RIGHT: "junction_exit_right",
		PROBLEM: "junction_problem",
		ERROR: "junction_error",
		ROUNDABOUT: "junction_roundabout",
		ROUNDABOUT_EXIT: "junction_roundabout_exit"
	};

	var ja_road_type = {
		//Streets
		STREET: 1,
		PRIMARY_STREET: 2,
		//Highways
		RAMP: 4,
		FREEWAY: 3,
		MAJOR_HIGHWAY: 6,
		MINOR_HIGHWAY: 7,
		//Other drivable
		DIRT_ROAD: 8,
		FERRY: 14,
		PRIVATE_ROAD: 17,
		PARKING_LOT_ROAD: 20,
		//Non-drivable
		WALKING_TRAIL: 5,
		PEDESTRIAN_BOARDWALK: 10,
		STAIRWAY: 16,
		RAILROAD: 18,
		RUNWAY: 19
	};

	var ja_vehicle_types = {
		TRUCK: 1,
		PUBLIC: 2,
		TAXI: 4,
		BUS: 8,
		HOV2: 16,
		HOV3: 32,
		RV: 64,
		TOWING: 128,
		MOTORBIKE: 256,
		PRIVATE: 512,
		HAZ: 1024
	};

	var ja_settings = {
		angleMode: { elementType: "select", elementId: "_jaSelAngleMode", defaultValue: "aDeparture", options: ["aAbsolute", "aDeparture"]},
		angleDisplay: { elementType: "select", elementId: "_jaSelAngleDisplay", defaultValue: "displayFancy", options: ["displayFancy", "displaySimple"]},
		guess: { elementType: "checkbox", elementId: "_jaCbGuessRouting", defaultValue: true },
		noInstructionColor: { elementType: "color", elementId: "_jaTbNoInstructionColor", defaultValue: "#ffffff", group: "guess"},
		keepInstructionColor: { elementType: "color", elementId: "_jaTbKeepInstructionColor", defaultValue: "#cbff84", group: "guess"},
		turnInstructionColor: { elementType: "color", elementId: "_jaTbTurnInstructionColor", defaultValue: "#4cc600", group: "guess"},
		exitInstructionColor: { elementType: "color", elementId: "_jaTbExitInstructionColor", defaultValue: "#6cb5ff", group: "guess"},
		problemColor: { elementType: "color", elementId: "_jaTbProblemColor", defaultValue: "#a0a0a0", group: "guess"},
		roundaboutOverlayDisplay: { elementType: "select", elementId: "_jaSelRoundaboutOverlayDisplay", defaultValue: "rOverNever", options: ["rOverNever","rOverSelected","rOverAlways"]},
		roundaboutColor: { elementType: "color", elementId: "_jaTbRoundaboutColor", defaultValue: "#ff8000", group: "roundaboutOverlayDisplay"},
		roundaboutOverlayColor: { elementType: "color", elementId: "_jaTbRoundaboutOverlayColor", defaultValue: "#aa0000", group: "roundaboutOverlayDisplay"},
		decimals: { elementType: "number", elementId: "_jaTbDecimals", defaultValue: 0, min: 0, max: 2},
		pointSize: { elementType: "number", elementId: "_jaTbPointSize", defaultValue: 12, min: 6, max: 20}
	};


	/*
	 * Main logic functions
	 */
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

		//Recalculate on zoom end also
		window.Waze.map.events.register("zoomend", null, ja_calculate);

		ja_load();
		ja_loadTranslations();

		/**
		 * Add JAI tab configuration options
		 */
		var ja_settings_dom = document.createElement("div");
		var ja_settings_dom_panel = document.createElement("div");
		var ja_settings_dom_content = document.createElement("div");
		ja_settings_dom_panel.className = "side-panel-section";
		ja_settings_dom_content.className = "tab-content";
		var ja_settings_header = document.createElement('h4');
		ja_settings_header.appendChild(document.createTextNode(ja_getMessage("settingsTitle")));
		ja_settings_dom_content.appendChild(ja_settings_header);

		var style = document.createElement('style');
		style.appendChild(document.createTextNode(''
				+ '#jaOptions label { display: inline; }\n'
				+ '#jaOptions input, select { margin-right: 5px; }\n'
		));

		var form = document.createElement('form');
		var section = document.createElement('div');
		section.className = "form-group";
		form.className = "attributes-form side-panel-section";
		section.id = "jaOptions";
		ja_log("---------- Creating settings HTML ----------", 2);
		Object.getOwnPropertyNames(ja_settings).forEach(function (a) {
			var setting = ja_settings[a];
			var ja_controls_container = document.createElement('div');
			var ja_input = document.createElement('input');
			var ja_label = document.createElement('label');
			ja_controls_container.className = "controls-container";
			ja_input.type = setting['elementType'];
			switch (setting['elementType']) {
				case 'color':
					ja_input.id = setting['elementId'];
					ja_controls_container.appendChild(ja_input);
					break;
				case 'number':
					ja_input.id = setting['elementId'];
					ja_input.setAttribute("min", setting['min']);
					ja_input.setAttribute("max", setting['max']);
					ja_controls_container.appendChild(ja_input);
					break;
				/*
				case 'text':
					ja_input.id = setting['elementId'];
					ja_input.size = (setting['max'] ? setting['max'] : 8);
					ja_input.maxlength = (setting['max'] ? setting['max'] : 7);
					ja_controls_container.appendChild(ja_input);
					break;
				*/
				case 'checkbox':
					ja_input.id = setting['elementId'];
					ja_controls_container.appendChild(ja_input);
					break;
				case 'select':
					ja_input = document.createElement('select'); //Override <input> with <select>
					ja_input.id = setting['elementId'];
					for(var i = 0; i < setting["options"].length; i++) {
						var ja_select_option = document.createElement('option');
						ja_select_option.value = setting["options"][i];
						ja_select_option.appendChild(document.createTextNode(ja_getMessage(setting["options"][i])));
						ja_input.appendChild(ja_select_option);
					}
					ja_controls_container.appendChild(ja_input);
					break;
			}

			ja_input.onchange = function() { ja_onchange(this); };

			ja_label.setAttribute("for", setting['elementId']);
			ja_label.appendChild(document.createTextNode(ja_getMessage(a)));
			ja_controls_container.appendChild(ja_label);

			section.appendChild(ja_controls_container);
		});
		section.appendChild(document.createElement('br'));

		var ja_reset_button = document.createElement('button');
		ja_reset_button.type = "button";
		ja_reset_button.className = "btn btn-default";
		ja_reset_button.addEventListener("click", ja_reset, true);
		ja_reset_button.appendChild(document.createTextNode(ja_getMessage("resetToDefault")));

		section.appendChild(ja_reset_button);

		form.appendChild(section);
		ja_settings_dom_content.appendChild(form);

		var userTabs = document.getElementById('user-info');
		var navTabs = userTabs.getElementsByClassName('nav-tabs')[0];
		var tabContent = userTabs.getElementsByClassName('tab-content')[0];

		ja_settings_dom.id = "sidepanel-ja";
		ja_settings_dom.className = "tab-pane";

		ja_settings_dom_content.style.paddingTop = "0";

		ja_settings_dom.appendChild(style);

		ja_settings_dom_panel.appendChild(ja_settings_dom_content);
		ja_settings_dom.appendChild(ja_settings_dom_panel);

		//Add some version info etc
		var ja_info = document.createElement('ul');
		ja_info.className = "list-unstyled -side-panel-section";
		ja_info.style.fontSize = "11px";

		var ja_version_elem = document.createElement('li');
		ja_version_elem.appendChild(document.createTextNode(ja_getMessage("name") + ": v" + junctionangle_version));
		ja_info.appendChild(ja_version_elem);

		//Add some useful links
		ja_info.appendChild(ja_helpLink(
			'https://wiki.waze.com/wiki/Roundabouts/USA#Understanding_navigation_instructions', 'roundaboutnav')
		);
		ja_info.appendChild(ja_helpLink('https://github.com/milkboy/WME-ja/issues', 'ghissues'));

		ja_settings_dom.appendChild(ja_info);

		tabContent.appendChild(ja_settings_dom);

		var jatab = document.createElement('li');
		jatab.innerHTML = '<!--suppress HtmlUnknownAnchorTarget --><a href="#sidepanel-ja" data-toggle="tab">JAI</a>';
		if(navTabs != null)
			navTabs.appendChild(jatab);

		//Add support for translations. Default (and fallback) is "en".
		//Note, don't make typos in "acceleratorName", as it has to match the layer name (with whitespace removed)
		// to actually work. Took me a while to figure that out...
		I18n.translations[window.I18n.locale].layers.name["junction_angles"] = ja_getMessage("name");

		/**
		 * Initialize JAI OpenLayers vector layer
		 */
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
		ja_calculate();
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
		ja_log("Guessing routing instructions from " + s_in_a + " via node " + node.attributes.id + " to " + s_out_a,2);
		ja_log(node, 4);
		ja_log(s_in_a, 4);
		ja_log(s_out_a, 4);
		ja_log(angles, 3);
		var s_in_id = s_in_a;
		var s_out_id = s_out_a;

		s_in_a = window.$.grep(angles, function(element){
			return element[1] == s_in_a;
		});
		s_out_a = window.$.grep(angles, function(element){
			return element[1] == s_out_a;
		});

		var s_n = {}, s_in = null, s_out = {}, street_n = {}, street_in = null;
		node.attributes.segIDs.forEach(function(element) {
			if (element == s_in_id) {
				s_in = node.model.segments.get(element);
				street_in = ja_get_streets(element);
				//Set empty name for streets if not defined
				if(typeof street_in.primary === 'undefined') { street_in.primary = {}; }
				if(typeof street_in.primary.name === 'undefined') {
					street_in.primary['name'] = "";
				}
			} else {
				if(element == s_out_id) {
					//store for later use
					s_out[element] = node.model.segments.get(element);
					//Set empty name for streets if not defined
					if(typeof s_out[element].primary === 'undefined') {
						s_out[element]['primary'] = { name: "" };
					}
				}
				s_n[element] = node.model.segments.get(element);
				street_n[element] = ja_get_streets(element);
				if(typeof street_n[element].primary === 'undefined') {
					street_n[element]['primary'] = { name: ""};
				}
			}
		});

		ja_log(s_n, 3);
		ja_log(street_n,3);
		ja_log(s_in,3);
		ja_log(street_in,2);
		if (s_in === null || street_in === null) {
			//Should never happen, but adding to make code validation happy
			return ja_routing_type.PROBLEM;
		}

		var angle = ja_angle_diff(s_in_a[0], (s_out_a[0]), false);
		ja_log("turn angle is: " + angle, 2);

		//Check turn possibility first
		if(!ja_is_turn_allowed(s_in, node, s_out[s_out_id])) {
			ja_log("Turn is disallowed!", 2);
			return ja_routing_type.ERROR;
		}

		//Roundabout - no true instruction guessing here!
		if (s_in.attributes.junctionID) {
			if (s_out[s_out_id].attributes.junctionID) {
				ja_log("Roundabout continuation - no instruction", 2);
				return ja_routing_type.BC;
			} else {
				ja_log("Roundabout exit - no instruction", 2);
				return ja_routing_type.ROUNDABOUT_EXIT;  //exit just to visually distinguish from roundabout continuation
			}
		} else if (s_out[s_out_id].attributes.junctionID) {
			ja_log("Roundabout entry - no instruction", 2);
			//no instruction since it's normally the only continuation - true instruction can be computed for
			//entry-exit selection only
			return ja_routing_type.BC;
		}

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
		if(Math.abs(angle) <= 44) {
			ja_log("Turn is <= 44", 2);

			/*
			 * Filter out disallowed and non-"BC eligible" turns.
			 */
			ja_log("Original angles and street_n:", 2);
			ja_log(angles, 2);
			ja_log(street_n, 2);
			ja_log(s_n, 2);
			angles = angles.filter(function (a) {
				ja_log("Filtering angle: " + ja_angle_diff(s_in_a, a[0], false), 2);
				if(s_out_id == a[1]
					|| (typeof s_n[a[1]] !== 'undefined'
						&& ja_is_turn_allowed(s_in, node, s_n[a[1]])
						&& Math.abs(ja_angle_diff(s_in_a, a[0], false)) <= 45 //Any angle above 45 is not eligible
						)) {
					ja_log(true, 4);
					return true;
				} else {
					ja_log(false, 4);
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

			if(angles.length <= 1) {
				ja_log("Only one allowed turn left", 2);
				return ja_routing_type.BC;
			} //No instruction

			/*
			 * Apply simplified BC check
			 */
			var bc_matches = {}, bc_prio = 0, bc_count = 0;
			var bc_collect = function(a, prio) {
				ja_log("Potential BC = " + prio, 2);
				ja_log(a, 2);
				if (prio > bc_prio) { //highest priority wins now
					bc_matches = {};
					bc_prio = prio;
					bc_count = 0;
				}
				if (prio == bc_prio) {
					bc_matches[a[1]] = a;
					bc_count++;
				}
				ja_log("BC candidates:", 2);
				ja_log(bc_matches, 2);
			};

			//wlodek76: variables for collecting most left angles
			var leftmostAngle  = null, tempLeftAngle  = 0;
			var leftmostAngle2 = null, tempLeftAngle2 = 0;

			//Check each eligible turn against routing rules
			for(var k=0; k< angles.length; k++) {
				var a = angles[k];

				ja_log("Checking angle " + k, 2);
				ja_log(a, 2);

				var tmp_angle = ja_angle_diff(s_in_a[0], a[0], false);
				ja_log(tmp_angle, 2);

				//wlodek76: getting two most left angles
				if (leftmostAngle == null) {
						leftmostAngle = a;
						tempLeftAngle = tmp_angle;
					}
				else {
					if (tmp_angle >= tempLeftAngle) {
						leftmostAngle2  = leftmostAngle;
						leftmostAngle   = a;
						tempLeftAngle2  = tempLeftAngle;
						tempLeftAngle   = tmp_angle;
					}
					else {
						if (tmp_angle >= tempLeftAngle2) {
							leftmostAngle2 = a;
							tempLeftAngle2 = tmp_angle;
						}
					}
				}

				var tmp_s_out = {};
				tmp_s_out[a[1]] = s_n[a[1]];
				var tmp_street_out = {};
				tmp_street_out[a[1]] = street_n[a[1]];
				var overlapped_angle;

				if(ja_primary_name_match(street_in, tmp_street_out) && ja_segment_type_match(s_in, tmp_s_out)) {
					ja_log("BC primary name and type match", 2);
					bc_collect(a, 3);
				} else if(ja_alt_name_match(street_in, tmp_street_out) && ja_segment_type_match(s_in, tmp_s_out)) {
					ja_log("BC alt name and type match", 2);
					bc_collect(a, 3);
				} else if(ja_primary_name_match(street_in, tmp_street_out) || ja_cross_name_match(street_in, tmp_street_out)) {
					ja_log("BC primary name or cross name match", 2);
					bc_collect(a, 2);
				} else if(ja_alt_name_match(street_in, tmp_street_out)) {
					ja_log("BC alt name match", 2);
					bc_collect(a, 2);
				} else if(ja_segment_type_match(s_in, tmp_s_out)) {
					ja_log("BC type match", 2);
					bc_collect(a, 1);
				} else {
					//Non-BC
				}
			}

			//If s-out is the only BC, that's it.
			if (bc_matches[s_out_id] !== undefined && bc_count == 1) {
				ja_log("\"straight\": no instruction", 2);
				return ja_routing_type.BC
			}

			ja_log("BC logic did not apply; using old default rules instead.", 2);

			//wlodek76: FIXING KEEP LEFT/RIGHT regarding to left most segment
			//WIKI WAZE: When there are more than two segments less than 45.04°, only the left most segment will be KEEP LEFT, all the rest will be KEEP RIGHT
			if (true || angles.length > 2) { //FZ69617: "more than two..."
						//FIXME: true added to temporarily ignore this condition
						//without it many "keep left"s changed into "exit right"
						//but I'm finally not sure whether we can safely ignore the precondition from Wiki?

				//wlodek76: KEEP LEFT/RIGHT overlapping case
				//WIKI WAZE: If the left most segment is overlapping another segment, it will also be KEEP RIGHT.
				if (leftmostAngle!=null && leftmostAngle2!=null) {
					overlapped_angle = Math.abs(leftmostAngle[0] - leftmostAngle2[0]);

					// If two top most left angles are close < 2 degree they are overlapped.
					// Method of recognizing overlapped segment by server is unknown for me yet, I took this from WME Validator information about this.
					// TODO: verify overlapping check on the side of routing server.
					if (overlapped_angle < 2.0) {
						leftmostAngle = null;
					}
				}

				if (leftmostAngle != null && leftmostAngle[1] == s_out_id) {
					ja_log("Left most <45 segment: keep left", 2);
					return ja_routing_type.KEEP_LEFT;
				}
			}

			//FZ69617: Two overlapping sements logic
			//WAZE WIKI: If the only two segments less than 45.04° overlap each other, neither will get an instruction.
			if (angles.length == 2) {
				overlapped_angle = Math.abs(angles[0][0] - angles[1][0]);

				// TODO: verify overlapping check on the side of routing server.
				if (overlapped_angle < 2.0) {
					ja_log("Two overlapping segments: no instruction", 2);
					return ja_routing_type.BC;  //PROBLEM?
				}
			}

			//Primary to non-primary
			if(ja_is_primary_road(s_in) && !ja_is_primary_road(s_out[s_out_id])) {
				ja_log("Primary to non-primary = exit", 2);
				return s_in.model.isLeftHand ? ja_routing_type.EXIT_LEFT : ja_routing_type.EXIT_RIGHT;
			}

			//Ramp to non-primary or non-ramp
			if(ja_is_ramp(s_in) && !ja_is_primary_road(s_out[s_out_id]) && !ja_is_ramp(s_out[s_out_id]) ) {
				ja_log("Ramp to non-primary and non-ramp = exit", 2);
				return s_in.model.isLeftHand ? ja_routing_type.EXIT_LEFT : ja_routing_type.EXIT_RIGHT;
			}

			ja_log("DEFAULT: keep right", 2);
			return ja_routing_type.KEEP_RIGHT;
		} else if(Math.abs(angle) <= 46) {
			ja_log("Angle is in gray zone 44-46", 2);
			return ja_routing_type.PROBLEM;
		} else {
			ja_log("Normal turn", 2);
			return ja_routing_type.TURN; //Normal turn (left|right)
		}
	}

	function ja_calculate_real() {
		ja_log("Actually calculating now", 2);
		var ja_start_time = Date.now();
		ja_roundabout_points = [];
		ja_log(window.Waze.map, 3);
		if (typeof ja_mapLayer === 'undefined') {
			return 1;
		}
		//clear old info
		ja_mapLayer.destroyFeatures();

		if (ja_getOption("roundaboutOverlayDisplay") == "rOverAlways") {
			ja_draw_roundabout_overlay();
		}

		//try to show all angles for all selected segments
		if (window.Waze.selectionManager.selectedItems.length == 0) return 1;
		ja_log("Checking junctions for " + window.Waze.selectionManager.selectedItems.length + " segments", 2);
		var ja_nodes = [];

		window.Waze.selectionManager.selectedItems.forEach(function(element) {
			ja_log(element, 3);
			switch (element.model.type) {
				case "node":
					ja_nodes.push(element.model.attributes.id);
					break;
				case "segment":
					//segments selected?
					if (element.model.attributes.fromNodeID != null &&
						ja_nodes.indexOf(element.model.attributes.fromNodeID) == -1) {
						ja_nodes.push(element.model.attributes.fromNodeID);
					}
					if (element.model.attributes.toNodeID != null &&
						ja_nodes.indexOf(element.model.attributes.toNodeID) == -1) {
						ja_nodes.push(element.model.attributes.toNodeID);
					}
					break;
				case "venue":
					break;
				default:
					ja_log("Found unknown item type: " + element.model.type, 2);
					break;
			}
			ja_log(ja_nodes, 2);
		});

		//Figure out if we have a selected roundabout and do some magic
		var ja_selected_roundabouts = {};

		ja_nodes.forEach(function(node) {
			ja_log(window.Waze.model.nodes.get(node), 3);

			var tmp_s = null, tmp_n = null, tmp_junctionID = null;
			if(window.Waze.model.nodes.get(node) == null ||
				typeof window.Waze.model.nodes.get(node).attributes.segIDs === 'undefined') {
				return;
			}
			window.Waze.model.nodes.get(node).attributes.segIDs.forEach(function(segment) {
				ja_log(segment, 3);

				if(window.Waze.model.segments.get(segment).attributes.junctionID) {
					ja_log("Roundabout detected: " + window.Waze.model.segments.get(segment).attributes.junctionID, 3);
					tmp_junctionID = window.Waze.model.segments.get(segment).attributes.junctionID;
				} else {
					tmp_s = segment;
					tmp_n = node;
				}
				ja_log("tmp_s: " + (tmp_s === null ? 'null' : tmp_s), 3);
			});
			ja_log("final tmp_s: " + (tmp_s === null ? 'null' : tmp_s), 3);
			if(tmp_junctionID === null) return;
			if(!ja_selected_roundabouts.hasOwnProperty(tmp_junctionID)) {
				ja_selected_roundabouts[tmp_junctionID] = {
					'in_s': tmp_s,
					'in_n': tmp_n,
					'out_s': null,
					'out_n': null,
					'p': window.Waze.model.junctions.get(tmp_junctionID).geometry
				};
			} else {
				ja_selected_roundabouts[tmp_junctionID].out_s = tmp_s;
				ja_selected_roundabouts[tmp_junctionID].out_n = node;
			}
		});

		//Do some fancy painting for the roundabouts...
		for(var tmp_roundabout in ja_selected_roundabouts) {
			if (ja_selected_roundabouts.hasOwnProperty(tmp_roundabout)) {
				ja_log(tmp_roundabout, 3);
				ja_log(ja_selected_roundabouts[tmp_roundabout], 3);

				//New roundabouts don't have coordinates yet..
				if(typeof ja_selected_roundabouts[tmp_roundabout].p === 'undefined' ||
					ja_selected_roundabouts[tmp_roundabout].out_n === null
					) {
					continue;
				}

				//Draw circle overlay for this roundabout
				if(ja_getOption("roundaboutOverlayDisplay") == "rOverSelected") {
					ja_draw_roundabout_overlay(tmp_roundabout);
				}

				//Transform LonLat to actual layer projection
				var tmp_roundabout_center = ja_coordinates_to_point(ja_selected_roundabouts[tmp_roundabout].p.coordinates);
				var angle = ja_angle_between_points(
					window.Waze.model.nodes.get(ja_selected_roundabouts[tmp_roundabout].in_n).geometry,
					tmp_roundabout_center,
					window.Waze.model.nodes.get(ja_selected_roundabouts[tmp_roundabout].out_n).geometry
				);
				ja_mapLayer.addFeatures([
					new window.OpenLayers.Feature.Vector(
						tmp_roundabout_center,
						{
							angle: ja_round(angle) + '°',
							ja_type: ja_is_roundabout_normal(
								tmp_roundabout,
								ja_selected_roundabouts[tmp_roundabout].in_n) ? ja_routing_type.TURN : ja_routing_type.ROUNDABOUT
						}
					)
				]);
			}
		}

		//Start looping through selected nodes
		for (var i = 0; i < ja_nodes.length; i++) {
			var node = window.Waze.model.nodes.get(ja_nodes[i]);
			if (node == null || !node.hasOwnProperty('attributes')) {
				//Oh oh.. should not happen? We want to use a node that does not exist
				ja_log("Oh oh.. should not happen?",2);
				ja_log(node, 2);
				ja_log(ja_nodes[i], 2);
				ja_log(window.Waze.model, 3);
				ja_log(window.Waze.model.nodes, 3);
				continue;
			}
			//check connected segments
			var ja_current_node_segments = node.attributes.segIDs;
			ja_log(node, 2);

			//ignore of we have less than 2 segments
			if (ja_current_node_segments.length <= 1) {
				ja_log("Found only " + ja_current_node_segments.length + " connected segments at " + ja_nodes[i]
					+ ", not calculating anything...", 2);
				continue;
			}

			ja_log("Calculating angles for " + ja_current_node_segments.length + " segments", 2);
			ja_log(ja_current_node_segments, 3);

			var angles = [];
			var ja_selected_segments_count = 0;
			var ja_selected_angles = [];
			var a;

			ja_current_node_segments.forEach(function (nodeSegment, j) {
				var s = window.Waze.model.segments.objects[nodeSegment];
				if(typeof s === 'undefined') {
					//Meh. Something went wrong, and we lost track of the segment. This needs a proper fix, but for now
					// it should be sufficient to just restart the calculation
					ja_log("Failed to read segment data from model. Restarting calculations.", 1);
					if(ja_last_restart == 0) {
						ja_last_restart = new Date().getTime();
						setTimeout(function(){ja_calculate();}, 500);
					}
					return 4;
				}
				a = ja_getAngle(ja_nodes[i], s);
				ja_log("Segment " + nodeSegment + " angle is " + a, 2);
				angles[j] = [a, nodeSegment, s != null ? s.isSelected() : false];
				if (s != null ? s.isSelected() : false) {
					ja_selected_segments_count++;
				}
			});

			//make sure we have the selected angles in correct order
			ja_log(ja_current_node_segments, 3);
			window.Waze.selectionManager.selectedItems.forEach(function (selectedSegment) {
				var selectedSegmentId = selectedSegment.model.attributes.id;
				ja_log("Checking if " + selectedSegmentId + " is in current node", 3);
				if(ja_current_node_segments.indexOf(selectedSegmentId) >= 0) {
					ja_log("It is!", 4);
					//find the angle
					for(var j=0; j < angles.length; j++) {
						if(angles[j][1] == selectedSegmentId) {
							ja_selected_angles.push(angles[j]);
							break;
						}
					}
				} else {
					ja_log("It's not..", 4);
				}
			});


			ja_log(angles, 3);

			var ja_label_distance;
			/*
			 * Define a base distance to markers, depending on the zoom level
			 */
			switch (window.Waze.map.zoom) {
				case 10:
					ja_label_distance = 2.8;
					break;
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
					ja_label_distance = 150;
					break;
				case 2:
					ja_label_distance = 300;
					break;
				case 1:
					ja_label_distance = 400;
					break;
			}

			ja_label_distance = ja_label_distance * (1+(0.2*parseInt(ja_getOption("decimals"))));

			ja_log("zoom: " + window.Waze.map.zoom + " -> distance: " + ja_label_distance, 2);

			var ha, point;
			//if we have two connected segments selected, do some magic to get the turn angle only =)
			if (ja_selected_segments_count == 2) {
				var ja_extra_space_multiplier = 1;

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

				ja_log("Angle between " + ja_selected_angles[0][1] + " and " + ja_selected_angles[1][1] + " is "
					+ a + " and position for label should be at " + ha, 3);

				//Guess some routing instructions based on segment types, angles etc
				var ja_junction_type = ja_routing_type.TURN; //Default to old behavior

				if(ja_getOption("guess")) {
					ja_log(ja_selected_angles, 2);
					ja_log(angles, 2);
					ja_junction_type =
						ja_guess_routing_instruction(node, ja_selected_angles[0][1], ja_selected_angles[1][1], angles);
					ja_log("Type is: " + ja_junction_type, 2);
				}
				//get the initial marker point
				point = new window.OpenLayers.Geometry.Point(
						node.geometry.x + (ja_extra_space_multiplier * ja_label_distance * Math.cos((ha * Math.PI) / 180)),
						node.geometry.y + (ja_extra_space_multiplier * ja_label_distance * Math.sin((ha * Math.PI) / 180))
				);
				ja_draw_marker(point, node, ja_label_distance, a, ha, true, ja_junction_type);
			}
			else {
				//sort angle data (ascending)
				angles.sort(function (a, b) {
					return a[0] - b[0]
				});
				ja_log(angles, 3);
				ja_log(ja_selected_segments_count, 3);

				//get all segment angles
				angles.forEach(function(angle, j) {
					a = (360 + (angles[(j + 1) % angles.length][0] - angle[0])) % 360;
					ha = (360 + ((a / 2) + angle[0])) % 360;
					var a_in = angles.filter(function(a) {
						"use strict";
						if(a[2]) return true;
					})[0];

					//Show only one angle for nodes with only 2 connected segments and a single selected segment
					// (not on both sides). Skipping the one > 180
					if (ja_selected_segments_count == 1
						&& angles.length == 2
						&& a >=180
						&& ja_getOption("angleMode") != "aDeparture"
						) {
						ja_log("Skipping marker, as we need only one of them", 2);
						return;
					}
					if(ja_getOption("angleMode") == "aDeparture" && ja_selected_segments_count > 0) {
						if(a_in[1] == angle[1]) {
							ja_log("in == out. skipping.", 2);
							return;
						}
						ja_log("Angle in:",2);
						ja_log(a_in,2);
						ja_log(ja_guess_routing_instruction(node, a_in[1], angle[1], angles), 2);
						//FIXME: we might want to try to keep the marker on the segment, instead of just
						//in the direction of the first part
						ha = angle[0];
						a = ja_angle_diff(a_in[0], angles[j][0], false);
						point = new window.OpenLayers.Geometry.Point(
								node.geometry.x + (ja_label_distance * 2 * Math.cos((ha * Math.PI) / 180)),
								node.geometry.y + (ja_label_distance * 2 * Math.sin((ha * Math.PI) / 180))
						);
						ja_draw_marker(point, node, ja_label_distance, a, ha, true,
							ja_getOption("guess") ? ja_guess_routing_instruction(node, a_in[1], angle[1], angles) : ja_routing_type.TURN);
					} else {
						ja_log("Angle between " + angle[1] + " and " + angles[(j + 1) % angles.length][1] + " is "
							+ a + " and position for label should be at " + ha, 3);
						point = new window.OpenLayers.Geometry.Point(
								node.geometry.x + (ja_label_distance * Math.cos((ha * Math.PI) / 180)),
								node.geometry.y + (ja_label_distance * Math.sin((ha * Math.PI) / 180))
						);
						ja_draw_marker(point, node, ja_label_distance, a, ha);
					}
				});
			}
		}

		ja_last_restart = 0;
		var ja_end_time = Date.now();
		ja_log("Calculation took " + String(ja_end_time - ja_start_time) + " ms", 2);
	}


	/*
	 * Drawing functions
	 */
	/**
	 *
	 * @param point Estimated point for marker
	 * @param node Node the marker is for
	 * @param ja_label_distance Arbitrary distance to be used in moving markers further away etc
	 * @param a Angle to display
	 * @param ha Angle to marker from node (FIXME: either point or ha is probably unnecessary)
	 * @param withRouting true: show routing guessing markers, false: show "normal" angle markers
	 * @param ja_junction_type If using routing, this needs to be set to the desired type
	 */
	function ja_draw_marker(point, node, ja_label_distance, a, ha, withRouting, ja_junction_type) {
		"use strict";


		//Try to estimate of the point is "too close" to another point
		//(or maybe something else in the future; like turn restriction arrows or something)
		var ja_tmp_distance = ja_label_distance;
		ja_log("Starting distance estimation", 3);
		while(ja_mapLayer.features.some(function(feature){
			if(typeof feature.attributes.ja_type !== 'undefined' && feature.attributes.ja_type !== 'roundaboutOverlay') {
				//Arbitrarily chosen minimum distance.. Should actually use the real bounds of the markers,
				//but that didn't work out.. Bounds are always 0..
				if(ja_label_distance / 1.4 > feature.geometry.distanceTo(point)) {
					ja_log(ja_label_distance / 1.5 > feature.geometry.distanceTo(point) + " is kinda close..", 3);
					return true;
				}
			}
			return false;
		})) {
			//add 1/4 of the original distance and hope for the best =)
			ja_tmp_distance = ja_tmp_distance + ja_label_distance / 4;
			ja_log("setting distance to " + ja_tmp_distance, 2);
			point = new window.OpenLayers.Geometry.Point(
					node.geometry.x + (ja_tmp_distance * Math.cos((ha * Math.PI) / 180)),
					node.geometry.y + (ja_tmp_distance * Math.sin((ha * Math.PI) / 180))
			);
		}
		ja_log("Distance estimation done", 3);

		var angleString = ja_round(Math.abs(a)) + "°";

		//FZ69617: Add direction arrows for turn instructions only
		if (ja_getOption("angleDisplay") == "displaySimple") {
			switch(ja_junction_type) {
				case ja_routing_type.EXIT:
				case ja_routing_type.KEEP:
				case ja_routing_type.TURN:
					angleString = a < 0 ? angleString + ">" : "<" + angleString;
					break;
				case ja_routing_type.EXIT_LEFT:
				case ja_routing_type.KEEP_LEFT:
					angleString = "<" + angleString;
					break;
				case ja_routing_type.EXIT_RIGHT:
				case ja_routing_type.KEEP_RIGHT:
					angleString = angleString + ">";
					break;
			}
		} else {
			switch(ja_junction_type) {
				case ja_routing_type.EXIT:
				case ja_routing_type.KEEP:
					angleString = (a > 0 ? "↖\n" : "↗\n") + anglestring;
					break;
				case ja_routing_type.TURN:
					angleString = (a > 0 ? "←\n" : "→\n") + angleString;
					break;
				case ja_routing_type.EXIT_LEFT:
				case ja_routing_type.KEEP_LEFT:
					angleString = "↖\n" + angleString;
					break;
				case ja_routing_type.EXIT_RIGHT:
				case ja_routing_type.KEEP_RIGHT:
					angleString = "↗\n" + angleString;
					break;
			}
		}
		var anglePoint = withRouting ?
			new window.OpenLayers.Feature.Vector(
				point
				, { angle: angleString, ja_type: ja_junction_type }
			): new window.OpenLayers.Feature.Vector(
			point
			, { angle: ja_round(a) + "°", ja_type: "generic" }
		);
		ja_log(anglePoint, 3);

		//Don't paint points inside an overlaid roundabout
		if(ja_roundabout_points.some(function (roundaboutPoint){
			return roundaboutPoint.containsPoint(point);
		})) return;

		//Draw a line to the point
		ja_mapLayer.addFeatures([
				new window.OpenLayers.Feature.Vector(
					new window.OpenLayers.Geometry.LineString([node.geometry, point]),
					{},
					{strokeOpacity: 0.6, strokeWidth: 1.2, strokeDashstyle: "solid", strokeColor: "#ff9966"}
				)
			]
		);

		//push the angle point
		ja_mapLayer.addFeatures([anglePoint]);

	}

	function ja_draw_roundabout_overlay(junctionId) {
		window.Waze.model.junctions.getObjectArray().forEach(function (element){
			ja_log(element, 3);
			//Check if we want a specific junction.
			//FIXME: this should actually be done by a direct select, instead of looping through all..
			if(typeof junctionId !== "undefined" && junctionId != element.id) {
				return;
			}
			var nodes = {};
			element.segIDs.forEach(function(s) {
				var seg = window.Waze.model.segments.get(s);
				ja_log(seg, 3);
				nodes[seg.attributes.fromNodeID] = window.Waze.model.nodes.get(seg.attributes.fromNodeID);
				nodes[seg.attributes.toNodeID] = window.Waze.model.nodes.get(seg.attributes.toNodeID);
			});

			ja_log(nodes, 3);
			var center = ja_coordinates_to_point(element.geometry.coordinates);
			ja_log(center, 3);
			var distances = [];
			Object.getOwnPropertyNames(nodes).forEach(function(name) {
				ja_log("Checking " + name + " distance", 3);
				var dist = Math.sqrt(
						Math.pow(nodes[name].attributes.geometry.x - center.x, 2) +
						Math.pow(nodes[name].attributes.geometry.y - center.y, 2)
				);
				distances.push(dist);
			});
			ja_log(distances, 3);
			ja_log("Mean distance is " + distances.reduce(function(a,b){return a + b;}) / distances.length, 3);

			var circle = window.OpenLayers.Geometry.Polygon.createRegularPolygon(
				center,
				distances.reduce(function(a,b){return a + b;}) / distances.length,
				40,
				0
			);
			var roundaboutCircle = new window.OpenLayers.Feature.Vector(circle, {'ja_type': 'roundaboutOverlay'});
			ja_roundabout_points.push(circle);
			ja_mapLayer.addFeatures([roundaboutCircle]);
		});
	}


	/*
	 * Segment and routing helpers
	 */

	/**
	 * Check if segment in type matches any other segments
	 * @param segment_in
	 * @param segments
	 * @returns {boolean}
	 */
	function ja_segment_type_match(segment_in, segments) {
		ja_log(segment_in, 2);
		ja_log(segments, 2);

		return Object.getOwnPropertyNames(segments).some(function (segment_n_id, index) {
			var segment_n = segments[segment_n_id];
			ja_log("PT Checking element " + index, 2);
			ja_log(segment_n, 2);
			if(segment_n.attributes.id == segment_in.attributes.id) return false;
			ja_log("PT checking sn.rt " + segment_n.attributes.roadType +
				" vs i.pt: " + segment_in.attributes.roadType, 2);
			return (segment_n.attributes.roadType == segment_in.attributes.roadType);
		});
	}

	function ja_is_primary_road(seg) {
		var t = seg.attributes.roadType;
		return t == ja_road_type.FREEWAY || t == ja_road_type.MAJOR_HIGHWAY || t == ja_road_type.MINOR_HIGHWAY;
	}

	function ja_is_ramp(seg) {
		var t = seg.attributes.roadType;
		return t == ja_road_type.RAMP;
	}

	function ja_is_turn_allowed(s_from, via_node, s_to) {
		ja_log("Allow from " + s_from.attributes.id
			+ " to " + s_to.attributes.id
			+ " via " + via_node.attributes.id + "? "
			+ via_node.isTurnAllowedBySegDirections(s_from, s_to) + " | " + s_from.isTurnAllowed(s_to, via_node), 2);

		//Is there a driving direction restriction?
		if(!via_node.isTurnAllowedBySegDirections(s_from, s_to)) {
			ja_log("Driving direction restriction applies", 3);
			return false;
		}

		//Is turn allowed by other means (e.g. turn restrictions)?
		if(!s_from.isTurnAllowed(s_to, via_node)) {
			ja_log("Other restriction applies", 3);
			return false;
		}

		if(s_to.attributes.fromNodeID == via_node.attributes.id) {
			ja_log("FWD direction",3);
			return ja_is_car_allowed_by_restrictions(s_to.attributes.fwdRestrictions);
		} else {
			ja_log("REV direction",3);
			return ja_is_car_allowed_by_restrictions(s_to.attributes.revRestrictions);
		}
	}

	function ja_is_car_allowed_by_restrictions(restrictions) {
		ja_log("Checking restrictions for cars", 2);
		if(typeof restrictions === 'undefined' || restrictions == null || restrictions.length == 0) {
			ja_log("No car type restrictions to check...", 3);
			return true;
		}
		ja_log(restrictions, 3);

		return !restrictions.some(function(element) {
			ja_log("Checking restriction " + element, 3);
			var ret = element.allDay //All day restriction
				&& element.days == 127	//Every week day
				&& ( element.vehicleTypes == -1 //All vehicle types
					|| element.vehicleTypes & ja_vehicle_types.PRIVATE //or at least private cars
					);
			if (ret) {
				ja_log("There is an all-day-all-week restriction", 3);
				var fromDate = Date.parse(element.fromDate);
				var toDate = Date.parse(element.toDate);
				ja_log("From: " + fromDate + ", to: " + toDate + ". " + ret, 3);
				if(isNaN(fromDate && isNaN(toDate))) {
					ja_log("No start nor end date defined");
					return false;
				}
				var fRes, tRes;
				if(!isNaN(fromDate) && new Date() > fromDate) {
					ja_log("From date is in the past", 3);
					fRes = 2;
				} else if(isNaN(fromDate)) {
					ja_log("From date is invalid/not set", 3);
					fRes = 1;
				} else {
					ja_log("From date is in the future: " + fromDate, 3);
					fRes = 0;
				}
				if(!isNaN(toDate) && new Date() < toDate) {
					ja_log("To date is in the future", 3);
					tRes = 2;
				} else if(isNaN(toDate)) {
					ja_log("To date is invalid/not set", 3);
					tRes = 1;
				} else {
					ja_log("To date is in the past: " + toDate, 3);
					tRes = 0;
				}
				// Car allowed unless
				//  - toDate is in the future and fromDate is unset or in the past
				//  - fromDate is in the past and toDate is unset in the future
				// Hope I got this right ;)
				return (fRes <= 1 && tRes <= 1);
			}
			return ret;
		});
	}

	/**
	 * From wiki:
	 * A Cross-match is when the primary name of one segment is identical to the alternate name of an adjacent segment.
	 * It had the same priory as a Primary name match. In order for a Cross match to work there must be at least one
	 * alt name on both involved segments (even though they don't necessarily match each other). It will work even if
	 * the are no Primary names on those segments. It will not work if all three segments at a split have a matching
	 * Primary name or a matching Alternate name.
	 * @param street_in
	 * @param streets
	 * @returns {boolean}
	 */
	function ja_cross_name_match(street_in, streets) {
		ja_log("CN: init", 2);
		ja_log(street_in, 2);
		ja_log(streets, 2);
		return Object.getOwnPropertyNames(streets).some(function (street_n_id, index) {
			var street_n_element = streets[street_n_id];
			ja_log("CN: Checking element " + index, 2);
			ja_log(street_n_element, 2);
			return (street_in.secondary.some(function (street_in_secondary){
				ja_log("CN2a: checking n.p: " + street_n_element.primary.name
					+ " vs in.s: " + street_in_secondary.name, 2);

				//wlodek76: CROSS-MATCH works when two compared segments contain at least one ALT NAME
				//when alt name is empty cross-match does not work
				if (street_n_element.secondary.length == 0) return false;

				return street_n_element.primary.name == street_in_secondary.name;
			}) || street_n_element.secondary.some(function (street_n_secondary) {
				ja_log("CN2b: checking in.p: " + street_in.primary.name + " vs n.s: " + street_n_secondary.name, 2);

				//wlodek76: CROSS-MATCH works when two compared segments contain at least one ALT NAME
				//when alt name is empty cross-match does not work
				if (street_in.secondary.length == 0) return false;

				//wlodek76: missing return from checking primary name with alternate names
				return street_in.primary.name == street_n_secondary.name;
			}));
		});
	}

	function ja_alt_name_match(street_in, streets) {
		return Object.getOwnPropertyNames(streets).some(function (street_n_id, index) {
			var street_n_element = streets[street_n_id];
			ja_log("AN alt name check: Checking element " + index, 2);
			ja_log(street_n_element, 2);

			if(street_in.secondary.length == 0) return false;
			if(street_n_element.secondary.length == 0) return false;

			return street_in.secondary.some(function (street_in_secondary, index2) {
				ja_log("AN2 checking element " + index2, 2);
				ja_log(street_in_secondary, 2);
				return street_n_element.secondary.some(function (street_n_secondary_element, index3) {
					ja_log("AN3 Checking in.s: " + street_in_secondary.name
						+ " vs n.s." + index3 + ": " + street_n_secondary_element.name, 2);
					return street_in_secondary.name == street_n_secondary_element.name;
				});
			});
		});
	}

	function ja_primary_name_match(street_in, streets) {
		ja_log("PN", 2);
		ja_log(street_in, 2);
		ja_log(streets, 2);
		return Object.getOwnPropertyNames(streets).some(function (id, index, array) {
			var element = streets[id];
			ja_log("PN Checking element " + index + " of " + array.length, 2);
			ja_log(element, 2);
			return (element.primary.name == street_in.primary.name);
		});
	}

	function ja_get_streets(segmentId) {
		var primary =
			window.Waze.model.streets.objects[window.Waze.model.segments.objects[segmentId].attributes.primaryStreetID];
		var secondary = [];
		window.Waze.model.segments.objects[segmentId].attributes.streetIDs.forEach(function (element) {
			secondary.push(window.Waze.model.streets.objects[element]);
		});
		ja_log(primary, 3);
		ja_log(secondary, 3);
		return { primary: primary, secondary: secondary };
	}



	/*
	 * Misc math and map element functions
	 */

	/**
	 *
	 * @param p0 From point
	 * @param p1 Center point
	 * @param p2 To point
	 * @returns {number}
	 */
	function ja_angle_between_points(p0,p1,p2) {
		ja_log("p0 " + p0,3);
		ja_log("p1 " + p1,3);
		ja_log("p2 " + p2,3);
		var a = Math.pow(p1.x-p0.x,2) + Math.pow(p1.y-p0.y,2);
		var b = Math.pow(p1.x-p2.x,2) + Math.pow(p1.y-p2.y,2);
		var c = Math.pow(p2.x-p0.x,2) + Math.pow(p2.y-p0.y,2);
		var angle = Math.acos((a+b-c) / Math.sqrt(4*a*b)) / (Math.PI / 180);
		ja_log("angle is " + angle,3);
		return angle;
	}

	/**
	 * get absolute (or turn) angle between 2 inputs.
	 * 0,90,true  -> 90	 0,90,false -> -90
	 * 0,170,true -> 170	0,170,false -> -10
	 * @param aIn absolute s_in angle (from node)
	 * @param aOut absolute s_out angle (from node)
	 * @param absolute return absolute or turn angle?
	 * @returns {number}
	 */
	function ja_angle_diff(aIn, aOut, absolute) {
		var a = parseFloat(aOut) - parseFloat(aIn);
		if(a > 180) a -= 360;
		if(a < -180) a+= 360;
		return absolute ? a : (a > 0 ? a - 180 : a + 180);
	}

	function ja_is_roundabout_normal(junctionID, n_in) {
		ja_log("Check normal roundabout", 3);
		var junction = window.Waze.model.junctions.get(junctionID);
		var nodes = {};
		var numValidExits = 0;
		junction.segIDs.forEach(function (element, index) {
			var s = window.Waze.model.segments.get(element);
			ja_log("index: " + index, 3);
			//ja_log(s, 3);
			if (!nodes.hasOwnProperty(s.attributes.toNodeID)) {
				ja_log("Adding node id: " + s.attributes.toNodeID, 3);
				//Check if node has allowed exits
				var allowed = false;
				var currNode = window.Waze.model.nodes.get(s.attributes.toNodeID);
				ja_log(currNode, 3);
				currNode.attributes.segIDs.forEach(function (element2) {
					var s_exit = window.Waze.model.segments.get(element2);
					ja_log(s_exit, 3);
					if (s_exit.attributes.junctionID !== null) {
						//part of the junction.. Ignoring
						ja_log(s_exit.attributes.id + " is in the roundabout. ignoring", 3);
					} else {
						ja_log("Checking: " + s_exit.attributes.id, 3);
						if (currNode.isTurnAllowedBySegDirections(s, s_exit)) {
							//Exit possibly allowed
							ja_log("Exit allowed", 3);
							allowed = true;
						} else {
							ja_log("Exit not allowed", 3);
						}
					}
				});
				if (allowed) {
					numValidExits++;
					nodes[s.attributes.toNodeID] = window.Waze.model.nodes.get(s.attributes.toNodeID);
				}
			}
		});

		var is_normal = true;
		ja_log(n_in, 3);
		ja_log(junction, 3);
		ja_log(nodes, 3);

		//If we have more than 4 possible exits, the roundabout is non-normal, and we don't want to paint the
		//offending angles.
		if (numValidExits > 4) return false;

		for (var n in nodes) {
			if (nodes.hasOwnProperty(n)) {
				ja_log("Checking " + n, 3);
				if (n == n_in) {
					ja_log("Not comparing to n_in ;)", 3);
				} else {
					var angle = ja_angle_between_points(
						window.Waze.model.nodes.get(n_in).geometry,
						ja_coordinates_to_point(junction.geometry.coordinates),
						window.Waze.model.nodes.get(n).geometry
					);
					ja_log("Angle is: " + angle, 3);
					ja_log("Normalized angle is: " + (angle % 90), 3);
					//angle = Math.abs((angle%90 - 90))
					angle = Math.abs((angle % 90));
					ja_log("Angle is: " + angle, 3);
					// 90 +/- 15 is considered "normal"
					if (angle <= 15 || 90 - angle <= 15) {
						ja_log("turn is normal", 3);
					} else {
						ja_log("turn is NOT normal", 3);
						is_normal = false;
						//Push a marker on the node to show which exit is "not normal"
						ja_mapLayer.addFeatures([
								new window.OpenLayers.Feature.Vector(
									window.Waze.model.nodes.get(n).geometry,
									{
										angle: '±' + ja_round(Math.min(angle, 90 - angle)),
										ja_type: ja_routing_type.ROUNDABOUT
									}
								)]
						);
					}
				}
			}
		}
		return is_normal;
	}


	/**
	 * Helper to get get correct projections for roundabout center point
	 */

	function ja_coordinates_to_point(coordinates) {
		return window.OpenLayers.Projection.transform(
			new window.OpenLayers.Geometry.Point(
				coordinates[0],
				coordinates[1]
			),
			"EPSG:4326",
			ja_mapLayer.projection.projCode
		);
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
		var ja_dx, ja_dy;
		if (ja_segment.attributes.fromNodeID == ja_node) {
			ja_dx = ja_get_second_point(ja_segment).x - ja_get_first_point(ja_segment).x;
			ja_dy = ja_get_second_point(ja_segment).y - ja_get_first_point(ja_segment).y;
		} else {
			ja_dx = ja_get_next_to_last_point(ja_segment).x - ja_get_last_point(ja_segment).x;
			ja_dy = ja_get_next_to_last_point(ja_segment).y - ja_get_last_point(ja_segment).y;
		}
		ja_log(ja_node + " / " + ja_segment + ": dx:" + ja_dx + ", dy:" + ja_dy, 2);
		var ja_angle = Math.atan2(ja_dy, ja_dx);
		return ((ja_angle * 180 / Math.PI)) % 360;
	}

	/**
	 * Decimal adjustment of a number. Borrowed (with some modifications) from
	 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round
	 * ja_round(55.55); with 1 decimal // 55.6
	 * ja_round(55.549); with 1 decimal // 55.5
	 * ja_round(55); with -1 decimals // 60
	 * ja_round(54.9); with -1 decimals // 50
	 *
	 * @param	{Number}	value	The number.
	 * @returns	{Number}			The adjusted value.
	 */
	function ja_round(value) {
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
		var valueArray = value.toString().split('e');
		value = Math.round(+(valueArray[0] + 'e' + (valueArray[1] ? (+valueArray[1] - ja_rounding) : -ja_rounding)));
		// Shift back
		valueArray = value.toString().split('e');
		return +(valueArray[0] + 'e' + (valueArray[1] ? (+valueArray[1] + ja_rounding) : ja_rounding));
	}


	/*
	 * WME interface helper functions
	 */

	function ja_getOption(name) {
		ja_log("Loading option: " + name, 2);
		if(!ja_options.hasOwnProperty(name) || typeof ja_options[name] === 'undefined') {
			ja_options[name] = ja_settings[name]['defaultValue'];
		}
		//Check for invalid values
		//Select values
		if(ja_settings[name]["elementType"] == "select" && ja_settings[name]["options"].lastIndexOf(ja_options[name]) < 0) {
			ja_log(ja_settings[name]["options"], 2);
			ja_log("Found invalid value for setting " + name + ": " + ja_options[name] + ". Using default.", 2);
			ja_options[name] = ja_settings[name]['defaultValue'];
		}
		//Color values
		else if(ja_settings[name]["elementType"] == "color" && ja_options[name].match(/#[0-9a-f]{6}/) == null) {
			ja_log("Found invalid value for setting " + name + ": \"" + ja_options[name] + "\". Using default.", 2);
			ja_options[name] = ja_settings[name]['defaultValue'];
		}
		//Numeric values
		else if(ja_settings[name]["elementType"] == "number") {
			var minValue = typeof ja_settings[name]['min'] === 'undefined' ? Number.MIN_VALUE : ja_settings[name]['min'];
			var maxValue = typeof ja_settings[name]['max'] === 'undefined' ? Number.MAX_VALUE : ja_settings[name]['max'];
			if(isNaN(ja_options[name]) || ja_options[name] < minValue || ja_options[name] > maxValue) {
				ja_log("Found invalid value for setting " + name + ": \"" + ja_options[name] + "\". Using default.", 2);
				ja_options[name] = ja_settings[name]['defaultValue'];
			}
		}
		//Checkboxes
		else if(ja_settings[name]["elementType"] == "checkbox" && ja_options[name] !== true && ja_options[name] !== false) {
			ja_log("Found invalid value for setting " + name + ": \"" + ja_options[name] + "\". Using default.", 2);
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

	var ja_onchange = function(e) {
		"use strict";
		ja_log(e, 3);
		var applyPending = false;
		var settingName = Object.getOwnPropertyNames(ja_settings).filter(function(a,b,c){
			ja_log(ja_settings[a], 4);
			return ja_settings[a]["elementId"] == e.id;
		})[0];
		ja_log(settingName, 3);
		switch(ja_settings[settingName]["elementType"]) {
			case "checkbox":
				ja_log("Checkbox setting " + e.id + ": stored value is: " + ja_options[settingName] + ", new value: " + e.checked, 3);
				if (ja_options[settingName] != e.checked) applyPending = true;
				break;
			case "select":
			case "color":
			case "number":
				ja_log("Setting " + e.id + ": stored value is: " + ja_options[settingName] + ", new value: " + e.value, 3);
				if (ja_options[settingName] != e.value) applyPending = true;
				break;
			default:
				ja_log("Unknown setting " + e.id + ": stored value is: " + ja_options[settingName] + ", new value: " + e.value, 3);
		}

		//Enable|disable certain dependent settings
		switch(e.id) {
			case ja_settings['guess'].elementId:
				Object.getOwnPropertyNames(ja_settings).forEach(function (a) {
					var setting = ja_settings[a];
					if(setting['group'] && setting['group'] == 'guess') {
						ja_log(a + ": " + !e.checked , 3);
						document.getElementById(setting["elementId"]).disabled = !e.checked;
						document.getElementById(setting["elementId"]).parentNode.style.color =
							e.checked ? "black" : "lightgrey";
					}
				});
				break;
			case ja_settings['roundaboutOverlayDisplay'].elementId:
				Object.getOwnPropertyNames(ja_settings).forEach(function (a) {
					var setting = ja_settings[a];
					if(setting['group'] && setting['group'] == 'roundaboutOverlayDisplay') {
						ja_log(a +": " + e.value, 3);
						document.getElementById(setting["elementId"]).disabled = e.value == "rOverNever";
						document.getElementById(setting["elementId"]).parentNode.style.color =
							e.value != "rOverNever" ? "black" : "lightgrey";
					}
				});
				break;
			default:
				ja_log("Nothing to do for " + e.id, 2);
		}

		ja_log("Apply pending configuration changes? " + applyPending, 2);
		if(applyPending) {
			ja_log("Applying new settings now", 3);
			setTimeout(function(){ja_save();}, 500);

		} else {
			ja_log("No new settings to apply", 3);
		}
	};

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
			setTimeout(function(){ja_apply();}, 500);
		}
	};

	var ja_save = function saveJAOptions() {
		ja_log("Saving settings", 2);
		Object.getOwnPropertyNames(ja_settings).forEach(function (a) {
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
				case "select":
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
			setTimeout(function(){ja_apply();}, 400);
			return;
		}
		if(document.getElementById("sidepanel-ja") != null) {
			ja_log(Object.getOwnPropertyNames(ja_settings), 2);
			Object.getOwnPropertyNames(ja_settings).forEach(function (a) {
				var setting = ja_settings[a];
				ja_log(a, 2);
				ja_log(setting, 2);
				ja_log(document.getElementById(setting['elementId']), 2);
				switch (setting['elementType']) {
					case "checkbox":
						document.getElementById(setting['elementId']).checked = ja_getOption(a);
						document.getElementById(setting['elementId']).onchange(null);
						break;
					case "color":
					case "number":
					case "text":
						document.getElementById(setting['elementId']).value = ja_getOption(a);
						break;
					case "select":
						document.getElementById(setting['elementId']).value = ja_getOption(a);
						document.getElementById(setting['elementId']).onchange(null);
						break;
				}
			});
		} else {
			ja_log("WME not ready (no settings tab)", 2);
		}
		window.Waze.map.getLayersBy("uniqueName","junction_angles")[0].styleMap = ja_style();
		ja_calculate_real();
		ja_log(ja_options, 2);
	};

	var ja_reset = function resetJAOptions() {
		ja_log("Resetting settings", 2);
		if(localStorage != null) {
			localStorage.removeItem("wme_ja_options");
		}
		ja_options = {};
		ja_apply();
		return false;
	};

	function ja_helpLink(url, text) {
		var elem = document.createElement('li');
		var l = document.createElement('a');
		l.href = url;
		l.target = "_blank";
		l.appendChild(document.createTextNode(ja_getMessage(text)));
		elem.appendChild(l);
		return elem;
	}

	var ja_calculation_timer = {
		start: function() {
			ja_log("Starting timer", 2);
			this.cancel();
			var ja_calculation_timer_self = this;
			this.timeoutID = window.setTimeout(function(){ja_calculation_timer_self.calculate();}, 200);
		},

		calculate: function() {
			ja_calculate_real();
			delete this.timeoutID;
		},

		cancel: function() {
			if(typeof this.timeoutID == "number") {
				window.clearTimeout(this.timeoutID);
				ja_log("Cleared timeout ID" + this.timeoutID, 2);
				delete this.timeoutID;
			}
		}

	};

	function ja_calculate() {
		ja_calculation_timer.start();
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
					pointRadius: 3 + parseInt(ja_getOption("pointSize"), 10)
						+ (parseInt(ja_getOption("decimals")) > 0 ? 5 * parseInt(ja_getOption("decimals")) : 0),
					fontSize: "12px",
					fillColor: ja_getOption(fillColorOption),
					strokeColor: "#183800"
				}
			})
	}

	function ja_style() {
		ja_log("Point radius will be: " + (parseInt(ja_getOption("pointSize"), 10))
			+ (parseInt(ja_getOption("decimals") > 0 ? (5 * parseInt(ja_getOption("decimals"))).toString() : "0")), 2);
		return new window.OpenLayers.Style({
			fillColor: "#ffcc88",
			strokeColor: "#ff9966",
			strokeWidth: 2,
			label: "${angle}",
			fontWeight: "bold",
			pointRadius: parseInt(ja_getOption("pointSize"), 10)
				+ (parseInt(ja_getOption("decimals")) > 0 ? 5 * parseInt(ja_getOption("decimals")) : 0),
			fontSize: "10px"
		}, {
			rules: [
				new window.OpenLayers.Rule({
					symbolizer: {
					}
				}),
				ja_get_style_rule(ja_routing_type.TURN, "turnInstructionColor"),
				ja_get_style_rule(ja_routing_type.BC, "noInstructionColor"),
				ja_get_style_rule(ja_routing_type.KEEP,  "keepInstructionColor"),
				ja_get_style_rule(ja_routing_type.KEEP_LEFT,  "keepInstructionColor"),
				ja_get_style_rule(ja_routing_type.KEEP_RIGHT, "keepInstructionColor"),
				ja_get_style_rule(ja_routing_type.EXIT, "exitInstructionColor"),
				ja_get_style_rule(ja_routing_type.EXIT_LEFT, "exitInstructionColor"),
				ja_get_style_rule(ja_routing_type.EXIT_RIGHT, "exitInstructionColor"),
				ja_get_style_rule(ja_routing_type.PROBLEM, "problemColor"),
				ja_get_style_rule(ja_routing_type.ERROR, "problemColor"),
				ja_get_style_rule(ja_routing_type.ROUNDABOUT, "roundaboutColor"),
				ja_get_style_rule(ja_routing_type.ROUNDABOUT_EXIT, "exitInstructionColor"),

				new window.OpenLayers.Rule(
					{
						filter: new window.OpenLayers.Filter.Comparison({
							type: window.OpenLayers.Filter.Comparison.EQUAL_TO,
							property: "ja_type",
							value: "roundaboutOverlay"
						}),
						symbolizer: {
							pointRadius: 3 + parseInt(ja_getOption("pointSize"), 10)
								+ (parseInt(ja_getOption("decimals")) > 0 ? 5 * parseInt(ja_getOption("decimals")) : 0),
							fontSize: "12px",
							fillColor: ja_getOption("roundaboutOverlayColor"),
							fillOpacity: 0.1,
							strokeColor: ja_getOption("roundaboutOverlayColor"),
							label: ""
						}
					})

			]
		});
	}


	/*
	 * Translation helpers
	 */

	function ja_getMessage(key) {
		return I18n.translate('ja.' + key);
	}

	function ja_loadTranslations() {
		ja_log("Loading translations",2);

		var set_trans = function(loc, def) {
			return I18n.translations[loc].ja = def;
		};

		//Default language (English)
		set_trans(window.I18n.defaultLocale,
		set_trans('en', {
			name: "Junction Angle Info",
			settingsTitle: "Junction Angle settings",
			apply: "Apply",
			resetToDefault: "Reset to default",
			aAbsolute: "Absolute",
			aDeparture: "Departure",
			angleMode: "Angle mode",
			angleDisplay: "Angle display style",
			displayFancy: "Fancy",
			displaySimple: "Simple",
			guess: "Estimate routing instructions",
			noInstructionColor: "Color for best continuation",
			keepInstructionColor: "Color for keep prompt",
			exitInstructionColor: "Color for exit prompt",
			turnInstructionColor: "Color for turn prompt",
			problemColor: "Color for angles to avoid",
			roundaboutColor: "Color for roundabouts (with non-straight exits)",
			roundaboutOverlayColor: "Color for roundabout overlay",
			roundaboutOverlayDisplay: "Show roundabout circle",
			rOverNever: "Never",
			rOverSelected: "When selected",
			rOverAlways: "Always",
			decimals: "Number of decimals",
			pointSize: "Base point size",

			roundaboutnav: "WIKI: Roundabouts",
			ghissues: "JAI issue tracker"
		}));

		//Apply
		switch (I18n.locale) {

			//Swedish (svenska)
			case 'sv':
				set_trans('sv', {
					name: "Korsningsvinklar",
					settingsTitle: "Inställningar för korsningsvinklar",
					apply: "Godkänn",
					resetToDefault: "Återställ",
					aAbsolute: "Absolut",
					aDeparture: "Sväng",
					angleMode: "Vinkelvisning",
					angleDisplay: "Vinkelstil",
					displayFancy: "Grafisk",
					displaySimple: "Simpel",
					guess: "Gissa navigeringsinstruktioner",
					noInstructionColor: "Färg för \"ingen instruktion\"",
					keepInstructionColor: "Färg för\"håll höger/vänster\"-instruktion",
					exitInstructionColor: "Färg för \"ta av\"-instruktion",
					turnInstructionColor: "Färg för \"sväng\"-instruktion",
					problemColor: "Färg för vinklar att undvika",
					roundaboutColor: "Färg för rondell (med icke-räta vinklar)",
					roundaboutOverlayColor: "Färg för rondellcirkel",
					roundaboutOverlayDisplay: "Visa cirkel på rondell",
					rOverNever: "Aldrig",
					rOverSelected: "När vald",
					rOverAlways: "Alltid",
					decimals: "Decimaler",
					pointSize: "Cirkelns basstorlek"
				});
				break;

			//Finnish (Suomen kieli)
			case 'fi':
				set_trans('fi', {
					name: "Risteyskulmat",
					settingsTitle: "Rysteyskulmien asetukset",
					apply: "Aseta",
					resetToDefault: "Palauta",
					aAbsolute: "Absoluuttinen",
					aDeparture: "Käännös",
					angleMode: "Kulmien näyttö",
					angleDisplay: "Näyttötyyli",
					displayFancy: "Nätti",
					displaySimple: "Yksinkertainen",
					guess: "Arvioi reititysohjeet",
					noInstructionColor: "ohjeeton \"Suora\"-väri",
					keepInstructionColor: "\"Pysy vasemmalla/oikealla\"-ohjeen väri",
					exitInstructionColor: "\"Poistu\"-ohjeen väri",
					turnInstructionColor: "\"Käänny\"-ohjeen väri",
					problemColor: "Vältettävien kulmien väri",
					roundaboutColor: "Liikenneympyrän (jolla ei-suoria kulmia) ohjeen väri",
					roundaboutOverlayColor: "Liikenneympyrän korostusväri",
					roundaboutOverlayDisplay: "Korosta liikenneympyrä",
					rOverNever: "Ei ikinä",
					rOverSelected: "Kun valittu",
					rOverAlways: "Aina",
					decimals: "Desimaalien määrä",
					pointSize: "Ympyrän peruskoko"
				});
				break;

			//Polish (język polski)
			case 'pl':
				set_trans('pl', {
					settingsTitle: "Ustawienia",
					apply: "Zastosuj",
					resetToDefault: "Przywróć domyślne",
					aAbsolute: "Absolutne",
					aDeparture: "Rozjazdy",
					angleMode: "Tryb wyświetlania kątów",
					guess: "Szacuj komunikaty trasy",
					noInstructionColor: "Kolor najlepszej kontynuacji",
					keepInstructionColor: "Kolor dla \"kieruj się\"",
					exitInstructionColor: "Kolor dla \"zjedź\"",
					turnInstructionColor: "Kolor dla \"skręć\"",
					problemColor: "Kolor niedozwolonych manewrów lub niejednoznacznych kątów",
					roundaboutColor: "Kolor numerowanych zjazdów na rondzie",
					roundaboutOverlayColor: "Kolor markera ronda",
					roundaboutOverlayDisplay: "Pokazuj marker ronda",
					rOverNever: "Nigdy",
					rOverSelected: "Gdy zaznaczone",
					rOverAlways: "Zawsze",
					decimals: "Ilość cyfr po przecinku",
					pointSize: "Rozmiar punktów pomiaru"
				});
				break;

		}
	}


	/*
	 * Bootstrapping and logging
	 */

	function ja_registerLoginEvent() {
		"use strict";
		ja_log("Registering onLogin event listener", 1);
		ja_log(window.Waze.loginManager.events, 3);
		//HTML changes after login, even though the page is not reloaded. Need to defer init until then.
		window.Waze.loginManager.events.register("login", null, junctionangle_init);
		ja_log("Registered onLogin event listener", 1);
	}

	function ja_bootstrap(retries) {
		retries = retries || 0;
		//If Waze has not been defined in ~15 seconds, it probably won't work anyway. Might need tuning
		//for really slow devices?
		if (retries >= 30) {
			ja_log("Failed to bootstrap 30 times. Giving up.", 0);
			return;
		}

		try {
			//No current logged in user
			if (
				typeof window.Waze.map !== 'undefined' &&
				'undefined' !== typeof window.Waze.map.events.register &&
				'undefined' !== typeof window.Waze.selectionManager.events.register &&
				'undefined' !== typeof window.Waze.loginManager.events.register &&
				window.Waze.loginManager.user == null
				) {
				ja_registerLoginEvent();
			}
			//User already logged in and WME ready
			else if (
				typeof window.Waze.map !== 'undefined' &&
				'undefined' !== typeof window.Waze.map.events.register &&
				'undefined' !== typeof window.Waze.selectionManager.events.register &&
				'undefined' !== typeof window.Waze.loginManager.events.register &&
				window.Waze.loginManager.user != null &&
				null !== document.getElementById('user-info') &&
				null !== document.getElementById('user-info').getElementsByClassName('nav-tabs')[0] &&
				null !== document.getElementById('user-info').getElementsByClassName('nav-tabs')[0].getElementsByClassName('tab-content')[0]) {
				//Everything is ready, no need to wait longer than needed
				setTimeout(function () {
					junctionangle_init();
				}, 5);
			}
			//Some part of the WME was not yet fully loaded. Retry.
			else {
				setTimeout(function () {
					ja_bootstrap(++retries);
				}, 500);
			}
		} catch (err) {
			ja_log(err, 1);
			setTimeout(function () {
				ja_bootstrap(++retries);
			}, 500);
		}
	}

	/**
	 * Debug logging.
	 * @param ja_log_msg
	 * @param ja_log_level
	 */
	function ja_log(ja_log_msg, ja_log_level) {
		//##NO_FF_START##
		//Firefox addons should not use console.(log|error|debug), so these lines
		//are removed by the FF addon packaging script.
		if(typeof ja_log_level === 'undefined') ja_log_level = 1;
		if (ja_log_level <= junctionangle_debug) {
			if (typeof ja_log_msg == "object") {
				console.debug(ja_log_msg);
			}
			else {
				console.debug("WME Junction Angle: " + ja_log_msg);
			}
		}
		//##NO_FF_END##
	}

	ja_bootstrap();

}

//Dynamically create, add and run the script in the real page context. We really do need access to many of the objects...
var DLScript = document.createElement("script");
DLScript.textContent = '' +
	run_ja.toString() + ' \n' +
	'run_ja();';
DLScript.setAttribute("type", "application/javascript");
document.body.appendChild(DLScript);
