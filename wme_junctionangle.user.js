// ==UserScript==
// @name                WME Junction Angle info
// @namespace           http://userscripts.org/users/508112
// @description         Show the angle between two selected (and connected) segments
// @include             /^https:\/\/www\.waze\.com\/(.{2,6}\/)?(beta_)?editor\/.*$/
// @updateURL           https://userscripts.org/scripts/source/160864.user.js
// @version             1.5.7
// @grant               none
// @copyright		2013 Michael Wikberg <michael@wikberg.fi>
// ==/UserScript==

/**
 * Copyright 2013 Michael Wikberg <michael@wikberg.fi>
 * 
 */
var junctionangle_version = "1.5.7";
var junctionangle_debug = 1;	//0: no output, 1: basic info, 2: debug 3: crazy debug
var ja_wazeModel, ja_wazeMap, ja_selectionManager;
var ja_features = [];

function junctionangle_bootstrap() {
	var bGreasemonkeyServiceDefined     = false;

	try
	{
		if (typeof Components.interfaces.gmIGreasemonkeyService === "object")
		{
			bGreasemonkeyServiceDefined = true;
		}
	}
	catch (err)
	{
		//Ignore.
	}
	if ( typeof unsafeWindow === "undefined"  ||  ! bGreasemonkeyServiceDefined)
	{
		unsafeWindow    = ( function ()
		{
			var dummyElem   = document.createElement('p');
			dummyElem.addEventListener("getwin", function(event){return window;});
			var dummyEvent = new CustomEvent("getwin",{"detail":{}});
			return dummyElem.dispatchEvent(dummyEvent);
		} ) ();
	}
	/* begin running the code! */
	setTimeout(function() { junctionangle_init();}, 500);
}

function ja_log(ja_log_msg, ja_log_level) {
	if(ja_log_level <= junctionangle_debug) {
		if(typeof ja_log_msg == "object") {
			//ja_log(arguments.callee.caller.toString(), ja_log_level);
			console.log(ja_log_msg);
		}
		else {
			console.log("WME Junction Angle: " + ja_log_msg);
		}
	}
}

function junctionangle_init()
{
	// access the bits of WME we need
	//Running in greasmonkey|tampermonkey|chrome extension
	if(this.Waze != null) {
		//alert('we have waze!!!');
		ja_wazeMap = wazeMap;
		ja_wazeModel = wazeModel;
		ja_loginManager = loginManager;
		ja_selectionManager = selectionManager;
		ja_OpenLayers = OpenLayers;
	}
	//Running as firefox extension
	else {
		//alert('unsafeWindow?');
		ja_wazeMap = unsafeWindow.wazeMap;
		ja_wazeModel = unsafeWindow.wazeModel;
		ja_loginManager = unsafeWindow.loginManager;
		ja_selectionManager = unsafeWindow.selectionManager;
		ja_OpenLayers = unsafeWindow.OpenLayers;
		//get jQuery support
		$ = unsafeWindow.$;
	}

	//selected nodes changed
	ja_selectionManager.events.register("selectionchanged", null, ja_calculate);
	
	//probably unnecessary
	//map is moved or resized
	//ja_wazeMap.events.register("moveend", null, ja_calculate);

	//mouse button released (FIXME: wanted to listen to "segment or node moved", but could not find a suitable event...)
	ja_wazeMap.events.register("mouseup", null, ja_calculate);

	//HTML changes after login. Better do init again.
	ja_loginManager.events.register("afterloginchanged", null, junctionangle_init);
	
	/**
	 * Make some style settings
	 */
	 var ja_style = new ja_OpenLayers.Style({
		fillColor: "#ffcc88",
		strokeColor: "#ff9966",
		strokeWidth: 2,
		label: "${angle}",
		fontWeight: "bold",
		pointRadius: 10,
		fontSize: "10px"
	}, {
		rules: [
			new ja_OpenLayers.Rule({
				symbolizer: {
				}
			}),
			new ja_OpenLayers.Rule({
				filter: new ja_OpenLayers.Filter.Comparison({
					  type: ja_OpenLayers.Filter.Comparison.EQUAL_TO,
					  property: "ja_type",
					  value: "junction"
				  }), 
				symbolizer: {
					pointRadius: 13,
					fontSize: "12px",
					fillColor: "#4cc600",
					strokeColor: "#183800"
				}
			})
		]
	});

	//try to see if we already have a layer
	if(ja_wazeMap.getLayersByName("JunctionAngles").length > 0) {
	
	} else {
		// Create a vector layer and give it your style map.
		ja_mapLayer = new ja_OpenLayers.Layer.Vector("JunctionAngles", {
			styleMap: new ja_OpenLayers.StyleMap(ja_style)
		});

		ja_wazeMap.addLayer(ja_mapLayer);
		ja_log("version " + junctionangle_version + " loaded.", 0);
		
		ja_log(ja_wazeMap,3);
		ja_log(ja_wazeModel,3);
		ja_log(ja_loginManager,3);
		ja_log(ja_selectionManager,3);
		ja_log(ja_mapLayer,3);
		ja_log(ja_OpenLayers,3);
		//try to resize the layer selection box... Apparently the only (easy) way is to actually override the CSS
		var ja_newSwitcherStyle = $('<style>.WazeControlLayerSwitcher:hover {background-color: #FFFFFF; max-height: 390px; width: 200px;}</style>');
		$('html > head').append(ja_newSwitcherStyle);
	}
}

