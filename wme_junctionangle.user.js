// ==UserScript==
// @name                WME Junction Angle info
// @namespace           http://userscripts.org/users/508112
// @description         Show the angle between two selected (and connected) segments
// @include             https://*.waze.com/editor/*
// @include             https://*.waze.com/map-editor/*
// @include             https://*.waze.com/beta_editor/*
// @updateURL           https://userscripts.org/scripts/source/160864.user.js
// @version             1.2
// @grant               none
// ==/UserScript==

/**
 * Copyright 2013 Michael Wikberg <michael@wikberg.fi>
 * 
 */
var junctionangle_version = "1.2";
var junctionangle_debug = false;
var ja_wazeModel, ja_wazeMap;
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
			dummyElem.setAttribute ('onclick', 'return window;');
			return dummyElem.onclick ();
		} ) ();
	}
	/* begin running the code! */
	setTimeout(junctionangle_init, 500);
}

function junctionangle_init()
{
	// access the bits of WME we need
	ja_wazeMap = unsafeWindow.wazeMap;
	ja_wazeModel = unsafeWindow.wazeModel;
	ja_loginManager = unsafeWindow.loginManager;
	ja_selectionManager = unsafeWindow.selectionManager;
	ja_OpenLayers = unsafeWindow.OpenLayers;

	//selected nodes changed
	ja_selectionManager.events.register("selectionchanged", null, ja_calculate);
	
	//map is moved or resized
	ja_wazeMap.events.register("moveend", null, ja_calculate);

	//mouse button released (FIXME: wanted to listen to "segment changed", but could not find a suitable event...)
	ja_wazeMap.events.register("mouseup", null, ja_calculate);

	//HTML changes after login. Better do init again.
	ja_loginManager.events.register("afterloginchanged", null, junctionangle_init);
	
	//ja_mapLayer.removeAllFeatures();
	//ja_mapLayer.destroyFeatures();
	//ja_mapLayer.setName("JunctionAngles");

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
		fontSize: "11px"
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
					  value: "junction",
				  }), 
				symbolizer: {
					pointRadius: 13,
					fontSize: "13px",
					fillColor: "#4cc600",
					strokeColor: "#183800",
				}
			}),
		]
	});

	// Create a vector layer and give it your style map.
	ja_mapLayer = new ja_OpenLayers.Layer.Vector("JunctionAngles", {
		styleMap: new ja_OpenLayers.StyleMap(ja_style)
	});

	ja_wazeMap.addLayer(ja_mapLayer);
	console.log("WME junction angle calculator (" + junctionangle_version + ") loaded.");
	
	if(junctionangle_debug) {
		console.log(ja_wazeMap);
		console.log(ja_wazeModel);
		console.log(ja_loginManager);
		console.log(ja_selectionManager);
		console.log(ja_mapLayer);
		console.log(ja_OpenLayers);

	}
}


