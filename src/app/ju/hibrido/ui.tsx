// Peças visuais do esboço (tema escuro + rosa) compartilhadas pelas telas do híbrido.

export const cls = {
  titulo: 'font-[family-name:var(--font-grotesk)]',
  card: 'bg-[#18181c] border border-[#2a2a31] rounded-2xl',
  input:
    'min-h-[44px] px-3 rounded-[10px] border border-[#3a3a42] bg-[#0e0e11] text-[#f2f2f4] outline-none focus:border-[#ff2d9b] w-full min-w-0',
  inputTabela:
    'min-h-[36px] px-2 rounded-lg border border-transparent hover:border-[#3a3a42] focus:border-[#ff2d9b] bg-transparent text-[#f2f2f4] outline-none w-full min-w-0',
  label: 'flex flex-col gap-1.5 text-[#a1a1aa] text-xs',
  btn:
    'min-h-[44px] px-4 rounded-[10px] border border-[#3a3a42] bg-[#18181c] text-[#f2f2f4] hover:border-[#5a5a64] disabled:opacity-40 disabled:cursor-not-allowed',
  btnRosa:
    'min-h-[44px] px-5 rounded-[10px] bg-[#ff2d9b] text-[#1a0010] font-semibold hover:bg-[#ff4fab] disabled:opacity-40 disabled:cursor-not-allowed',
  btnTracejado:
    'self-start min-h-[44px] px-3.5 rounded-[10px] border border-dashed border-[#4a4a54] bg-transparent text-[#d4d4d8] hover:border-[#6a6a74]',
  btnIcone:
    'w-9 h-9 inline-flex items-center justify-center rounded-lg border border-[#3a3a42] text-[#d4d4d8] hover:border-[#5a5a64] disabled:opacity-30',
  muted: 'text-[#a1a1aa]',
  seloVerde: 'px-2.5 py-1.5 rounded-full bg-[#0f2a1e] text-[#7ff0bd] text-xs font-medium',
  seloVermelho: 'px-2.5 py-1.5 rounded-full bg-[#3a0f16] text-[#ff8a9a] text-xs font-medium',
  seloCinza: 'px-2.5 py-1.5 rounded-full bg-[#222228] text-[#d4d4d8] text-xs',
}

export function Modal({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`${cls.card} w-full max-w-sm p-6 text-[#f2f2f4] text-sm`}
        style={{ colorScheme: 'dark' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`${cls.titulo} text-lg font-semibold m-0`}>{titulo}</h2>
          <button onClick={onClose} aria-label="Fechar" className="w-10 h-10 -mr-2 text-[#a1a1aa] text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
