// === Google Apps Script для Telegram-бота (электрик) ===
// Версия: 2.0 (с автоматическим созданием листов по месяцам)

const SPREADSHEET_ID = '1_-bEiCtB1WMvRv0d2sNfsrAxzCdoaI-rTjOCDpjsFBo';
const TELEGRAM_TOKEN = '8867456785:AAEkO0csRdzfR5TlheLPRTEQKyquhRlGKs8';
const TEMPLATE_NAME = 'Шаблон_Расчёт';
const ROUTE_NAME = 'Маршрут';

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'createMonth') {
    return createMonthSheet_();
  }
  
  if (action === 'getRoute') {
    return getRoute_();
  }
  
  if (action === 'savePhoto') {
    return savePhoto_(e.parameter);
  }
  
  return ContentService.createTextOutput('Неизвестное действие: ' + action);
}

function getRoute_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ROUTE_NAME);
  const data = sheet.getDataRange().getValues();
  
  // Пропускаем заголовок, возвращаем [№, Помещение, № счетчика, Ссылка на фото, Строка в шаблоне]
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === '' || row[0] === 'КОНЕЦ') continue;
    rows.push({
      number: row[0],
      room: row[1],
      meter: row[2],
      photoLink: row[6] || '',
      sheetRow: i + 1 // строка в листе (Google Sheets индексирует с 1)
    });
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    route: rows,
    total: rows.length
  })).setMimeType(ContentService.MimeType.JSON);
}

function createMonthSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Определяем текущий месяц и год
  const now = new Date();
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const monthName = monthNames[now.getMonth()];
  const year = now.getFullYear();
  const sheetName = 'Расчёт_' + monthName + '_' + year;
  
  // Проверяем, не создан ли уже такой лист
  const existingSheet = ss.getSheetByName(sheetName);
  if (existingSheet) {
    // Если уже существует, просто очищаем колонку "Новое" (чтобы начать заново)
    const lastRow = existingSheet.getLastRow();
    if (lastRow > 1) {
      existingSheet.getRange('F2:F' + lastRow).clearContent();
    }
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      sheetName: sheetName,
      message: 'Лист уже существует. Очищены новые показания.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Копируем шаблон
  const templateSheet = ss.getSheetByName(TEMPLATE_NAME);
  if (!templateSheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Шаблон не найден! Убедитесь что лист "' + TEMPLATE_NAME + '" существует.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const newSheet = templateSheet.copyTo(ss);
  newSheet.setName(sheetName);
  
  // Перемещаем лист в начало
  ss.setActiveSheet(newSheet);
  ss.moveActiveSheet(1);
  
  // Получаем данные из "Маршрут" для заполнения колонок A, B, C
  const routeSheet = ss.getSheetByName(ROUTE_NAME);
  const routeData = routeSheet.getDataRange().getValues();
  
  // Заполняем новый лист: колонки A, B, C - из маршрута
  let writeRow = 2; // начинаем с 2 строки (1 - заголовок)
  
  for (let i = 1; i < routeData.length; i++) {
    const row = routeData[i];
    if (row[0] === '' || row[0] === 'КОНЕЦ') continue;
    
    newSheet.getRange(writeRow, 1).setValue(row[0]); // №
    newSheet.getRange(writeRow, 2).setValue(row[1]); // Помещение
    newSheet.getRange(writeRow, 3).setValue(row[2]); // № счетчика
    
    // Переносим старое значение из колонки D маршрута (старые показания)
    if (row[3] && row[3] !== '') {
      newSheet.getRange(writeRow, 5).setValue(row[3]); // колонка E = Старое
    }
    
    writeRow++;
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    sheetName: sheetName,
    message: 'Лист "' + sheetName + '" создан из шаблона. Старые показания перенесены.'
  })).setMimeType(ContentService.MimeType.JSON);
}

function savePhoto_(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Определяем текущий лист расчёта
  const now = new Date();
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const monthName = monthNames[now.getMonth()];
  const year = now.getFullYear();
  const sheetName = 'Расчёт_' + monthName + '_' + year;
  
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Лист "' + sheetName + '" не найден. Сначала нажмите /start'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const rowNumber = parseInt(params.row);
  const photoUrl = params.photoUrl;
  const meterReading = params.meterReading;
  
  // Сохраняем показания в колонку F (Новое)
  // Заменяем точку на запятую для Excel
  let readingValue = meterReading;
  if (readingValue && readingValue !== '') {
    readingValue = readingValue.replace('.', ',');
    // Преобразуем в число
    const numValue = parseFloat(readingValue);
    if (!isNaN(numValue)) {
      sheet.getRange(rowNumber, 6).setValue(numValue); // колонка F = Новое
    } else {
      sheet.getRange(rowNumber, 6).setValue(readingValue); // если не число, пишем как текст
    }
  }
  
  // Сохраняем ссылку на фото в колонку G (или в "Маршрут")
  if (photoUrl && photoUrl !== '') {
    const routeSheet = ss.getSheetByName(ROUTE_NAME);
    // Находим строку в маршруте по номеру помещения
    const routeData = routeSheet.getDataRange().getValues();
    for (let i = 1; i < routeData.length; i++) {
      if (routeData[i][0] == rowNumber) {
        routeSheet.getRange(i + 1, 7).setValue(photoUrl); // колонка G
        break;
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Показания и фото сохранены'
  })).setMimeType(ContentService.MimeType.JSON);
}

// Функция для проверки структуры (вызвать из редактора)
function testStructure() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  let result = 'Листы:\n';
  sheets.forEach(s => result += '- ' + s.getName() + '\n');
  
  const routeSheet = ss.getSheetByName(ROUTE_NAME);
  if (routeSheet) {
    result += '\nМаршрут: ' + routeSheet.getLastRow() + ' строк, ' + routeSheet.getLastColumn() + ' колонок\n';
    const headers = routeSheet.getRange(1, 1, 1, routeSheet.getLastColumn()).getValues()[0];
    result += 'Заголовки: ' + headers.join(' | ');
  }
  
  const templateSheet = ss.getSheetByName(TEMPLATE_NAME);
  if (templateSheet) {
    result += '\n\nШаблон: ' + templateSheet.getLastRow() + ' строк, ' + templateSheet.getLastColumn() + ' колонок';
  }
  
  return result;
}
