/* Copyright (c) 2006-2013 by OpenLayers Contributors (see authors.txt for
 * full list of contributors). Published under the 2-clause BSD license.
 * See license.txt in the OpenLayers distribution or repository for the
 * full text of the license. */


/**
 * @requires OpenLayers/Handler/Drag.js
 */

/**
 * Class: OpenLayers.Handler.Geometry
 * Handler to drag out a geometry collection on the map. Similar to the
 * regular polygon handler, but renders a geometry collection.
 *
 * Inherits from:
 *  - <OpenLayers.Handler.Drag>
 */
OpenLayers.Handler.Geometry = OpenLayers.Class(OpenLayers.Handler.Drag, {


    /**
     * Property: layerOptions
     * {Object} Any optional properties to be set on the sketch layer.
     */
    layerOptions: null,


    /**
     * Property: geometry
     * {<OpenLayers.Geometry.Collection>} The current collection.
     */
    geometry: null,


    /**
     * Property: feature
     * {<OpenLayers.Feature.Vector>} The currently drawn polygon feature
     */
    feature: null,


    /**
     * Property: angle
     * {Float} The angle from the location of the first click that started
     *      the drag to the current cursor position. Measured clockwise
     *      from the positive x-axis.
     */
    angle: 0,


    /**
     * Property: width
     * {Float} The current width of the geometry collection.
     */
    width: null,


    /**
     * Property: layer
     * {<OpenLayers.Layer.Vector>} The temporary drawing layer.
     */
    layer: null,


    /**
     * Property: origin
     * {<OpenLayers.Geometry.Point>} Location of the first mouse down.
     */
    origin: null,


    /**
     * Property: wkt
     * {String} The original wkt of the input geometry collection.
     */
    wkt: null,


    /**
     * Constructor: OpenLayers.Handler.Geometry
     * Create a new geometry handler.
     *
     * Parameters:
     * control - {<OpenLayers.Control>} The control that owns this handler
     * callbacks - {Object} An object with a properties whose values are
     *      functions.  Various callbacks described below.
     * options - {Object} An object to be set on the handler.
     */
    initialize: function(control, callbacks, options) {

        // Set the default style man if none is defined.
        if(!(options && options.layerOptions &&
            options.layerOptions.styleMap)) {

            this.style = OpenLayers.Util.extend(
              OpenLayers.Feature.Vector.style['default'], {}
            );

        }

        // Initialize the drag handler.
        OpenLayers.Handler.Drag.prototype.initialize.apply(this, [
          control, callbacks, options
        ]);

        this.options = options ? options : {};

    },


    /**
     * APIMethod: setOptions
     *
     * Parameters:
     * newOptions - {Object}
     */
    setOptions: function (newOptions) {
        OpenLayers.Util.extend(this.options, newOptions);
        OpenLayers.Util.extend(this, newOptions);
    },


    /**
     * APIMethod: setOptions
     *
     * Parameters:
     * geometry- {<OpenLayers.Geometry>}
     */
    setGeometry: function (geometry) {
        this.geometry = geometry;
    },


    /**
     * APIMethod: activate
     * Turn on the handler.
     *
     * Returns:
     * {Boolean} The handler was successfully activated
     */
    activate: function() {

        var activated = false;

        // Activate the drag handler.
        if (OpenLayers.Handler.Drag.prototype.activate.apply(
            this, arguments)) {

            // Create the sketch layer.
            this.layer = new OpenLayers.Layer.Vector(this.CLASS_NAME,
                OpenLayers.Util.extend({
                    displayInLayerSwitcher: false,
                    calculateInRange: OpenLayers.Function.True
                }, this.layerOptions)
            );

            // Add the layer.
            this.map.addLayer(this.layer);
            activated = true;

        }

        return activated;

    },


    /**
     * APIMethod: deactivate
     * Turn off the handler.
     *
     * Returns:
     * {Boolean} The handler was successfully deactivated
     */
    deactivate: function() {

        var deactivated = false;

        if (OpenLayers.Handler.Drag.prototype.deactivate.apply(
            this, arguments)) {

            // Remove the sketch layer and feature.
            if (this.layer.map !== null) {
                this.layer.destroy(false);
                if (this.feature) this.feature.destroy();
            }

            this.layer = null;
            this.feature = null;
            deactivated = true;
        }

        return deactivated;

    },


    /**
     * Method: down
     * Start drawing a new feature
     *
     * Parameters:
     * evt - {Event} The drag start event
     */
    down: function(evt) {

        // Break if no geomery is set.
        if (!this.geometry) return;

        // Get rid of any existing features on the sketch layer.
        this.clear();

        // Instead of directly using the geometry collection that was set
        // on the handler via `setGeometry`, clone off a new copy for the
        // drag. This preserves the "native" orientation of the geoemtry,
        // meaning that the starting rotation of the collection in future
        // drags will always be same as it is for the first drag.
        this.dragGeometry = this.geometry.clone();

        // Get the location of the initiating click.
        var loc = this.layer.getLonLatFromViewPortPx(evt.xy);
        this.origin = new OpenLayers.Geometry.Point(loc.lon, loc.lat);

        // At the start, set the radius equal to the horizontal width of
        // the collection. Since the scaling computation is based on the
        // ratio between the previous and current radii, the first real
        // radius registered by `move` will result in a scaling ratio of
        // the radius divided by the native width, which will scale the
        // collection down to exactly the size of the first radius.
        this.radius = this.measureWidth();

        // Create the sketch feature.
        this.feature = new OpenLayers.Feature.Vector();
        this.feature.geometry = this.dragGeometry;
        this.layer.addFeatures([this.feature], { silent: true });

        // Move bottom left corner of the geometry to the origin.
        var dx = loc.lon - this.dragGeometry.bounds.left;
        var dy = loc.lat - this.dragGeometry.bounds.bottom;
        this.dragGeometry.move(dx, dy);

        this.callback("create", [this.origin, this.feature]);

    },


    /**
     * Method: move
     * Respond to drag move events
     *
     * Parameters:
     * evt - {Evt} The move event
     */
    move: function(evt) {

        if (!this.geometry) return;

        // Get coordinates of the cursor location.
        var loc = this.layer.getLonLatFromViewPortPx(evt.xy);
        var point = new OpenLayers.Geometry.Point(loc.lon, loc.lat);

        // ** ROTATE **
        // Subtract the previous angle from the current angle to get the
        // relative change since the last move event.
        var prevAngle = this.angle;
        this.angle = this.calculateAngle(point, evt);
        this.dragGeometry.rotate(this.angle - prevAngle, this.origin);

        // ** SCALE **
        // Divide the current radius by the previous radius to get the
        // scaling factor relative to the previous size.
        var prevRadius = this.radius;
        this.radius = point.distanceTo(this.origin);
        this.dragGeometry.resize(this.radius / prevRadius, this.origin);

        // ** RENDER **
        this.layer.drawFeature(this.feature, this.style);

    },


    /**
     * Method: calculateAngle
     * Calculate the angle based on settings.
     *
     * Parameters:
     * point - {<OpenLayers.Geometry.Point>}
     * evt - {Event}
     *
     * Returns:
     * {Number} THe current angle from the origin, in degrees.
     */
    calculateAngle: function(point, evt) {
        return Math.atan2(
            point.y - this.origin.y,
            point.x - this.origin.x
        ) * (180 / Math.PI);
    },


    /**
     * Method: measureWidth
     * Measure and store the current width of the geometry collection.
     *
     * Returns:
     * {Number} The current width of the collection.
     */
    measureWidth: function() {
        this.dragGeometry.calculateBounds();
        return Math.abs(
            this.dragGeometry.bounds.right -
            this.dragGeometry.bounds.left
        );
    },


    /**
     * Method: up
     * Finish drawing the feature
     *
     * Parameters:
     * evt - {Event} The mouse up event
     */
    up: function(evt) {
        this.finalize();
    },


    /**
     * Method: out
     * Finish drawing the feature.
     *
     * Parameters:
     * evt - {Event} The mouse out event
     */
    out: function(evt) {
        this.finalize();
    },

    /**
     * APIMethod: cancel
     * Finish the geometry and call the `cancel` callback.
     */
    cancel: function() {
        this.callback('cancel', null);
        this.finalize();
    },


    /**
     * Method: finalize
     * Teset `origin` and `angle`.
     */
    finalize: function() {
        this.origin = null;
        this.angle  = 0;
    },


    /**
     * APIMethod: clear
     * Clear any rendered features on the temporary layer.
     */
    clear: function() {
        if (this.layer) {
            this.layer.renderer.clear();
            this.layer.destroyFeatures();
        }
    },


    /**
     * Method: callback
     * Trigger the control's named callback with the given arguments
     *
     * Parameters:
     * name - {String} The callback key.
     * args - {Array} An array of arguments.
     */
    callback: function (name, args) {

        if (!this.geometry) return;

        // Clear the sketch layer if drag is ending.
        if (name == 'done' || name == 'cancel') this.clear();

        // Fire the callback.
        if (this.callbacks[name]) {
            this.callbacks[name].apply(
                this.control, [this.dragGeometry.clone()]
            );
        }

    },


    CLASS_NAME: "OpenLayers.Handler.Geometry"


});
