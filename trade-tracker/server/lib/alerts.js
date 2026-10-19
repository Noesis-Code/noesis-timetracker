// Alertes de sécurité vers TMT (notification push, adressage ?notif=trade) : connexion, nouvel appareil, jeton courtier modifié/supprimé,
// échecs d'authentification répétés, code de secours utilisé. Même canal signé HMAC que les événements d'achat (table events, type 'security').
// Le message n'embarque AUCUNE donnée financière ni secret : seulement { type, kind, userId (id TMT), occurredAt }.
const { notifyPending } = require('./notifier');

const KINDS = ['login', 'new_device', 'broker_token_set', 'broker_token_replaced', 'broker_token_deleted', 'auth_failures', 'backup_code'];

// Retourne onAlert(userId (id Trade), kind) : enregistre l'événement puis tente l'envoi tout de suite (sans bloquer la requête).
function createAlerter(db, notifier, { now = () => Date.now(), onError = (e) => console.warn('[trade-tracker] alerte :', e.message) } = {}) {
  return function onAlert(userId, kind) {
    try {
      if (!KINDS.includes(kind)) return null;
      const u = db.prepare('SELECT tmtUserId FROM tt_users WHERE id = ?').get(userId);
      if (!u) return null;
      const next = db.prepare("SELECT COALESCE(MAX(transactionId), 0) + 1 AS n FROM events WHERE type = 'security'").get().n;
      const payload = JSON.stringify({ type: 'security', kind, userId: u.tmtUserId, occurredAt: new Date(now()).toISOString() });
      const r = db.prepare("INSERT INTO events (type, userId, transactionId, payload) VALUES ('security', ?, ?, ?)").run(userId, next, payload);
      Promise.resolve(notifyPending(db, notifier)).catch(onError);
      return Number(r.lastInsertRowid);
    } catch (e) { onError(e); return null; }
  };
}

module.exports = { KINDS, createAlerter };
