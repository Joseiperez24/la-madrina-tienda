// ═══════════════════════════════════════════════════════════
//  La Madrina Forrajería — Script para Google Sheets
//
//  INSTRUCCIONES:
//  1. Abrí tu Google Sheet de stock
//  2. Extensiones → Apps Script
//  3. Pegá este código completo y guardá
//  4. Recargá el Sheet → aparece menú "La Madrina"
//  5. Hacé clic en "La Madrina → Sincronizar Stock"
//
//  CONFIGURACIÓN: cambiá las dos constantes de abajo.
// ═══════════════════════════════════════════════════════════

// URL de tu sitio (sin slash final)
const ENDPOINT = 'https://TU-SITIO.vercel.app/api/sync-stock';

// Mismo valor que SYNC_SECRET en tu .env
const SECRET = 'PEGAR_AQUI_TU_SYNC_SECRET';

// ── Menú en Google Sheets ────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('La Madrina')
    .addItem('Sincronizar Stock →  Web', 'sincronizarStock')
    .addItem('Cargar productos (primera vez)', 'cargarProductosIniciales')
    .addToUi();
}

// ── Sincronizar Stock → Web ──────────────────────────────
function sincronizarStock() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Stock')
    || SpreadsheetApp.getActiveSheet();
  const data  = sheet.getDataRange().getValues();

  if (data.length < 2) {
    SpreadsheetApp.getUi().alert('La planilla está vacía. Usá "Cargar productos" primero.');
    return;
  }

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const [id, nombre, stock, disponible] = data[i];
    if (!id) continue;
    rows.push({
      id:         String(id).trim(),
      nombre:     String(nombre || '').trim(),
      stock:      Number(stock) >= -1 ? Number(stock) : -1,
      disponible: disponible === true || String(disponible).toLowerCase() === 'true',
    });
  }

  if (!rows.length) {
    SpreadsheetApp.getUi().alert('No hay filas con ID para sincronizar.');
    return;
  }

  const options = {
    method:      'post',
    contentType: 'application/json',
    headers:     { Authorization: 'Bearer ' + SECRET },
    payload:     JSON.stringify({ rows }),
    muteHttpExceptions: true,
  };

  let result;
  try {
    const response = UrlFetchApp.fetch(ENDPOINT, options);
    result = JSON.parse(response.getContentText());
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error de red: ' + e.message);
    return;
  }

  if (result && result.ok) {
    SpreadsheetApp.getUi().alert('✓ Stock actualizado correctamente.\n' + result.updated + ' productos sincronizados.');
  } else {
    SpreadsheetApp.getUi().alert('Error del servidor:\n' + (result && result.error ? result.error : 'Respuesta inesperada'));
  }
}

