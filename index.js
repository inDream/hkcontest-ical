var fs = require('fs');

var _ = require('lodash');
var cheerio = require('cheerio');
var ical = require('ical-generator');
var moment = require('moment');
var needle = require('needle');

function trim(s) {
  var str = _.trim(s);
  str = str.replace(/^\s+|\s+$|\t/g, '');
  return str;
}

function toDate(s) {
  var d = s.split('-');
  return moment().year(d[2]).month(d[1]).date(d[0]).startOf('day').toDate();
}

function getId(link) {
  var e = link.match(/ai1ec_event=(\d+)&/);
  var i = link.match(/instance_id=(\d+)/);
  return e ? e[1] : i ? i[1] : null;
}

function initMap(data) {
  categoryMap = {};
  tagMap = {};
  var c = cheerio.load(data.categories);
  var t = cheerio.load(data.tags);
  var categories = c('.ai1ec-category');
  var tags = t('.ai1ec-tag');
  var cid, tid, cname, tname;
  categories.each(function(i, e) {
    cid = _(c(e).attr('href')).split('~').last();
    cname = c(e).find('span').attr('title');
    categoryMap[cname] = cid;
    categoryEvents[cid] = [cname];
  });
  tags.each(function(i, e) {
    tid = _(t(e).attr('href')).split('~').last();
    if (tid != 881) {
      tname = trim(t(e).text()).split(' ')[0];
      tagMap[tname] = tid;
      tagEvents[tid] = [tname];
    }
  });
}

function createEvents(type, tid, name, events) {
  var cal = ical({
    domain: 'hkcontest.wlc.io',
    name: 'HKContest-' + name,
    timezone: 'Asia/Hong_Kong',
    ttl: oneDay
  });
  events.forEach(function(event) {
    cal.createEvent(allEvents[event]);
  });
  cal.save('./public/' + type + tid + '.ical');
}

function generateCal() {
  console.log('Started generate iCal.');
  var events;
  var tags = Object.keys(tagEvents);
  tags.forEach(function(tag) {
    events = tagEvents[tag];
    createEvents('tag', tag, events.shift(), events);
  });
  var categories = Object.keys(categoryEvents);
  categories.forEach(function(category) {
    events = categoryEvents[category];
    createEvents('cat', category, events.shift(), events);
  });
  createEvents('all', '', 'All', Object.keys(allEvents));
  var events = JSON.stringify(allEvents);
  fs.writeFile('events.json', events);
  console.log('Finished generate iCal.');
}

function fetch(type) {
  var url = 'http://www.hkcontest.com/hk2/?ai1ec=action~agenda|'+ type +
    '&request_type=json';

  needle.get(url, function(err, resp, data) {
    if (tagMap === null) {
      initMap(data);
    }
    var $ = cheerio.load(data.html);
    var dates = $('.ai1ec-date');
    var event, title, date, period, lastdate, category, link, tag, description;
    var events, categories, tags, periods;
    var count = 0;
    dates.each(function(i, e) {
      date = $(e).find('.ai1ec-date-title').attr('href');
      date = date.length ? _(date).split('~').last() : lastdate;
      periods = [];
      period = trim($(e).find('.ai1ec-event-time').text());
      if (period.indexOf('–') > 0) {
        period = period.split(' – ');
        period.forEach(function(p) {
          p = p.split(' ');
          periods.push(moment().month(p[0], 'MMMM').date(p[1]).startOf('day'));
        });
      }
      events = $(e).find('.ai1ec-event');
      events.each(function(i, k) {
        count++;
        tag = [];
        category = [];
        title = trim($(k).find('.ai1ec-event-title').text());
        link = $(k).find('.ai1ec-read-more').attr('href');
        if (title.length) {
          categories = $(k).find('.ai1ec-category');
          categories.each(function(i, c) {
            category.push(_.trim($(c).text()));
          });
          tags = $(k).find('.ai1ec-tag');
          tags.each(function(i, c) {
            tag.push(_.trim($(c).text()));
          });
          description = '類別: ' + tag.join(', ') + '\n年齡組別: ' +
            category.join(', ') + '\n' + link;
          event = {
            id: getId(link),
            start: toDate(date),
            end: periods.length ? periods[1].toDate() : toDate(date),
            summary: title,
            description: description,
            url: link,
            allDay: true
          };
          allEvents[event.id] = event;
          category.forEach(function(c) {
            categoryEvents[categoryMap[c]].push(event.id);
          });
          tag.forEach(function(t) {
            tagEvents[tagMap[t]].push(event.id);
          });
        }
      });
      lastdate = date + '';
    });
    console.log('Loaded ' + count + ' events until ' + date + '.');
    date = Math.round(+toDate(date) / 1000);
    // Fix same day bug
    if (date <= endTime) {
      date = endTime + oneDay;
    }
    if (date - startTime < fetchMax) {
      lasttype = '|time_limit~' + date;
      endTime = date;
      fetch(lasttype);
    } else {
      generateCal();
    }
  });
}

var oneDay = 60 * 60 * 24;
var fetchMax = oneDay * parseInt(process.argv[2] || 60);
var startTime = Math.round(+moment().startOf('month').startOf('day') / 1000);
var endTime = +startTime;
var lasttype = '|time_limit~' + startTime;
var allEvents = {};
var categoryMap = null;
var categoryEvents = {};
var tagMap = null;
var tagEvents = {};
fetch(lasttype);
