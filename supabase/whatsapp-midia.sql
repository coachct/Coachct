-- Anexos (mídia) nas conversas de WhatsApp.
-- Colunas aditivas em whatsapp_mensagens para guardar a referência do arquivo
-- (o binário fica no Storage, bucket privado "whatsapp-midia"; aqui só o ponteiro).
-- Idempotente: pode rodar mais de uma vez sem erro.

alter table whatsapp_mensagens
  add column if not exists midia_tipo text,   -- 'image' | 'document' | 'audio' | 'video' | 'sticker'
  add column if not exists midia_path text,   -- caminho no bucket whatsapp-midia
  add column if not exists midia_nome text,   -- nome original do arquivo (documentos)
  add column if not exists midia_mime text;   -- content-type
