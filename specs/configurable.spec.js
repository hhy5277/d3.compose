(function(d3, _, helpers, extensions) {

  describe('configurable', function() {    
    var data = {
      a: [
        {key: 'a1', values: [{x:0,y:100}, {x:25,y:200}, {x:50,y:300}, {x:75,y:500}]},
        {key: 'a2', values: [{x:0,y:-100}, {x:25,y:-200}, {x:50,y:-300}, {x:100,y:-800}]}
      ],
      b: [
        {key: 'b', values: [{x:-10,y:1}, {x:-20,y:2}, {x:-30,y:3}, {x:-40,y:4}]}
      ],
      c: [
        {key: 'c', values: [{x:-10,y:1}, {x:-20,y:2}, {x:-30,y:3}, {x:-40,y:4}]}
      ]
    };
    var values = {
      a: [
        {key: 'a1', values: [{x:'a',y:100}, {x:'b',y:200}, {x:'c',y:300}, {x:'d',y:500}]},
        {key: 'a2', values: [{x:'a',y:-100}, {x:'b',y:-200}, {x:'c',y:-300}, {x:'e',y:-800}]}
      ],
      b: [
        {key: 'b', values: [{x:'-a',y:1}, {x:'-b',y:2}, {x:'-c',y:3}, {x:'-d',y:4}]}
      ],
      c: [
        {key: 'c', values: [{x:'-a',y:1}, {x:'-b',y:2}, {x:'-c',y:3}, {x:'-d',y:4}]}
      ]
    };
    var chart, fixture, selection, configuration;

    function setupChart(config) {
      chart = selection.chart('Configurable', config);

      _.each(chart.axes, function(axis) {
        axis.setScales();
      });

      return chart;
    }

    beforeEach(function() {
      fixture = setFixtures('<div id="chart"></div>');
      selection = d3.select('#chart')
        .append('svg');

      configuration = {
        type: 'Values',
        charts: [
          {type: 'Bars', dataKey: 'a'},
          {type: 'Line', dataKey: 'b'}
        ],
        axes: {
          x: {scale: {type: 'ordinal', domain: ['a', 'b', 'c'], roundRangeBands: [[0, 600]]}},
          y: {scale: {domain: [0, 1000], range: [400, 0]}}
        },
        legend: {},
        title: ''
      };

      setupChart(configuration);
    });

    describe('axes', function() {
      it('should have x and y axes by default', function() {
        expect(_.keys(chart.axes).length).toEqual(2);
        expect(chart.axes.x).toBeDefined();
        expect(chart.axes.y).toBeDefined();
      });

      it('should pass x and y axes scales to charts', function() {
        expect(chart.charts[0].xScale().domain()).toEqual(['a', 'b', 'c']);
        expect(chart.charts[0].yScale().domain()).toEqual([0, 1000]);
        expect(chart.charts[1].xScale().domain()).toEqual(['a', 'b', 'c']);
        expect(chart.charts[1].yScale().domain()).toEqual([0, 1000]);
      });

      it('should pass matching axis to chart', function() {
        _.extend(configuration.axes, {
          secondaryX: {
            scale: {type: 'ordinal', domain: ['d', 'e', 'f'], rangeRoundBands: [[0, 600]]},
            dataKey: 'a'
          },
          secondaryY: {
            scale: {domain: [0, 500], range: [400, 0]},
            dataKey: 'b'
          }
        });
        setupChart(configuration);

        expect(chart.charts[0].xScale().domain()).toEqual(['d', 'e', 'f']);
        expect(chart.charts[0].yScale().domain()).toEqual([0, 1000]);
        expect(chart.charts[1].xScale().domain()).toEqual(['a', 'b', 'c']);
        expect(chart.charts[1].yScale().domain()).toEqual([0, 500]);
      });
    });

    describe('data', function() {
      it('should extract data by dataKey(s)', function() {
        var extracted = chart.extractData({options: {dataKey: 'a'}}, data);
        expect(_.pluck(extracted, 'key')).toEqual(['a1', 'a2']);

        extracted = chart.extractData({options: {dataKey: 'b'}}, values);
        expect(_.pluck(extracted, 'key')).toEqual(['b']);

        extracted = chart.extractData({options: {dataKey: ['a', 'b']}}, data);
        expect(_.pluck(extracted, 'key')).toEqual(['a1', 'a2', 'b']);

        extracted = chart.extractData({options: {dataKey: ['b', 'c']}}, values);
        expect(_.pluck(extracted, 'key')).toEqual(['b', 'c']);
      });

      it('should extract data by filterKeys', function() {
        var extracted = chart.extractData({options: {filterKeys: ['a']}}, data);
        expect(_.pluck(extracted, 'key')).toEqual(['b', 'c']);

        extracted = chart.extractData({options: {filterKeys: ['b']}}, values);
        expect(_.pluck(extracted, 'key')).toEqual(['a1', 'a2', 'c']);

        extracted = chart.extractData({options: {filterKeys: ['a', 'b']}}, data);
        expect(_.pluck(extracted, 'key')).toEqual(['c']);

        extracted = chart.extractData({options: {filterKeys: ['b', 'c']}}, values);
        expect(_.pluck(extracted, 'key')).toEqual(['a1', 'a2']);
      });
    });
  });

})(d3, _, d3.chart.helpers, d3.chart.extensions);