function ja_calculate()
{
	//clear old info
	ja_mapLayer.destroyFeatures();
	//try to show all angles for all selected segments
	console.log("Checking junctions for " + ja_selectionManager.selectedItems.length + " segments:");
	if(ja_selectionManager.selectedItems.length == 0) return 1;
	var ja_nodes = [];

	for(i = 0; i < ja_selectionManager.selectedItems.length; i++) {
		//console.log(ja_selectionManager.selectedItems[i]);
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
				console.log("Found unknown item type: " + ja_selectionManager.selectedItems[i].type);
		}
	}

	ja_features = [];

	for(i = 0; i < ja_nodes.length; i++) {
		node = ja_wazeModel.nodes.get(ja_nodes[i]);
		if(node == null || !node.hasOwnProperty('attributes')) {
			/*
			//Oh oh.. should not happen?
			console.log(ja_nodes)
			console.log(ja_wazeModel)
			console.log(ja_wazeModel.nodes)
			*/
			continue;
		}
		//check connected segments
		segments = node.attributes.segIDs;
		console.log(node);
		
		//ignore of we have less than 2 segments
		if(segments.length <= 1) {
			console.log("Found only " + segments.length + " connected segments at " + ja_nodes[i] + ", not calculating anything...");
			continue;
		}
		
		if(junctionangle_debug) console.log("Wanting to calculate angles for " + segments.length + " segments");
		
		angles = new Array();
		selected_segments = 0;

		for(j = 0; j < segments.length; j++) {
			s = ja_wazeModel.segments.get(segments[j]);
			a = ja_getAngle(ja_nodes[i], s);
			//console.log("j: " + j + "; Segment " + segments[j] + " angle is " + a);
			angles[j] = new Array(a, segments[j], s != null ? s.isSelected() : false) // ja_selectionManager.selectedItems.indexOf(s) > -1);
			if(s != null ? s.isSelected() : false) selected_segments++;
		}

		//console.log(angles);
		//sort angle data (ascending)
		angles.sort(function(a,b){return a[0] - b[0]});
		//console.log(angles);
		//console.log(selected_segments);

		//console.log(node);
		
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
		//console.log("zoom: " + ja_wazeMap.zoom + " -> distance: " + ja_label_distance);
		
		//if we have two connected segments selected, do some magic to get the turn angle only =)
		if(selected_segments == 2) {
			ja_selected = [];
			
			for(j = 0; j < angles.length; j++) {
				if(angles[j][2]) {
					ja_selected.push(angles[j]);
				}
			}
			
			a = ((ja_selected[1][0] - ja_selected[0][0]) + 360) % 360;
			ha = (360 + (ja_selected[0][0]+ja_selected[1][0])/2) % 360;

			if(a > 180) {
				//a2 = a - 180;
				ha = ha + 180;
			}

			a2 = Math.abs(180 - a);
			//console.log("Angle between " + ja_selected[0][1] + " and " + ja_selected[1][1] + " is " + a + "(" + a2 + ") and position for label should be at " + ha);

			//put the angle point
			ja_features.push(new ja_OpenLayers.Feature.Vector(
				new ja_OpenLayers.Geometry.Point(
					node.geometry.x + (ja_label_distance * Math.cos((ha*Math.PI)/180)), node.geometry.y + (ja_label_distance * Math.sin((ha*Math.PI)/180))
					)
					, { angle: Math.round(a2), ja_type: "junction" }
			));
		}
		else {
			//get all segment angles
			for(j = 0; j < angles.length; j++) {
				a = (360 + (angles[(j+1)%angles.length][0] - angles[j][0])) % 360;
				ha = (360 + ((a/2) + angles[j][0])) % 360;
				//console.log("Angle between " + angles[j][1] + " and " + angles[(j+1)%angles.length][1] + " is " + a + " and position for label should be at " + ha);

				//push the angle point
				ja_features.push(new ja_OpenLayers.Feature.Vector(
					new ja_OpenLayers.Geometry.Point(
						node.geometry.x + (ja_label_distance * Math.cos((ha*Math.PI)/180)), node.geometry.y + (ja_label_distance * Math.sin((ha*Math.PI)/180))
						)
						, { angle: Math.round(a), ja_type: "generic" }
				));
				
				
			}
		}
	}

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
function ja_getAngle(node, segment) {
	if(node == null || segment == null) return;
	if(segment.attributes.fromNodeID == node) {
		ja_dx = ja_get_second_point(segment).x - ja_get_first_point(segment).x;
		ja_dy = ja_get_second_point(segment).y - ja_get_first_point(segment).y;
	} else {
		ja_dx = ja_get_next_to_last_point(segment).x - ja_get_last_point(segment).x;
		ja_dy = ja_get_next_to_last_point(segment).y - ja_get_last_point(segment).y;
	}
	ja_angle = Math.atan2(ja_dy,ja_dx);
	return (360+(ja_angle*180/Math.PI))%360;
}

junctionangle_bootstrap();