function ja_calculate()
{
	//clear old info
	ja_mapLayer.destroyFeatures();

	//try to show all angles for all selected segments
	if(ja_selectionManager.selectedItems.length == 0) return 1;
	ja_log("Checking junctions for " + ja_selectionManager.selectedItems.length + " segments", 1);
	var ja_nodes = [];

	for(i = 0; i < ja_selectionManager.selectedItems.length; i++) {
		ja_log(ja_selectionManager.selectedItems[i],3);
		switch(ja_selectionManager.selectedItems[i].type) {
			case "node":
				ja_nodes.push(ja_selectionManager.selectedItems[i].fid);
				break;
			case "segment":
		//segments selected?
				if(ja_selectionManager.selectedItems[i].attributes.fromNodeID != null &&
					ja_nodes.indexOf(ja_selectionManager.selectedItems[i].attributes.fromNodeID) == -1) {
					ja_nodes.push(ja_selectionManager.selectedItems[i].attributes.fromNodeID);
				}
				if(ja_nodes.indexOf(ja_selectionManager.selectedItems[i].attributes.toNodeID != null &&
					ja_nodes.indexOf(ja_selectionManager.selectedItems[i].attributes.toNodeID) == -1)) {
					ja_nodes.push(ja_selectionManager.selectedItems[i].attributes.toNodeID);
				}
				break;
			default:
				ja_log("Found unknown item type: " + ja_selectionManager.selectedItems[i].type,1);
		}
	}

	ja_features = [];

	for(i = 0; i < ja_nodes.length; i++) {
		node = ja_wazeModel.nodes.get(ja_nodes[i]);
		if(node == null || !node.hasOwnProperty('attributes')) {
			//Oh oh.. should not happen?
			ja_log(ja_nodes,2)
			ja_log(ja_wazeModel,3)
			ja_log(ja_wazeModel.nodes,3)
			continue;
		}
		//check connected segments
		segments = node.attributes.segIDs;
		ja_log(node,2);
		
		//ignore of we have less than 2 segments
		if(segments.length <= 1) {
			ja_log("Found only " + segments.length + " connected segments at " + ja_nodes[i] + ", not calculating anything...", 2);
			continue;
		}
		
		ja_log("Calculating angles for " + segments.length + " segments", 2);
		
		angles = new Array();
		selected_segments = 0;

		for(j = 0; j < segments.length; j++) {
			s = ja_wazeModel.segments.get(segments[j]);
			a = ja_getAngle(ja_nodes[i], s);
			ja_log("j: " + j + "; Segment " + segments[j] + " angle is " + a, 3);
			angles[j] = new Array(a, segments[j], s != null ? s.isSelected() : false);
			if(s != null ? s.isSelected() : false) selected_segments++;
		}

		ja_log(angles,2);
		//sort angle data (ascending)
		angles.sort(function(a,b){return a[0] - b[0]});
		ja_log(angles,3);
		ja_log(selected_segments,3);

		switch (ja_wazeMap.zoom) {
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
		ja_log("zoom: " + ja_wazeMap.zoom + " -> distance: " + ja_label_distance, 2);
		
		//if we have two connected segments selected, do some magic to get the turn angle only =)
		if(selected_segments == 2) {
			ja_selected = [];
			ja_extra_space_multiplier = 1;
			
			for(j = 0; j < angles.length; j++) {
				if(angles[j][2]) {
					ja_selected.push(angles[j]);
				}
			}
			
			a = ((ja_selected[1][0] - ja_selected[0][0]) + 360) % 360;
			ha = (360 + (ja_selected[0][0]+ja_selected[1][0])/2) % 360;

			ja_log(a,3);
			if(a < 60) {
				ja_log("Sharp angle", 2);
				ja_extra_space_multiplier = 2;
			}

			if(a > 180) {
				//a2 = a - 180;
				ha = ha + 180;
			}

			
			ja_log("Angle between " + ja_selected[0][1] + " and " + ja_selected[1][1] + " is " + a + " and position for label should be at " + ha, 3);

			//put the angle point
			ja_features.push(new ja_OpenLayers.Feature.Vector(
				new ja_OpenLayers.Geometry.Point(
					node.geometry.x + (ja_extra_space_multiplier * ja_label_distance * Math.cos((ha*Math.PI)/180)), 
					node.geometry.y + (ja_extra_space_multiplier * ja_label_distance * Math.sin((ha*Math.PI)/180))
					)
					, { angle: Math.round(Math.abs(180 - a))+"°", ja_type: "junction" }
			));
		}
		else {
			//get all segment angles
			for(j = 0; j < angles.length; j++) {
				a = (360 + (angles[(j+1)%angles.length][0] - angles[j][0])) % 360;
				ha = (360 + ((a/2) + angles[j][0])) % 360;
				
				ja_log("Angle between " + angles[j][1] + " and " + angles[(j+1)%angles.length][1] + " is " + a + " and position for label should be at " + ha, 3);
				//push the angle point
				ja_features.push(new ja_OpenLayers.Feature.Vector(
					new ja_OpenLayers.Geometry.Point(
						node.geometry.x + (ja_label_distance * Math.cos((ha*Math.PI)/180)), node.geometry.y + (ja_label_distance * Math.sin((ha*Math.PI)/180))
						)
						, { angle: Math.round(a)+"°", ja_type: "generic" }
				));
			}
		}
	}

	ja_log(ja_features, 2);
	//Update the displayed angles
	ja_mapLayer.addFeatures(ja_features);
}

function ja_points_equal(point1, point2) {
	return (point1.x == point2.x && point1.y == point2.y);
}

function ja_get_first_point(segment) {
	return segment.geometry.components[0];
}

function ja_get_last_point(segment) {
	return segment.geometry.components[segment.geometry.components.length-1];
}

function ja_get_second_point(segment) {
	return segment.geometry.components[1];
}

function ja_get_next_to_last_point(segment) {
	return segment.geometry.components[segment.geometry.components.length-2];
}

//get the absolute angle for a segment end point
function ja_getAngle(ja_node, ja_segment) {
	if(ja_node == null || ja_segment == null) return null;
	if(ja_segment.attributes.fromNodeID == ja_node) {
		ja_dx = ja_get_second_point(ja_segment).x - ja_get_first_point(ja_segment).x;
		ja_dy = ja_get_second_point(ja_segment).y - ja_get_first_point(ja_segment).y;
	} else {
		ja_dx = ja_get_next_to_last_point(ja_segment).x - ja_get_last_point(ja_segment).x;
		ja_dy = ja_get_next_to_last_point(ja_segment).y - ja_get_last_point(ja_segment).y;
	}
	ja_log(ja_node + " / " + ja_segment + ": dx:" + ja_dx + ", dy:" + ja_dy);
	ja_angle = Math.atan2(ja_dy,ja_dx);
	return (360+(ja_angle*180/Math.PI))%360;
}

junctionangle_bootstrap();
