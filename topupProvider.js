async function requestTopUp({ order_id, diamonds, player_uid, server_id }) {
  const mode = process.env.TOPUP_PROVIDER_MODE || 'manual';
  if (mode !== 'auto') {
    return { ok: true, mode: 'manual', message: 'Order queued — awaiting admin fulfillment. No API configured.', provider: 'manual' };
  }
  return { ok: true, mode: 'manual', message: 'Provider not configured. Falling back to manual.', provider: 'manual' };
}
module.exports = { requestTopUp };
