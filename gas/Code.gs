var SPREADSHEET_ID = "12ZXPvqk5-gtos9sOZREPi6wPoPMiFxss-lkLonKKMsQ";
var TARGET_SHEET_GID = 49856829;
var TIMELINE_SHEET_GID = 1348031489;
var GROUP_NUMBERS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
var TIMELINE_STEP_MINUTES = 15;
var TIMELINE_DEFAULT_START = "08:00";
var TIMELINE_DEFAULT_END = "17:30";

function getTargetSheet_() {
  return getSheetByGid_(TARGET_SHEET_GID);
}

function getTimelineSheet_() {
  return getSheetByGid_(TIMELINE_SHEET_GID);
}

function getSheetByGid_(gid) {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = spreadsheet.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) {
      return sheets[i];
    }
  }

  throw new Error("指定されたgidのシートが見つかりません: " + gid);
}

function doPost(e) {
  var sheet = getTargetSheet_();
  var params = JSON.parse(e.postData.contents);
  var groupNo = params.groupNumber;
  var pin = params.pin;
  var data = params.data || [];

  var values = sheet.getDataRange().getValues();
  var rowToUpdate = -1;

  for (var i = 1; i < values.length; i++) {
    if (values[i][0] == groupNo) {
      rowToUpdate = i + 1;
      break;
    }
  }

  if (rowToUpdate > 0) {
    sheet.getRange(rowToUpdate, 2).setValue(pin);
    sheet.getRange(rowToUpdate, 3).setValue(JSON.stringify(data));
    sheet.getRange(rowToUpdate, 4).setValue(new Date());
  } else {
    sheet.appendRow([groupNo, pin, JSON.stringify(data), new Date()]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;

  if (action === "timeline") {
    return writeTimeline_();
  }

  var allData = readAllGroups_();

  return ContentService
    .createTextOutput(JSON.stringify(allData))
    .setMimeType(ContentService.MimeType.JSON);
}

function readAllGroups_() {
  var sheet = getTargetSheet_();
  var values = sheet.getDataRange().getValues();
  var allData = [];

  for (var i = 1; i < values.length; i++) {
    var groupNumber = values[i][0];
    var pin = values[i][1];
    var rawData = values[i][2];
    var parsedData = [];

    if (!groupNumber) {
      continue;
    }

    if (rawData) {
      try {
        parsedData = JSON.parse(rawData);
      } catch (err) {
        parsedData = [];
      }
    }

    allData.push({
      groupNumber: normalizeGroupNumber_(groupNumber),
      pin: pin,
      data: parsedData
    });
  }

  return allData;
}

function writeTimeline_() {
  var allData = readAllGroups_();
  var timelineSheet = getTimelineSheet_();
  var generatedAt = new Date();
  var rows = [];
  var barRanges = [];
  var headerRows = [];
  var dayTitleRows = [];
  var detailRows = [];

  rows.push(["更新日時", generatedAt]);
  rows.push([]);

  [2, 3].forEach(function(dayId) {
    var daySchedules = buildDaySchedules_(allData, dayId);
    var range = getDayMinuteRange_(daySchedules);
    var dayTitleRow = rows.length + 1;

    rows.push([dayId + "日目"]);
    dayTitleRows.push(dayTitleRow);

    if (!range) {
      headerRows.push(rows.length + 1);
      rows.push(["班"]);
      rows.push(["未作成"]);
      rows.push([]);
      return;
    }

    var slots = buildTimeSlots_(range.start, range.end);
    var headerRow = rows.length + 1;
    headerRows.push(headerRow);
    rows.push(["班"].concat(slots.map(function(minute) {
      return minute % 30 === 0 ? minutesToTime_(minute) : "";
    })));

    GROUP_NUMBERS.forEach(function(groupNumber) {
      var rowNumber = rows.length + 1;
      var row = [groupNumber + "班"];
      for (var slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        row.push("");
      }

      var schedule = daySchedules[groupNumber] || [];
      schedule.forEach(function(item) {
        var startIndex = Math.max(0, Math.floor((item.arrivalMinute - range.start) / TIMELINE_STEP_MINUTES));
        var endIndex = Math.min(slots.length, Math.ceil((item.departureMinute - range.start) / TIMELINE_STEP_MINUTES));

        if (endIndex <= startIndex) {
          endIndex = Math.min(slots.length, startIndex + 1);
        }

        if (endIndex <= startIndex || startIndex >= slots.length) {
          return;
        }

        var startColumn = startIndex + 2;
        var columnSpan = endIndex - startIndex;
        row[startColumn - 1] = item.name;
        barRanges.push({
          row: rowNumber,
          column: startColumn,
          columns: columnSpan,
          type: getTimelineItemType_(item.name),
        });
      });

      rows.push(row);
    });

    GROUP_NUMBERS.forEach(function(groupNumber) {
      var schedule = daySchedules[groupNumber] || [];
      schedule.forEach(function(item, index) {
        detailRows.push([
          dayId + "日目",
          groupNumber,
          index + 1,
          item.name,
          minutesToTime_(item.arrivalMinute),
          minutesToTime_(item.departureMinute),
          item.isStart ? "" : item.stayTime,
          item.isStart ? "" : item.travelTime,
          item.isStart ? "出発地" : item.travelMode
        ]);
      });
    });

    rows.push([]);
  });

  rows.push(["詳細"]);
  rows.push(["日", "班", "番号", "場所", "到着", "出発", "滞在分", "移動分", "移動手段"]);
  rows = rows.concat(detailRows);

  timelineSheet.getRange(1, 1, timelineSheet.getMaxRows(), timelineSheet.getMaxColumns()).breakApart();
  timelineSheet.clearContents();
  timelineSheet.clearFormats();
  var maxColumnCount = Math.max.apply(null, rows.map(function(row) { return row.length; }));
  ensureSheetSize_(timelineSheet, rows.length, maxColumnCount);
  timelineSheet.getRange(1, 1, rows.length, maxColumnCount).setValues(padRows_(rows));
  formatTimelineSheet_(timelineSheet, rows.length, barRanges, headerRows, dayTitleRows);

  return ContentService
    .createTextOutput(JSON.stringify({
      status: "success",
      message: "timeline updated",
      updatedAt: generatedAt,
      rows: rows.length
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildDaySchedules_(allData, dayId) {
  var result = {};

  allData.forEach(function(group) {
    var groupNumber = normalizeGroupNumber_(group.groupNumber);
    var daysData = group.data || [];
    var dayData = null;

    for (var i = 0; i < daysData.length; i++) {
      if (Number(daysData[i].id) === Number(dayId)) {
        dayData = daysData[i];
        break;
      }
    }

    result[groupNumber] = buildSchedule_(dayData);
  });

  return result;
}

function buildSchedule_(dayData) {
  if (!dayData || !dayData.destinations || dayData.destinations.length === 0) {
    return [];
  }

  var currentMinute = timeToMinutes_(dayData.startTime || "09:00");

  return dayData.destinations.map(function(dest, index) {
    var isStart = index === 0;
    var travelTime = isStart ? 0 : Number(dest.travelTime || 0);
    var stayTime = isStart ? 0 : Number(dest.stayTime || 0);
    var savedArrivalMinute = isValidTime_(dest.arrivalTime) ? timeToMinutes_(dest.arrivalTime) : null;
    var savedDepartureMinute = isValidTime_(dest.departureTime) ? timeToMinutes_(dest.departureTime) : null;
    var arrivalMinute = savedArrivalMinute !== null ? savedArrivalMinute : currentMinute + travelTime;
    var departureMinute = savedDepartureMinute !== null ? savedDepartureMinute : arrivalMinute + stayTime;

    if (departureMinute < arrivalMinute) {
      departureMinute = arrivalMinute;
    }

    currentMinute = departureMinute;

    return {
      name: dest.name || "",
      travelMode: getTravelModeName_(dest.travelMode),
      travelTime: travelTime,
      stayTime: stayTime,
      arrivalMinute: arrivalMinute,
      departureMinute: departureMinute,
      isStart: isStart
    };
  });
}

function getDayMinuteRange_(daySchedules) {
  var minMinute = timeToMinutes_(TIMELINE_DEFAULT_START);
  var maxMinute = timeToMinutes_(TIMELINE_DEFAULT_END);
  var hasItem = false;

  GROUP_NUMBERS.forEach(function(groupNumber) {
    var schedule = daySchedules[groupNumber] || [];
    schedule.forEach(function(item) {
      hasItem = true;
      if (minMinute === null || item.arrivalMinute < minMinute) {
        minMinute = item.arrivalMinute;
      }
      if (maxMinute === null || item.departureMinute > maxMinute) {
        maxMinute = item.departureMinute;
      }
    });
  });

  if (!hasItem || minMinute === null || maxMinute === null) {
    return null;
  }

  return {
    start: Math.floor(minMinute / TIMELINE_STEP_MINUTES) * TIMELINE_STEP_MINUTES,
    end: Math.ceil(maxMinute / TIMELINE_STEP_MINUTES) * TIMELINE_STEP_MINUTES
  };
}

function buildTimeSlots_(startMinute, endMinute) {
  var slots = [];

  for (var minute = startMinute; minute < endMinute; minute += TIMELINE_STEP_MINUTES) {
    slots.push(minute);
  }

  return slots;
}

function formatTimelineSheet_(sheet, rowCount, barRanges, headerRows, dayTitleRows) {
  var maxColumns = sheet.getLastColumn();
  sheet.setFrozenRows(3);
  sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 56);
  if (maxColumns > 1) {
    sheet.setColumnWidths(2, maxColumns - 1, 34);
  }
  sheet.setRowHeights(1, rowCount, 34);
  sheet.getRange(1, 1, rowCount, maxColumns).setVerticalAlignment("middle");
  sheet.getRange(1, 1, rowCount, maxColumns).setHorizontalAlignment("center");
  sheet.getRange(1, 1, rowCount, maxColumns).setWrap(true);
  sheet.getRange(1, 1, rowCount, maxColumns).setBorder(true, true, true, true, true, true, "#d1d5db", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#e0f2fe");

  headerRows.forEach(function(rowNumber) {
    sheet.getRange(rowNumber, 1, 1, maxColumns).setFontWeight("bold").setBackground("#f8fafc");
  });

  dayTitleRows.forEach(function(rowNumber) {
    sheet.getRange(rowNumber, 1, 1, maxColumns).setFontWeight("bold").setBackground("#dbeafe").setHorizontalAlignment("left");
  });

  barRanges.forEach(function(bar) {
    var range = sheet.getRange(bar.row, bar.column, 1, bar.columns);
    if (bar.columns > 1) {
      range.mergeAcross();
    }
    range
      .setBackground(bar.type === "meal" ? "#f4b183" : "#c6e0b4")
      .setFontWeight("bold")
      .setBorder(true, true, true, true, false, false, "#6b7280", SpreadsheetApp.BorderStyle.SOLID)
      .setHorizontalAlignment("center");
  });
}

function getTimelineItemType_(name) {
  return /昼食|ランチ|食事|カフェ|喫茶|ごはん|ご飯|弁当/.test(String(name || "")) ? "meal" : "place";
}

function padRows_(rows) {
  var maxLength = Math.max.apply(null, rows.map(function(row) { return row.length; }));
  return rows.map(function(row) {
    var padded = row.slice();
    while (padded.length < maxLength) {
      padded.push("");
    }
    return padded;
  });
}

function ensureSheetSize_(sheet, rowCount, columnCount) {
  if (sheet.getMaxRows() < rowCount) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
  }

  if (sheet.getMaxColumns() < columnCount) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columnCount - sheet.getMaxColumns());
  }
}

function normalizeGroupNumber_(value) {
  if (value === "admin") {
    return value;
  }

  var text = String(value || "").trim();
  if (/^\d+$/.test(text)) {
    return text.padStart(2, "0");
  }

  return text;
}

function timeToMinutes_(timeString) {
  var parts = String(timeString || "00:00").split(":");
  return Number(parts[0] || 0) * 60 + Number(parts[1] || 0);
}

function isValidTime_(timeString) {
  return /^\d{1,2}:\d{2}$/.test(String(timeString || ""));
}

function minutesToTime_(minutes) {
  var normalized = ((Number(minutes) % 1440) + 1440) % 1440;
  var hours = Math.floor(normalized / 60);
  var mins = normalized % 60;
  return String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0");
}

function getTravelModeName_(mode) {
  if (mode === "WALKING") return "徒歩";
  if (mode === "BUS") return "バス";
  if (mode === "TRAIN") return "電車";
  return "";
}
