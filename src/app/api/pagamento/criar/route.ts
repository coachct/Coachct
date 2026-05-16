// PIX — mostra QR Code
if (metodo === 'pix' && data.pix?.qr_code) {
  setPixQrCode(data.pix.qr_code)
  setPixQrCodeUrl(data.pix.qr_code_url)
  setPixExpiraEm(data.pix.expira_em)
  setEtapa('pagamento')
  return
}

// Fallback
router.push(`/comprar/sucesso?produto=${produtoId}&metodo=${metodo}&pagamento=${data.pagamento_id}`)
