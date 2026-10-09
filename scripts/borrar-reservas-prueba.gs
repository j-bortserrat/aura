// Pégalo en el MISMO proyecto de Apps Script de las reservas (junto a apps-script-reservas.gs)
// y ejecuta borrarReservasPrueba() una vez. Borra las reservas de prueba: nombre que empieza por
// "Test" o "Timing", o fecha en 2099. Libera la mesa, borra el evento del calendario y la fila.
function borrarReservasPrueba() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reservas');
  const datos = sh.getDataRange().getValues();
  const h = datos[0].map(String);
  const iNombre = h.indexOf('nombre'), iFecha = h.indexOf('fecha');
  const iEvento = h.indexOf('calendar_event_id'), iToken = h.indexOf('token_cancelacion');
  let borradas = 0;
  for (let i = datos.length - 1; i >= 1; i--) { // de abajo arriba para no descolocar filas
    const f = datos[i];
    const nombre = String(f[iNombre]), fecha = String(f[iFecha]);
    if (!/^(Test|Timing)/i.test(nombre) && !fecha.startsWith('2099')) continue;
    const token = String(f[iToken] || '');
    let liberada = false;
    if (token) liberada = cancelarReservaPorToken_(token).ok; // libera mesa + borra evento
    if (!liberada && f[iEvento]) {
      try { const ev = CalendarApp.getEventById(String(f[iEvento])); if (ev) ev.deleteEvent(); } catch (e) {}
    }
    sh.deleteRow(i + 1);
    borradas++;
  }
  // limpia el estado de las fechas de 2099 por si quedó algo
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).filter(k => k.startsWith('reservas_2099')).forEach(k => props.deleteProperty(k));
  Logger.log('Reservas de prueba borradas: ' + borradas);
}
