const getDb = require('../database');
const { appendMarketingRow } = require('../routes/marketing');
const { logAction } = require('../routes/logs');

const TZ = 'America/Argentina/Buenos_Aires';

function argentinaStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function sheetDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
}

function safeError(err) {
  return String(err && err.message || 'No se pudo publicar en Google Sheets.').slice(0, 300);
}

let running = false;

async function runScheduledPublications(now = new Date()) {
  if (running) return { skipped: true };
  running = true;
  const stamp = argentinaStamp(now);
  try {
    const db = await getDb();
    const due = await db.all(
      `SELECT * FROM publicaciones_programadas
       WHERE estado = 'pendiente' AND programada_para <= ?
       ORDER BY programada_para, id LIMIT 50`, [stamp]
    );

    let published = 0;
    let failed = 0;
    for (const row of due) {
      const claim = await db.run(`UPDATE publicaciones_programadas SET estado = 'procesando' WHERE id = ? AND estado = 'pendiente'`, [row.id]);
      if (!claim.rowCount) continue;
      try {
        const result = await appendMarketingRow({
          fecha: sheetDate(row.fecha),
          grupo: row.grupo,
          zona: row.zona,
          grupoFila: row.grupo_fila,
          publicaciones: row.publicaciones,
          visualizaciones: row.visualizaciones,
          interacciones: row.interacciones,
          comentarios: row.comentarios,
          mensajes: row.mensajes,
          estatus: row.estatus
        });
        await db.run(
          `UPDATE publicaciones_programadas
           SET estado = 'publicada', fila_origen = ?, publicada_en = ?, ultimo_error = '', intentos = intentos + 1
           WHERE id = ? AND estado = 'procesando'`,
          [result.rowIndex || 0, stamp, row.id]
        );
        await logAction(row.user_id, row.email || '', 'Publicación programada ejecutada',
          `Grupo: ${row.grupo}, Sucursal: ${row.zona}, Fecha: ${sheetDate(row.fecha)}`, row.ip || '');
        published++;
      } catch (err) {
        failed++;
        try {
          await db.run(
            `UPDATE publicaciones_programadas
             SET estado = 'pendiente', intentos = intentos + 1, ultimo_error = ?
             WHERE id = ? AND estado = 'procesando'`,
            [safeError(err), row.id]
          );
        } catch (updateErr) {
          console.error('No se pudo registrar el error de la publicación programada:', updateErr.message);
        }
      }
    }
    return { checked: due.length, published, failed, now: stamp };
  } finally {
    running = false;
  }
}

module.exports = { runScheduledPublications, argentinaStamp };