// ── Cargar productos iniciales en la planilla ────────────
// Solo necesario la primera vez para tener la lista completa.
function cargarProductosIniciales() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert('¿Sobreescribir la planilla con la lista completa de productos?', ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Stock');
  if (!sheet) sheet = ss.insertSheet('Stock');

  sheet.clearContents();

  // Encabezados
  const headers = [['ID', 'Nombre', 'Stock', 'Disponible']];
  sheet.getRange(1, 1, 1, 4).setValues(headers)
    .setFontWeight('bold')
    .setBackground('#1a4a1a')
    .setFontColor('#f8f4ec');

  // Todos los productos con sus IDs estables
  const productos = [
    // ── MASCOTAS ─────────────────────────────────────────
    ['cooperacion_0', 'Cooperación — Cachorros Carne 15kg',           -1, true],
    ['cooperacion_1', 'Cooperación — Perros Adultos Carne 20kg',      -1, true],
    ['cooperacion_2', 'Cooperación — Perros Adultos Pollo 20kg',      -1, true],
    ['cooperacion_3', 'Cooperación — Gatos Adultos Pescado 10kg',     -1, true],
    ['cooperacion_4', 'Cooperación — Gatos Adultos Pollo 10kg',       -1, true],
    ['petlink_0',     'PetLink — Perros Adultos Med/Grandes 20+2kg',  -1, true],
    ['petlink_1',     'PetLink — Perros Adultos Peq/Mini 15kg',       -1, true],
    ['petlink_2',     'PetLink — Perros Cachorros 10kg',              -1, true],
    ['petlink_3',     'PetLink — Gatos Adultos Indoor 8kg',           -1, true],
    ['valor_0',       'Valor — Perros Med/Grandes Carne 18kg',        -1, true],
    ['valor_1',       'Valor — Perros Peq/Mini Pollo 10kg',           -1, true],
    ['valor_2',       'Valor — Perros Med/Grandes Cordero 15+3kg',    -1, true],
    ['valor_3',       'Valor — Perros Peq/Mini Cordero 10kg',         -1, true],
    ['valor_4',       'Valor — Perros Cachorros Carne+Pollo 10kg',    -1, true],
    ['valor_5',       'Valor — Gatos Adultos Pescado 8kg',            -1, true],
    ['valor_6',       'Valor — Gatos Adultos Urinary Pollo 8kg',      -1, true],
    ['valor_7',       'Valor — Gatitos Kitten Pescado 8kg',           -1, true],
    // ── CAMPO ────────────────────────────────────────────
    ['campo_aves_0',     'Vitosan — Parrillero Iniciador 25kg',       -1, true],
    ['campo_aves_1',     'Vitosan — Parrillero Terminador 25kg',      -1, true],
    ['campo_aves_2',     'Vitosan — Gallina Ponedora 25kg',           -1, true],
    ['campo_aves_3',     'Vitosan — Gallina Recría 25kg',             -1, true],
    ['campo_cerdos_0',   'Vitosan — Cerdo Iniciador 25kg',            -1, true],
    ['campo_cerdos_1',   'Vitosan — Cerdo Desarrollo 25kg',           -1, true],
    ['campo_cerdos_2',   'Vitosan — Cerdo Terminador 25kg',           -1, true],
    ['campo_cerdos_3',   'Vitosan — Cerda Lactancia 25kg',            -1, true],
    ['campo_cerdos_4',   'Vitosan — Cerda Gestación 25kg',            -1, true],
    ['campo_equinos_0',  'Vitosan — Equino Potrillo 25kg',            -1, true],
    ['campo_equinos_1',  'Vitosan — Equino Training 25kg',            -1, true],
    ['campo_caprinos_0', 'Vitosan — Caprino 25kg',                    -1, true],
    ['campo_conejos_0',  'Vitosan — Conejo Engorde 25kg',             -1, true],
    // ── FORRAJES ──────────────────────────────────────────
    ['forrajes_0', 'Fardos de alfalfa',   -1, true],
    ['forrajes_1', 'Rollos de alfalfa',   -1, true],
    ['forrajes_2', 'Avena',               -1, true],
    ['forrajes_3', 'Maíz partido',        -1, true],
    // ── CAMAS ─────────────────────────────────────────────
    ['camas_0', 'Bolsas de viruta',         0, false],
    ['camas_1', 'Rollos de paja de trigo',  0, false],
    // ── TALABARTERÍA ──────────────────────────────────────
    ['talabarteria_0',  'Bozal de cuero crudo artesanal',    0, false],
    ['talabarteria_1',  'Bozal de suela',                    0, false],
    ['talabarteria_2',  'Bozal de hilo trenzado',            0, false],
    ['talabarteria_3',  'Bozal de material sintético',       0, false],
    ['talabarteria_4',  'Bozal de hebilla',                  0, false],
    ['talabarteria_5',  'Freno de hierro',                   0, false],
    ['talabarteria_6',  'Freno de acero inoxidable',         0, false],
    ['talabarteria_7',  'Cabezada de cuero crudo artesanal', 0, false],
    ['talabarteria_8',  'Cabezada de suela',                 0, false],
    ['talabarteria_9',  'Lazo de cuero crudo artesanal',     0, false],
    ['talabarteria_10', 'Mandil de lana',                    0, false],
    ['talabarteria_11', 'Bajera de lona',                    0, false],
  ];

  sheet.getRange(2, 1, productos.length, 4).setValues(productos);

  // Formato columna Stock: número
  sheet.getRange(2, 3, productos.length, 1).setNumberFormat('0');
  // Ancho de columnas
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 380);
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 100);

  // Nota al pie
  sheet.getRange(productos.length + 3, 1).setValue(
    'Stock: -1 = sin límite (siempre disponible)  |  0 = sin stock  |  5 = últimas 5 unidades'
  ).setFontStyle('italic').setFontColor('#888');

  SpreadsheetApp.getUi().alert(
    '✓ Planilla cargada con ' + productos.length + ' productos.\n\n' +
    'Instrucciones:\n' +
    '• Columna C (Stock): -1 = disponible sin límite, 0 = sin stock, número = unidades\n' +
    '• Columna D (Disponible): TRUE / FALSE\n\n' +
    'Cuando actualices los valores, usá "Sincronizar Stock → Web".'
  );
}
